import Stripe from 'stripe';
import { getCeuEnrollmentByPaymentIntent, getVerifiedStripePaymentState } from '@/app/lib/auditStore.server';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return Response.json({ error: 'Payment verification is not configured.' }, { status: 503 });
  }
  const paymentIntentId = new URL(request.url).searchParams.get('paymentIntentId') ?? '';
  if (!/^pi_[A-Za-z0-9]+$/.test(paymentIntentId)) {
    return Response.json({ error: 'Payment status request is invalid.' }, { status: 400 });
  }

  try {
    const stripe = new Stripe(secretKey, { apiVersion: '2026-06-24.dahlia', timeout: 5000, maxNetworkRetries: 0 });
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    const verifiedEvent = getVerifiedStripePaymentState(paymentIntent.id);
    const topicId = paymentIntent.metadata.topicId;
    if (!['fall-prevention', 'women-health', 'children-health'].includes(topicId)) {
      return Response.json({ error: 'Payment status could not be matched to a registration.' }, { status: 404 });
    }
    const enrollment = getCeuEnrollmentByPaymentIntent(paymentIntent.id);
    const enrollmentMatchesPayment = Boolean(
      enrollment
      && paymentIntent.metadata.registrationId === enrollment.registrationId
      && enrollment.topicId === topicId,
    );
    return Response.json({
      status: paymentIntent.status,
      webhookVerified: Boolean(verifiedEvent),
      verifiedResult: verifiedEvent?.result ?? null,
      topicId,
      registrationStatus: enrollmentMatchesPayment
        ? enrollment?.status ?? null
        : null,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Payment status could not be checked. Please do not retry until you confirm the result.' }, { status: 503 });
  }
}
