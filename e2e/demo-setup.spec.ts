import { expect, test } from '@playwright/test';

test('one admin action connects fictional learner and kiosk flows without claiming real Stripe or SMS evidence', async ({ page, context }) => {
  expect((await context.request.post('/api/system-status/demo-setup', { data: {} })).status()).toBe(403);
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
  const report = await (await context.request.get('/api/system-status')).json();
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
});
