import { expect, test } from '@playwright/test';

test('open dashboard notices another client write without reload and stops displaying data after logout', async ({ page, context }) => {
  expect((await context.request.get('/api/system-status/revision')).status()).toBe(403);
  await context.request.post('/api/clinic/session', { data: { email: 'live-status@example.invalid', password: 'development-only-status', method: 'email' } });
  await context.addInitScript(() => sessionStorage.setItem('clinic_auth_session', JSON.stringify({ authenticated: true, role: 'admin', method: 'email', verificationCompleted: true, permissions: ['audit-log:read'] })));
  await page.goto('/portal');
  await page.getByRole('navigation', { name: 'Workspace', exact: true }).getByRole('button', { name: 'Development / System Status', exact: true }).click();
  const search = page.getByRole('searchbox');
  await search.fill('Demo learning: registration');
  const initial = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Demo learning: registration -> stored account', exact: true }) });
  await expect(initial).toBeVisible();
  const report = await (await context.request.get('/api/system-status')).json();
  const count = Number.parseInt(report.items.find((item: { name: string }) => item.name === 'Demo learning: registration -> stored account').evidence[0], 10);
  let fullRequests = 0;
  page.on('request', (request) => { if (new URL(request.url()).pathname === '/api/system-status') fullRequests++; });
  const before = await (await context.request.get('/api/system-status/revision')).json();
  // An independent client writes through the actual API, with no dashboard event
  // dispatched and no route mocks, so filesystem detection must cause the update.
  const response = await context.request.post('/api/learning', { data: { action: 'register', name: 'Live Update Fictional Learner', email: 'live-update@example.invalid', password: 'unique-live-test-password' } });
  expect(response.status()).toBe(200);
  const after = await (await context.request.get('/api/system-status/revision')).json();
  expect(after.revision).not.toBe(before.revision);
  await expect(initial).toContainText(`${count + 1} matching development record(s) found.`, { timeout: 10_000 });
  await expect(initial.getByText('Connected', { exact: true })).toBeVisible();
  await expect(initial).not.toContainText('Partly Connected');
  await expect(search).toHaveValue('Demo learning: registration');
  expect(fullRequests).toBeGreaterThan(0);
  // Delay an actual authorized response across logout. A late response must not
  // restore private dashboard data after the revision endpoint rejects access.
  let release!: () => void;
  let captured!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const capture = new Promise<void>((resolve) => { captured = resolve; });
  await page.route('**/api/system-status', async (route) => {
    const response = await route.fetch();
    captured(); await gate; await route.fulfill({ response });
  });
  try {
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await capture;
    await context.request.delete('/api/clinic/session');
    const ended = page.getByRole('alert').filter({ hasText: 'Your administrator session has ended' });
    await expect(ended).toBeVisible({ timeout: 10_000 });
    const finished = page.waitForEvent('requestfinished', (request) => new URL(request.url()).pathname === '/api/system-status');
    release(); await finished;
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(ended).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Demo learning: registration -> stored account', exact: true })).toHaveCount(0);
  } finally { release(); }
});
