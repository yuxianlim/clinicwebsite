import { expect, test } from '@playwright/test';
import path from 'node:path';
import Stripe from 'stripe';

test('learner accounts gate content, signed sandbox payment unlocks videos, and a 90% exam earns a non-credit demo certificate', async ({ page, context }, testInfo) => {
  test.setTimeout(120_000);
  expect((await context.request.get('/api/learning')).status()).toBe(401);
  expect((await context.request.post('/api/clinic/session', { data: { email: 'learning-status@example.invalid', password: 'development-status-check', method: 'email' } })).status()).toBe(200);
  const initialStatus = await (await context.request.get('/api/system-status')).json();
  const initialDemoRows = initialStatus.items.filter((item: { name: string }) => item.name.startsWith('Demo learning:'));
  expect(initialDemoRows).toHaveLength(5);
  for (const item of initialDemoRows) expect(item.status).toBe('Partly Connected');
  expect((await context.request.get('/api/learning')).status()).toBe(401); // Admin is not a learner session.
  expect((await context.request.post('/api/learning', { headers: { origin: 'https://unrelated.example.invalid' }, data: { action: 'register' } })).status()).toBe(403);
  await page.goto('/learn');
  await expect(page.getByText('Learning workspace orientation', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'New here? Create an account', exact: true }).click();
  await page.getByLabel('Full name', { exact: true }).fill('Fictional Demo Learner');
  await page.getByLabel('Email', { exact: true }).fill('demo-learner@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill('unique-demo-test-password');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your courses', exact: true })).toBeVisible();
  const before = await (await context.request.get('/api/learning')).json();
  expect(before.courses[0].questions).toEqual([]);
  expect(before.courses[0].lessons[0].transcript).toBe('');
  await page.getByRole('button', { name: 'View course', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Open sandbox checkout', exact: true })).toBeVisible();
  expect((await context.request.post('/api/learning', { data: { action: 'exam', courseId: before.courses[0].id, answers: Array(10).fill(0), requestId: crypto.randomUUID() } })).status()).toBe(400);

  // Local signature fixtures exercise webhook code, not actual Stripe connectivity.
  // Records exist only in the runner's disposable database.
  const data = testInfo.config.metadata.responsiveDataDirectory as string;
  process.env.AUDIT_LOG_DB_PATH = path.join(data, 'audit.sqlite');
  const store = await import('../app/lib/learningStore.server');
  const purchase = store.reserveLearningPurchase(before.user.id, before.courses[0].id);
  store.linkLearningIntent(purchase.id, 'pi_playwrightLearning');
  const payload = JSON.stringify({ id: 'evt_playwrightLearning', type: 'payment_intent.succeeded', livemode: false,
    created: Math.floor(Date.now() / 1000), data: { object: { object: 'payment_intent', id: 'pi_playwrightLearning', amount: purchase.amount, amount_received: purchase.amount,
      currency: 'usd', livemode: false, metadata: { purpose: 'demo-learning', learningPurchaseId: purchase.id } } } });
  expect((await context.request.post('/api/stripe/webhook', { data: payload, headers: { 'stripe-signature': 'invalid' } })).status()).toBe(400);
  const stripe = new Stripe('sk_test_local_signature_fixture');
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_playwright_local_fixture' });
  const delivered = await context.request.post('/api/stripe/webhook', { data: payload, headers: { 'stripe-signature': signature } });
  expect(delivered.status()).toBe(200);
  await page.getByRole('button', { name: 'Refresh account', exact: true }).click();
  await expect(page.getByText('Sandbox purchase verified · Course unlocked', { exact: true })).toBeVisible();
  await expect(page.getByText('Watch 100% of both required videos to unlock the exam.', { exact: true })).toBeVisible();
  for (let index = 0; index < 2; index++) {
    const video = page.locator('video').nth(index);
    await video.evaluate(async (node: HTMLVideoElement) => { node.muted = true; await node.play(); });
    await expect(page.getByText('100% watched', { exact: true })).toHaveCount(index + 1, { timeout: 25_000 });
  }
  const { demoAnswerKey, demoCourses } = await import('../app/lib/demoCourses.server');
  const answers = [...demoAnswerKey]; answers[0] = 0; // Exactly 90% must pass.
  for (let index = 0; index < answers.length; index++)
    await page.getByRole('group', { name: `${index + 1}. ${demoCourses[0].questions[index].prompt}`, exact: true }).getByRole('radio').nth(answers[index]).check({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Submit final exam', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Download demo certificate', exact: true })).toBeVisible();
  const certificate = await (await context.request.get('/api/learning')).json();
  const certificateId = certificate.courses[0].certificateId;
  const certificateDocument = await context.request.get(`/api/learning/document?kind=certificate&id=${certificateId}`);
  expect(certificateDocument.status()).toBe(200);
  expect(await certificateDocument.text()).toContain('NO APPROVED CE CREDIT');
  const report = await (await context.request.get('/api/system-status')).json();
  const demoRows = report.items.filter((item: { name: string }) => item.name.startsWith('Demo learning:'));
  expect(demoRows).toHaveLength(5);
  for (const item of demoRows) {
    expect(item.status).toBe('Connected');
    expect(item.dependencyGroup).toBe('Demo learner workspace');
  }
  expect(JSON.stringify(demoRows)).not.toContain('demo-learner@example.invalid');
  expect(report.items.find((item: { name: string }) => item.name === 'CEU completion/attendance -> certificate issuance').status).toBe('Planned');
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('demo-learning-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back', exact: true })).toBeVisible();
  expect((await context.request.get(`/api/learning/document?kind=certificate&id=${certificateId}`)).status()).toBe(401);
  await page.getByLabel('Email', { exact: true }).fill('demo-learner@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill('unique-demo-test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'View completion', exact: true })).toBeVisible();
});
