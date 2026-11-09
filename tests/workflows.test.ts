import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import Stripe from 'stripe';
import { Secret, TOTP } from 'otpauth';

// All records, keys, and webhook events here are fictional local fixtures.
// No Stripe API, identity provider, scanner, or monitoring service is contacted.
test('application API workflows use protected sessions, durable records, and verified events', { timeout: 180_000 }, async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'clinic-workflows-'));
  const portReservation = createServer();
  await new Promise<void>((resolve) => portReservation.listen(0, '127.0.0.1', resolve));
  const port = (portReservation.address() as { port: number }).port;
  await new Promise<void>((resolve) => portReservation.close(() => resolve()));
  const origin = `http://127.0.0.1:${port}`;
  const secret = new Secret({ size: 20 });
  const password = randomBytes(24).toString('hex');
  const webhookSecret = randomBytes(32).toString('hex');
  const environment = { ...process.env,
    CLINIC_ADMIN_EMAIL: 'test-admin@example.invalid', CLINIC_ADMIN_PASSWORD: password,
    CLINIC_SESSION_SECRET: randomBytes(32).toString('hex'), CLINIC_ADMIN_TOTP_SECRET: secret.base32,
    CLINIC_AUTH_DB_PATH: path.join(root, 'auth.sqlite'), AUDIT_LOG_DB_PATH: path.join(root, 'audit.sqlite'),
    CLINIC_APPOINTMENTS_DB_PATH: path.join(root, 'appointments.sqlite'),
    CLINIC_LOGIN_RATE_LIMIT_DB_PATH: path.join(root, 'login-limits.sqlite'),
    KIOSK_RATE_LIMIT_DB_PATH: path.join(root, 'kiosk-limits.sqlite'), CLINIC_BACKUP_DIR: path.join(root, 'backups'),
    ENABLE_DEVELOPMENT_ADMIN_DEMO: 'false', ENABLE_DEVELOPMENT_INTEGRATION_SIMULATORS: 'true',
    STRIPE_WEBHOOK_SECRET: webhookSecret,
  };
  // Explicitly prevent inherited provider configuration from turning fixtures into external operations.
  for (const name of ['STRIPE_SECRET_KEY', 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', 'UBUNTU_HOST_HEALTH_URL', 'DATABASE_SERVER_HEALTH_URL', 'KIOSK_TRUSTED_IP_HEADER']) delete environment[name as keyof typeof environment];
  const child = spawn(process.execPath, [path.join(process.cwd(), 'node_modules/next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: process.cwd(), env: environment, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  });
  let output = '';
  child.stdout.on('data', (data) => { output = (output + data.toString()).slice(-4000); });
  child.stderr.on('data', (data) => { output = (output + data.toString()).slice(-4000); });
  let cookie = '';
  const request = (route: string, method = 'GET', body?: unknown, authenticated = false) => fetch(`${origin}${route}`, {
    method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(authenticated ? { Cookie: cookie } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30_000),
  });
  try {
    const started = Date.now();
    while (true) {
      try { if ((await request('/')).ok) break; } catch { /* Wait for the child we just started. */ }
      if (child.exitCode !== null || Date.now() - started > 40_000) throw new Error(`Test server did not start: ${output}`);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    await t.test('protected APIs reject anonymous requests and credential/OTP failures', async () => {
      for (const route of ['/api/system-status', '/api/audit-log', '/api/admin/patients', '/api/admin/staff', '/api/admin/appointments']) assert.equal((await request(route)).status, 403);
      assert.equal((await request('/api/clinic/session', 'POST', { email: environment.CLINIC_ADMIN_EMAIL, password: 'wrong', method: 'email', code: '000000' })).status, 401);
      assert.equal((await request('/api/clinic/session', 'POST', { email: environment.CLINIC_ADMIN_EMAIL, password, method: 'email' })).status, 401);
      const code = new TOTP({ secret, algorithm: 'SHA1', digits: 6, period: 30 }).generate();
      const response = await request('/api/clinic/session', 'POST', { email: environment.CLINIC_ADMIN_EMAIL, password, method: 'email', code });
      assert.equal(response.status, 200);
      assert.match(response.headers.get('set-cookie') ?? '', /HttpOnly/);
      cookie = response.headers.get('set-cookie')!.split(';')[0];
      assert.equal((await request('/api/clinic/session', 'POST', { email: environment.CLINIC_ADMIN_EMAIL, password, method: 'email', code })).status, 401);
      const tampered = await fetch(`${origin}/api/system-status`, { headers: { Cookie: `${cookie}.extra` } });
      assert.equal(tampered.status, 403);
    });
    await t.test('patient/staff administration and appointment mutations persist with a valid audit chain', async () => {
      const patient = await request('/api/admin/patients', 'POST', { firstName: 'Fictional', lastName: 'Patient', phone: '4085550199' }, true);
      assert.equal(patient.status, 201);
      assert.equal((await request('/api/admin/staff', 'POST', { name: 'Fictional Worker', role: 'Reception', hours: '09:00-17:00' }, true)).status, 201);
      const booking = { name: 'Fictional Patient', contact: '4085550199', date: '2099-01-01', time: '9:00 AM', practitioner: '李医生' };
      const response = await request('/api/appointments', 'POST', booking);
      assert.equal(response.status, 201);
      const { appointment } = await response.json();
      assert.equal((await request('/api/appointments', 'POST', booking)).status, 409);
      const availability = await (await request(`/api/appointments?${new URLSearchParams({ date: booking.date, practitioner: booking.practitioner })}`)).json();
      assert.deepEqual(availability, { unavailableTimes: ['9:00 AM'] });
      assert.equal((await request('/api/admin/appointments', 'PATCH', { id: appointment.id, date: booking.date, time: '9:30 AM', practitioner: booking.practitioner }, true)).status, 200);
      assert.equal((await request('/api/admin/appointments', 'DELETE', { id: appointment.id }, true)).status, 200);
      const listed = await (await request('/api/admin/appointments', 'GET', undefined, true)).json();
      assert.equal(listed.appointments.find((item: { id: string }) => item.id === appointment.id).status, 'cancelled');
      const audit = await (await request('/api/audit-log', 'GET', undefined, true)).json();
      assert.ok(JSON.stringify(audit).includes('Admin appointment canceled'));
      assert.equal(JSON.stringify(audit).includes('4085550199'), false, 'audit records exclude contact information');
    });
    await t.test('kiosk tokens are single use, and spoofed headers cannot bypass the common budget', async () => {
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      assert.equal((await request('/api/appointments', 'POST', { name: 'Fictional Patient', contact: '4085550199', date: today, time: '10:00 AM', practitioner: '李医生' })).status, 201);
      const lookup = await request('/api/kiosk/lookup', 'POST', { lastFour: '0199' });
      assert.equal(lookup.status, 200);
      const { appointment, checkInToken } = await lookup.json();
      assert.equal((await request('/api/kiosk/check-in', 'POST', { appointmentId: appointment.id, checkInToken })).status, 200);
      assert.equal((await request('/api/kiosk/check-in', 'POST', { appointmentId: appointment.id, checkInToken })).status, 403);
      for (let i = 0; i < 5; i++) {
        const response = await fetch(`${origin}/api/kiosk/lookup`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': `198.51.100.${i}` }, body: JSON.stringify({ lastFour: 'bad' }) });
        assert.equal(response.status, 400);
      }
      const blocked = await request('/api/kiosk/lookup', 'POST', { lastFour: '0199' });
      assert.equal(blocked.status, 429);
      assert.equal(blocked.headers.get('retry-after'), '60');
    });
    await t.test('missing Stripe configuration and unsigned webhook claims fail safely', async () => {
      assert.equal((await request('/api/system-status/stripe-test', 'POST', undefined, true)).status, 503);
      assert.equal((await request('/api/stripe/payment_intent', 'POST', { name: 'Fictional Learner', email: 'learner@example.invalid', topicId: 'fall-prevention' })).status, 503);
      assert.equal((await request('/api/stripe/webhook', 'POST', { type: 'payment_intent.succeeded' })).status, 400);
      const payload = JSON.stringify({ id: 'evt_local_fixture', object: 'event', type: 'unhandled.fixture', created: Math.floor(Date.now()/1000), livemode: false, data: { object: {} } });
      const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });
      const ignored = await fetch(`${origin}/api/stripe/webhook`, { method: 'POST', headers: { 'stripe-signature': signature }, body: payload });
      assert.equal(ignored.status, 200);
      assert.equal((await ignored.json()).ignored, true);
    });
    await t.test('locally signed webhook fixtures enroll matching registrations once and reject invalid signatures', async () => {
      const registrationId = '11223344-5566-4788-99aa-bbccddeeff00';
      const paymentIntentId = 'pi_localFixture';
      const source = `const imported = await import('./app/lib/auditStore.server.ts'); const { createPendingCeuEnrollment } = imported.default ?? imported; createPendingCeuEnrollment({registrationId:'${registrationId}',paymentIntentId:'${paymentIntentId}',topicId:'fall-prevention',learnerName:'Fictional Learner',learnerEmail:'learner@example.invalid'});`;
      await promisify(execFile)(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', source], { env: environment });
      const payload = JSON.stringify({ id: 'evt_local_signed_success', object: 'event', type: 'payment_intent.succeeded', created: Math.floor(Date.now()/1000), livemode: false, data: { object: { object:'payment_intent', id: paymentIntentId, currency:'usd', amount:9500, metadata:{topicId:'fall-prevention',registrationId} } } });
      const send = (signature: string) => fetch(`${origin}/api/stripe/webhook`, { method:'POST', headers:{'stripe-signature':signature}, body:payload });
      assert.equal((await send('invalid')).status, 400);
      const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });
      const accepted = await send(signature);
      assert.equal(accepted.status, 200);
      assert.equal((await accepted.json()).duplicate, false);
      assert.equal((await (await send(signature)).json()).duplicate, true);
      const database = new DatabaseSync(environment.AUDIT_LOG_DB_PATH, { readOnly:true });
      try {
        assert.equal(database.prepare('SELECT status FROM ceu_enrollments WHERE registration_id = ?').get(registrationId)?.status, 'enrolled');
        assert.equal(database.prepare('SELECT count(*) AS count FROM verified_stripe_events WHERE stripe_event_id = ?').get('evt_local_signed_success')?.count, 1);
      } finally { database.close(); }
    });
    await t.test('backup and restore commands produce verified snapshots without replacing working data', async () => {
      const run = promisify(execFile);
      const backedUp = await run('npm', ['run', 'backup'], { env: environment });
      assert.match(backedUp.stdout, /Backup and isolated restore verification passed/);
      const snapshot = path.join(environment.CLINIC_BACKUP_DIR, readdirSync(environment.CLINIC_BACKUP_DIR)[0]);
      const recovery = path.join(root, 'recovery');
      const restored = await run('npm', ['run', 'restore', '--', snapshot, recovery], { env: environment });
      assert.match(restored.stdout, /verification passed/);
      await assert.rejects(run('npm', ['run', 'restore', '--', snapshot, recovery], { env: environment }));
    });
    await t.test('status evidence distinguishes real operations, simulations, and missing providers', async () => {
      const simulation = await request('/api/system-status/integration-simulation', 'POST', { target: 'ubuntu-host', payload: { status: 'ok', component: 'ubuntu-host' } }, true);
      assert.equal(simulation.status, 200);
      const response = await request('/api/system-status', 'GET', undefined, true);
      assert.equal(response.status, 200);
      const status = await response.json();
      const byName = (name: string) => status.items.find((item: { name: string }) => item.name === name);
      assert.equal(byName('Admin sign-in -> server session').status, 'Connected');
      assert.equal(byName('Kiosk rate limiting -> shared abuse protection').status, 'Connected');
      assert.equal(byName('Application -> Ubuntu host health endpoint').status, 'Planned');
      assert.equal(byName('Demo NFC: ACR1252U / NTAG213 -> kiosk input').status, 'Partly Connected', 'format-only simulations do not establish a successful NFC tap');
      assert.equal(byName('Database -> backups and recovery').status, 'Partly Connected');
      assert.equal(byName('SQLite audit store and SHA-256 verifier').status, 'Connected');
      assert.equal(byName('Patient management -> durable records and audit').status, 'Connected');
      assert.equal(byName('Staff management -> durable records and audit').status, 'Connected');
      assert.equal(byName('Appointment changes -> shared storage and audit').status, 'Connected');
      assert.equal(JSON.stringify(status).includes(password), false);
      assert.equal(JSON.stringify(status).includes(secret.base32), false);
      assert.equal(JSON.stringify(status).includes(webhookSecret), false);
    });
  } finally {
    if (child.pid && child.exitCode === null) {
      const exited = new Promise((resolve) => child.once('exit', resolve));
      process.kill(-child.pid, 'SIGTERM');
      await exited;
    }
    rmSync(root, { recursive: true, force: true });
  }
});
