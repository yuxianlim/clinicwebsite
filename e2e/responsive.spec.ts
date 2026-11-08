import { test, expect, type Page } from '@playwright/test';

const noOverflow = async (page: Page) => {
  await page.evaluate(() => document.fonts.ready);
  const width = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth }));
  expect(width.document, 'The document must not scroll horizontally').toBeLessThanOrEqual(width.viewport + 1);
};
const checkDialog = async (page: Page) => {
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const bounds = await dialog.boundingBox();
  const screen = page.viewportSize()!;
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(screen.width + 1);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(screen.height + 1);
  // Native modal focus must stay inside the dialog, including after reverse tabbing.
  await page.keyboard.press('Shift+Tab');
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await noOverflow(page);
};

test('all pages, dashboard sections, and dialogs adapt to the viewport', async ({ page, context }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // These are layout checks; unavailable external images/maps must not block them.
  await page.route(/https:\/\/(maps\.google\.com|randomuser\.me)\//, (route) => route.abort());
  const signedIn = await context.request.post('/api/clinic/session', { data: { email: 'layout@example.invalid', password: 'development-layout', method: 'email' } });
  expect(signedIn.status()).toBe(200);
  await context.addInitScript(() => { if (location.origin === 'http://127.0.0.1:3102') sessionStorage.setItem('clinic_auth_session', JSON.stringify({ authenticated: true, role: 'admin', method: 'email', verificationCompleted: true, permissions: ['audit-log:read'] })); });

  await test.step('public sections and all informational dialogs', async () => {
    await page.goto('/');
    await noOverflow(page);
    const mobileMenu = page.getByRole('button', { name: 'Open navigation', exact: true });
    if (await mobileMenu.isVisible()) {
      await mobileMenu.click();
      await expect(page.getByRole('button', { name: 'Close navigation', exact: true })).toHaveAttribute('aria-expanded', 'true');
      await page.locator('#mobile-navigation a[href="#about"]').click();
      await expect(page.locator('#mobile-navigation')).toHaveCount(0);
    }
    for (const section of ['services', 'about', 'testimonials']) {
      await page.locator(`#${section} button`).first().click();
      await checkDialog(page);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
    await page.getByRole('button', { name: 'Book a visit', exact: true }).filter({ visible: true }).first().click();
    await checkDialog(page);
    await expect(page.getByRole('button', { name: 'Confirm appointment', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Confirm appointment', exact: true }).scrollIntoViewIfNeeded();
    // English display labels must still submit the existing practitioner identifier.
    const slotByProject: Record<string, string> = { 'small-phone': '9:00 AM', phone: '9:30 AM', tablet: '10:00 AM', laptop: '10:30 AM', desktop: '11:00 AM', 'phone-landscape': '11:30 AM' };
    await page.getByLabel('Full name *', { exact: true }).fill('Layout Patient');
    await page.getByLabel('Phone number *', { exact: true }).fill('4085550199');
    await page.getByLabel('Appointment date *', { exact: true }).fill('2099-01-01');
    await page.getByLabel('Practitioner *', { exact: true }).selectOption({ label: 'Dr. Li' });
    await page.getByLabel('Appointment time *', { exact: true }).selectOption(slotByProject[testInfo.project.name]);
    await page.getByRole('button', { name: 'Confirm appointment', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Your appointment has been saved.' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('link', { name: 'Open learning workspace', exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('public.png'), fullPage: true });
    await noOverflow(page);
  });

  await test.step('sign-in dialog on short screens', async () => {
    const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
    if (await menu.isVisible()) await menu.click();
    await page.getByRole('button', { name: 'Logout', exact: true }).filter({ visible: true }).first().click();
    if (await menu.isVisible()) await menu.click();
    await page.getByRole('button', { name: 'Login', exact: true }).filter({ visible: true }).first().click();
    await page.getByRole('button', { name: 'Admin', exact: true }).click();
    await page.getByPlaceholder('Email address', { exact: true }).fill('layout@example.invalid');
    await page.getByPlaceholder('Password', { exact: true }).fill('development-layout');
    await page.getByRole('button', { name: 'Continue to verification', exact: true }).click();
    await checkDialog(page);
    await page.keyboard.press('Escape');
    // Reuse the known demo cookie without submitting another login attempt.
    await context.addCookies([{ name: 'clinic_admin_session', value: signedIn.headers()['set-cookie'].split(';')[0].split('=')[1], domain: '127.0.0.1', path: '/' }]);
  });

  await test.step('kiosk start, lookup and scanner states', async () => {
    await page.goto('/kiosk');
    await noOverflow(page);
    await page.getByRole('button', { name: /Enter last four phone digits/ }).click();
    await expect(page.getByLabel('Last four digits')).toBeVisible();
    await noOverflow(page);
    // Fictional responses exercise the layout of the remaining kiosk states without changing records.
    await page.route('**/api/kiosk/lookup', (route) => route.fulfill({ json: {
      patient: { id: 'PT-LAYOUT-' + '9'.repeat(36), name: 'LongPatientName'.repeat(8) },
      appointment: { id: '11223344-5566-4788-99aa-bbccddeeff00', date: '2099-01-01', time: '9:00 AM', practitioner: '李医生' }, checkInToken: 'layout-only-token',
    } }));
    await page.getByLabel('Last four digits').fill('0199');
    await page.getByRole('button', { name: 'Find my appointment', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Please confirm your check-in', exact: true })).toBeVisible();
    await noOverflow(page);
    await page.route('**/api/kiosk/check-in', (route) => route.fulfill({ json: { checkedIn: true, checkedInAt: new Date().toISOString() } }));
    await page.getByRole('button', { name: 'Confirm Check-In', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Check-in successful', exact: true })).toBeVisible();
    await noOverflow(page);
    await page.getByRole('button', { name: /Scan clinic membership ID/ }).click();
    await expect(page.getByRole('heading', { name: 'Try a fictional membership card' })).toBeVisible();
    await noOverflow(page);
    await page.screenshot({ path: testInfo.outputPath('kiosk.png'), fullPage: true });
  });

  await test.step('every workspace section, status search, and expandable evidence', async () => {
    // Long fictional values expose shrinking/wrapping bugs in populated management views.
    await page.route('**/api/admin/patients', (route) => route.fulfill({ json: { patients: [{
      id: 'PT-LAYOUT-' + '9'.repeat(36), firstName: 'Alexandra'.repeat(6), lastName: 'Montgomery'.repeat(6),
      status: 'Follow-up', phone: '(408) 555-0199', lastVisit: '2026-11-01',
      visitHistory: [{ date: '2026-11-01', treatment: 'TreatmentDescription'.repeat(5), practitioner: '李医生' }],
    }] } }));
    await page.route('**/api/admin/staff', (route) => route.fulfill({ json: { staff: [{
      id: 'STAFF-LAYOUT', name: 'LongStaffName'.repeat(6), role: 'PractitionerAndReception'.repeat(3), hours: '09:00–17:00', status: 'On duty',
    }] } }));
    await page.route('**/api/admin/appointments', (route) => route.fulfill({ json: { appointments: [{
      id: '11223344-5566-4788-99aa-bbccddeeff00', name: 'LongPatientName'.repeat(7), contact: '(408) 555-0199',
      date: '2099-01-01', time: '9:00 AM', practitioner: '李医生', timestamp: Date.now(), status: 'scheduled',
    }] } }));
    await page.goto('/portal');
    await expect(page.getByRole('heading', { name: 'Architecture Test Center', exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Connection status groups' })).toBeVisible();
    const selectSection = async (name: string) => {
      const toggle = page.getByRole('button', { name: /Workspace navigation/ });
      if (await toggle.isVisible()) await toggle.click();
      await page.getByRole('navigation', { name: 'Workspace', exact: true }).getByRole('button', { name, exact: true }).click();
    };
    for (const name of ['Dashboard', 'Patient Management', 'Appointment Management', 'Billing & Payments', 'Staff Management', 'Administration / Security', 'Development / System Status']) {
      await selectSection(name);
      await expect(page.locator('main h2').first()).toHaveText(name);
      await expect(page.getByText('Loading records…', { exact: true })).toHaveCount(0);
      await expect(page.getByText('Loading audit events...', { exact: true })).toHaveCount(0);
      await noOverflow(page);
    }
    await page.getByLabel('Search connections').fill('Ubuntu');
    await expect(page.getByRole('heading', { name: 'Application -> Ubuntu host health endpoint', exact: true })).toBeVisible();
    await page.getByLabel('Search connections').fill('');
    await page.getByText('Evidence and connection details', { exact: true }).first().click();
    await noOverflow(page);
    await page.screenshot({ path: testInfo.outputPath('status-details.png') });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath('status.png') });
  });
  expect(errors).toEqual([]);
});
