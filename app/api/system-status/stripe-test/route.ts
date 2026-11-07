import Stripe from 'stripe';
import { cookies } from 'next/headers';
import {
  clinicSessionCookieName,
  verifyAdminSession,
} from '@/app/lib/serverClinicSession';
import { recordStripeApiConnectivityCheck } from '@/app/lib/auditStore.server';

export const runtime = 'nodejs';

export async function POST() {
  const cookieStore = await cookies();
  if (!verifyAdminSession(cookieStore.get(clinicSessionCookieName)?.value)) {
    return Response.json({ error: 'Administrator access required.' }, { status: 403 });
  }

  if (process.env.NODE_ENV === 'production') {
    return Response.json({ error: 'This test-mode connectivity check is available only in development.' }, { status: 403 });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY ?? '';
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';
  if (!secretKey.startsWith('sk_test_') || !publishableKey.startsWith('pk_test_')) {
    return Response.json({
      error: 'A matching Stripe test-mode key pair is required for this safe connectivity check.',
    }, { status: 503 });
  }

  let checkedAt = new Date().toISOString();
  let stripe: Stripe | null = null;
  let paymentIntent: Stripe.PaymentIntent | null = null;
  try {
    stripe = new Stripe(secretKey, {
      apiVersion: '2026-06-24.dahlia',
      timeout: 5000,
      maxNetworkRetries: 0,
    });
    paymentIntent = await stripe.paymentIntents.create({
      amount: 100,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      metadata: { clinicStatusProbe: 'test-mode-connectivity' },
    });
    if (paymentIntent.status !== 'requires_payment_method') {
      throw new Error('Stripe returned an unexpected status for the connectivity intent.');
    }

    const canceled = await stripe.paymentIntents.cancel(paymentIntent.id);
    if (canceled.status !== 'canceled') {
      throw new Error('The connectivity intent was not canceled.');
    }
    paymentIntent = canceled;

    checkedAt = new Date().toISOString();
    recordStripeApiConnectivityCheck({ checkedAt, mode: 'test', result: 'success' });
    return Response.json({
      ok: true,
      mode: 'test',
      checkedAt,
      result: 'A test-mode PaymentIntent was created and canceled without collecting payment.',
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    if (stripe && paymentIntent && paymentIntent.status !== 'canceled') {
      try {
        await stripe.paymentIntents.cancel(paymentIntent.id);
      } catch {
        console.error('Stripe test PaymentIntent cancellation retry failed; inspect the test-mode dashboard.');
      }
    }
    checkedAt = new Date().toISOString();
    console.error(paymentIntent
      ? 'Stripe test-mode connectivity check failed while canceling its test PaymentIntent.'
      : 'Stripe test-mode connectivity check failed before creating a PaymentIntent.');
    try {
      recordStripeApiConnectivityCheck({ checkedAt, mode: 'test', result: 'failed' });
    } catch {
      console.error('Stripe connectivity test result could not be recorded.');
    }
    return Response.json({
      error: paymentIntent
        ? 'The Stripe test could not be safely completed or canceled. Check the test-mode dashboard before retrying.'
        : 'Stripe test connectivity could not be verified. No payment was collected.',
    }, { status: 503 });
  }
}
