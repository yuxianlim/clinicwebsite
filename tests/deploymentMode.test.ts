import assert from 'node:assert/strict';
import test from 'node:test';
import { fictionalWorkflowEnabled, restrictedFictionalStagingEnabled } from '../app/lib/deploymentMode';
import { stagingStripeSandboxConfigured } from '../app/lib/stripeConfiguration.server';
import { createAdminSession } from '../app/lib/serverClinicSession';
import Stripe from 'stripe';

test('fictional staging requires all production staging gates', () => {
  const saved = { ...process.env };
  try {
    process.env.NODE_ENV = 'production';
    process.env.APP_DEPLOYMENT_MODE = 'fictional-staging';
    process.env.ENABLE_FICTIONAL_STAGING_WORKFLOWS = 'true';
    process.env.STAGING_PUBLIC_ORIGIN = 'https://aven.sean.tcmusa.ai';
    process.env.STAGING_BASIC_AUTH_USER = 'fictional-reviewer';
    process.env.STAGING_BASIC_AUTH_HASH = '$2a$12$fictionalHashPlaceholderForUnitTestOnly';
    process.env.CADDY_BIND_IP = '192.0.2.10';
    process.env.CLINIC_ADMIN_EMAIL = 'admin@example.invalid';
    process.env.CLINIC_ADMIN_PASSWORD = 'fictional-admin-password';
    process.env.CLINIC_SESSION_SECRET = 'fictional-session-secret-at-least-32-characters';
    process.env.CLINIC_ADMIN_TOTP_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
    assert.equal(restrictedFictionalStagingEnabled(), true);
    assert.equal(fictionalWorkflowEnabled(undefined), true);
    process.env.STRIPE_SECRET_KEY = 'sk_test_fictional';
    process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_fictional';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fictional';
    assert.equal(stagingStripeSandboxConfigured(), true);
    process.env.STRIPE_SECRET_KEY = 'sk_live_forbidden';
    process.env.STRIPE_PUBLISHABLE_KEY = 'pk_live_forbidden';
    assert.equal(stagingStripeSandboxConfigured(), false);
    assert.throws(() => createAdminSession('development-demo'), /Demo sessions are not allowed/);
    process.env.STRIPE_SECRET_KEY = 'sk_test_fictional';
    process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_fictional';
    delete process.env.ENABLE_FICTIONAL_STAGING_WORKFLOWS;
    assert.equal(restrictedFictionalStagingEnabled(), false);
    assert.equal(fictionalWorkflowEnabled('true'), false);
  } finally {
    process.env = saved;
  }
});

test('development fixtures do not turn on the production staging mode', () => {
  const saved = { ...process.env };
  try {
    process.env.NODE_ENV = 'development';
    process.env.ENABLE_DEVELOPMENT_CEU_DEMO = 'true';
    delete process.env.APP_DEPLOYMENT_MODE;
    delete process.env.ENABLE_FICTIONAL_STAGING_WORKFLOWS;
    assert.equal(restrictedFictionalStagingEnabled(), false);
    assert.equal(fictionalWorkflowEnabled(process.env.ENABLE_DEVELOPMENT_CEU_DEMO), true);
  } finally {
    process.env = saved;
  }
});

test('fictional staging accepts signed sandbox delivery and rejects signed live delivery', async () => {
  const saved = { ...process.env };
  Object.assign(process.env, {
    NODE_ENV: 'production', APP_DEPLOYMENT_MODE: 'fictional-staging', ENABLE_FICTIONAL_STAGING_WORKFLOWS: 'true',
    STAGING_PUBLIC_ORIGIN: 'https://aven.sean.tcmusa.ai', STAGING_BASIC_AUTH_USER: 'fictional-reviewer',
    STAGING_BASIC_AUTH_HASH: '$2a$12$fictionalHashPlaceholderForUnitTestOnly', CADDY_BIND_IP: '192.0.2.10',
    CLINIC_ADMIN_EMAIL: 'admin@example.invalid', CLINIC_ADMIN_PASSWORD: 'fictional-admin-password',
    CLINIC_SESSION_SECRET: 'fictional-session-secret-at-least-32-characters',
    CLINIC_ADMIN_TOTP_SECRET: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', STRIPE_SECRET_KEY: 'sk_test_fictional',
    STRIPE_PUBLISHABLE_KEY: 'pk_test_fictional', STRIPE_WEBHOOK_SECRET: 'whsec_fictional',
  });
  const webhook = await import('../app/api/stripe/webhook/route');
  const deliver = (livemode: boolean) => {
    const payload = JSON.stringify({ id: `evt_${livemode ? 'live' : 'test'}`, object: 'event', type: 'charge.succeeded', created: 1_800_000_000, livemode, data: { object: { object: 'charge', livemode } } });
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET! });
    return webhook.POST(new Request('https://aven.sean.tcmusa.ai/api/stripe/webhook', { method: 'POST', headers: { 'stripe-signature': signature }, body: payload }));
  };
  try {
    assert.equal((await deliver(false)).status, 200);
    assert.equal((await deliver(true)).status, 400);
  } finally { process.env = saved; }
});
