import { expect, test } from '@playwright/test';

test('one admin action connects fictional learner, kiosk, NFC and clinic billing flows with truthful sources', async ({ page, context, browser }) => {
  expect((await context.request.post('/api/system-status/demo-setup', { data: {} })).status()).toBe(403);
  expect((await context.request.get('/api/system-status/demo-alerts')).status()).toBe(403);
  await context.request.post('/api/clinic/session', { data: { email: 'fixture-admin@example.invalid', password: 'development-only-fixture', method: 'email' } });
  expect((await context.request.post('/api/system-status/demo-setup', { headers: { origin: 'https://unrelated.example.invalid' }, data: {} })).status()).toBe(403);
  await context.addInitScript(() => sessionStorage.setItem('clinic_auth_session', JSON.stringify({ authenticated: true, role: 'admin', method: 'email', verificationCompleted: true, permissions: ['audit-log:read'] })));
  const before = await (await context.request.get('/api/system-status')).json();
  await page.goto('/portal');
  const response = page.waitForResponse((item) => item.url().endsWith('/api/system-status/demo-setup') && item.request().method() === 'POST');
  await page.getByRole('button', { name: 'Run demo setup', exact: true }).click();
  const setupResponse = await response;
  expect(setupResponse.status()).toBe(200);
  const setup = await setupResponse.json();
  await expect(page.getByText(setup.learner.email, { exact: true })).toBeVisible();
  const cards = page.locator('article').filter({ has: page.getByRole('heading', { name: /^Demo learning:/ }) });
  await expect(cards).toHaveCount(5);
  for (let index = 0; index < 5; index++) await expect(cards.nth(index).getByText('Connected', { exact: true })).toBeVisible();
  const kioskCard = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Demo kiosk: code verification -> appointment access', exact: true }) });
  await expect(kioskCard.getByText('Connected', { exact: true })).toBeVisible();
  const membershipCard = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Demo kiosk: membership card -> appointment access', exact: true }) });
  await expect(membershipCard.getByText('Connected', { exact: true })).toBeVisible();
  const monitoring = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Demo monitoring: event -> local alert inbox', exact: true }) });
  await expect(monitoring.getByText('Connected', { exact: true })).toBeVisible();
  await page.getByText(/^Local demo alert inbox \(/).click();
  const alertResponse = page.waitForResponse((response) => response.url().endsWith('/api/system-status/demo-alerts') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Send demo alert', exact: true }).click();
  const alertResult = await alertResponse; expect(alertResult.status()).toBe(200);
  const alertId = (await alertResult.json()).alert.eventId;
  await expect(page.locator('li').filter({ hasText: alertId })).toContainText('Source: local demo inbox');
  const report = await (await context.request.get('/api/system-status')).json();
  expect(report.items.find((item: {name:string}) => item.name.startsWith('Demo NFC:')).status).toBe('Connected');
  expect(report.items.find((item: {name:string}) => item.name.startsWith('Demo billing:')).status).toBe('Connected');
  expect(report.items.find((item: { name: string }) => item.name === 'CEU completion/attendance -> certificate issuance').status).toBe('Planned');
  expect(report.items.find((item: { name: string }) => item.name === 'Patient identity provider -> kiosk verification').status).toBe('Planned');
  expect(report.items.find((item: { name: string }) => item.name === 'Application -> Ubuntu host health endpoint').status).toBe('Planned');
  for (const name of ['Application -> Ubuntu health-response validator', 'Application -> database health-response validator', 'Application -> OIDC claim-shape adapter', 'Application -> scanner event-format adapter', 'Application -> monitoring event/receipt adapter']) {
    const item = report.items.find((row: { name: string }) => row.name === name);
    expect(item.status).toBe('Connected'); expect(item.testSource).toBe('Development Simulation');
  }
  const oldStripe = (data: typeof report) => data.items.find((item: { name: string }) => item.name === 'Stripe.js outcome -> audit log').status;
  expect(oldStripe(report)).toBe(oldStripe(before));
  const again = await (await context.request.post('/api/system-status/demo-setup', { data: {} })).json();
  expect(again.learner.email).toBe(setup.learner.email);
  expect(again.kiosk.phone).toBe(setup.kiosk.phone);
  const repeated = await (await context.request.get('/api/system-status')).json();
  for (const item of report.items.filter((row: { name: string }) => row.name.startsWith('Demo learning:')))
    expect(repeated.items.find((row: { name: string }) => row.name === item.name).evidence[0]).toBe(item.evidence[0]);
  expect(repeated.items.find((row: {name:string}) => row.name.startsWith('Demo billing:')).evidence[0]).toBe(report.items.find((row: {name:string}) => row.name.startsWith('Demo billing:')).evidence[0]);

  // A separate browser gets only a signed clinic-staff billing session.
  const staff = await browser.newContext({ baseURL: 'http://127.0.0.1:3102', viewport: { width: 390, height: 844 } });
  try {
    expect((await staff.request.get('/api/billing')).status()).toBe(403);
    const staffPage = await staff.newPage();
    await staffPage.goto('/portal');
    await staffPage.getByRole('button', { name: /Workspace navigation/ }).click();
    await staffPage.getByRole('navigation', { name: 'Workspace', exact: true }).getByRole('button', { name: 'Billing & Payments', exact: true }).click();
    await staffPage.getByLabel('Demo staff email', { exact: true }).fill(setup.billing.staffEmail);
    await staffPage.getByLabel('Demo staff password', { exact: true }).fill(setup.billing.staffPassword);
    await staffPage.getByRole('button', { name: 'Sign in as demo clinic staff', exact: true }).click();
    await expect(staffPage.getByText('Authorized role: Clinic staff (signed demo session)', { exact: true })).toBeVisible();
    for (const route of ['/api/admin/patients', '/api/admin/appointments', '/api/system-status', '/api/audit-log']) expect((await staff.request.get(route)).status()).toBe(403);
    expect((await staff.request.post('/api/billing', { headers: { origin: 'https://unrelated.example.invalid' }, data: { action: 'complete-treatment', patientId: setup.billing.patientId, requestId: crypto.randomUUID() } })).status()).toBe(403);
    const before = await (await staff.request.get('/api/billing')).json();
    expect(before.invoices).toHaveLength(2);
    const followup = before.invoices.find((row: {service_id:string}) => row.service_id === 'follow-up');
    expect(followup.correctAmount).toBe(12000); expect(followup.totalPaid).toBe(18000); expect(followup.refunds[0].amount).toBe(6000);
    await staffPage.getByLabel('Medicine add-on +$50', { exact: true }).check();
    await staffPage.getByLabel('Insurance visit — invoice on business day 7', { exact: true }).check();
    await staffPage.getByRole('button', { name: 'Complete demo treatment', exact: true }).click();
    await expect(staffPage.getByRole('heading', { name: 'Insurance invoice queue', exact: true })).toBeVisible();
    await staffPage.getByRole('button', { name: 'Simulate insurance day 7', exact: true }).click();
    await expect(staffPage.getByRole('heading', { name: 'Insurance invoice queue', exact: true })).toHaveCount(0);
    const after = await (await staff.request.get('/api/billing')).json();
    expect(after.invoices[0].correctAmount).toBe(17000);
    expect(after.invoices[0].actor_role).toBe('system');
    await expect(staffPage.locator('body')).toHaveJSProperty('scrollWidth', 390);
  } finally { await staff.close(); }

  await page.goto('/learn');
  await page.getByLabel('Email', { exact: true }).fill(setup.learner.email);
  await page.getByLabel('Password', { exact: true }).fill(setup.learner.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'View completion', exact: true }).click();
  await expect(page.getByText(/Generated fixture records:/)).toBeVisible();
  const certificateId = (await (await context.request.get('/api/learning')).json()).courses[0].certificateId;
  const document = await (await context.request.get(`/api/learning/document?kind=certificate&id=${certificateId}`)).text();
  expect(document).toContain('Human attendance was not observed.');
  await page.goto('/kiosk');
  await page.getByRole('button', { name: /Try demo phone verification/ }).click();
  await page.getByLabel('Last four digits', { exact: true }).fill(setup.kiosk.lastFour);
  await page.getByRole('button', { name: 'Find my appointment', exact: true }).click();
  const code = (await page.getByTestId('demo-kiosk-code').textContent())!;
  await page.getByLabel('Six-digit demo code', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Verify demo code', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Please confirm your check-in', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm Check-In', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Check-in successful', exact: true })).toBeVisible();
  await page.goto('/kiosk');
  await page.getByRole('button', { name: /Scan clinic membership ID/ }).click();
  await expect(page.getByText(/Demo ACR1252U reader connected/)).toBeVisible();
  await page.getByRole('button', { name: 'Simulate NTAG213 tap', exact: true }).click();
  await expect(page.getByText('Fictional Card Check', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm Check-In', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Check-in successful', exact: true })).toBeVisible();
});
