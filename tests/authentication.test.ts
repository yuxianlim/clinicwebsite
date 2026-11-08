import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { Secret, TOTP } from 'otpauth';
import { administratorAuthenticationConfigured, verifyAdministratorCredentials } from '../app/lib/adminAuthentication.server';

test('admin credentials require a valid second factor and reject replay across calls', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'clinic-auth-'));
  const names = ['CLINIC_ADMIN_EMAIL','CLINIC_ADMIN_PASSWORD','CLINIC_ADMIN_TOTP_SECRET','CLINIC_SESSION_SECRET','CLINIC_AUTH_DB_PATH'];
  const previous = new Map(names.map((name) => [name, process.env[name]]));
  const secret = new Secret({ size: 20 });
  const password = randomBytes(24).toString('hex');
  Object.assign(process.env, {
    CLINIC_ADMIN_EMAIL: 'test-admin@example.invalid', CLINIC_ADMIN_PASSWORD: password,
    CLINIC_ADMIN_TOTP_SECRET: secret.base32, CLINIC_SESSION_SECRET: randomBytes(32).toString('hex'),
    CLINIC_AUTH_DB_PATH: path.join(root, 'auth.sqlite'),
  });
  const now = 1_800_000_000_000;
  const totp = new TOTP({ secret, digits: 6, algorithm: 'SHA1', period: 30 });
  const code = totp.generate({ timestamp: now });
  try {
    assert.equal(administratorAuthenticationConfigured(), true);
    assert.equal(verifyAdministratorCredentials('test-admin@example.invalid', 'wrong', code, now), false);
    assert.equal(verifyAdministratorCredentials('other@example.invalid', password, code, now), false);
    assert.equal(verifyAdministratorCredentials('test-admin@example.invalid', password, '', now), false);
    assert.equal(verifyAdministratorCredentials('test-admin@example.invalid', password, totp.generate({ timestamp: now - 120_000 }), now), false);
    assert.equal(verifyAdministratorCredentials('test-admin@example.invalid', password, code, now), true);
    assert.equal(verifyAdministratorCredentials('test-admin@example.invalid', password, code, now), false);
    assert.equal(verifyAdministratorCredentials('test-admin@example.invalid', password, totp.generate({ timestamp: now + 30_000 }), now + 30_000), true);
    delete process.env.CLINIC_ADMIN_TOTP_SECRET;
    assert.equal(administratorAuthenticationConfigured(), false);
    assert.equal(verifyAdministratorCredentials('test-admin@example.invalid', password, code, now), false);
  } finally {
    for (const [name, value] of previous) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
    rmSync(root, { recursive: true, force: true });
  }
});
