import Stripe from 'stripe';
import { appendVerifiedStripeWebhookEvent } from '@/app/lib/auditStore.server';

export const runtime = 'nodejs';

const topics: Record<string, number> = {
  'fall-prevention': 9500,
  'women-health': 10500,
  'children-health': 9000,
};
const paymentEvents: Record<string, { action: string; result: 'success' | 'failed' | 'pending' }> = {
  'payment_intent.succeeded': { action: 'CEU payment succeeded', result: 'success' },
  'payment_intent.payment_failed': { action: 'CEU payment failed', result: 'failed' },
  'payment_intent.processing': { action: 'CEU payment pending', result: 'pending' },
  'payment_intent.canceled': { action: 'CEU payment canceled', result: 'failed' },
};

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return Response.json({ error: 'Payment verification is not configured.' }, { status: 503 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) return Response.json({ error: 'Invalid payment notification.' }, { status: 400 });

  const payload = await request.text();
  let event: Stripe.Event;
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_webhook_signature_verification');
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch {
    return Response.json({ error: 'Invalid payment notification.' }, { status: 400 });
  }

  const eventMapping = paymentEvents[event.type];
  if (!eventMapping) return Response.json({ received: true, ignored: true });

  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  const topicId = paymentIntent.metadata?.topicId;
  const registrationId = paymentIntent.metadata?.registrationId;
  if (
    paymentIntent.object !== 'payment_intent'
    || !paymentIntent.id
    || typeof topicId !== 'string'
    || !Object.prototype.hasOwnProperty.call(topics, topicId)
    || paymentIntent.currency !== 'usd'
    || paymentIntent.amount !== topics[topicId]
    || (registrationId !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(registrationId))
  ) {
    return Response.json({ error: 'Payment notification could not be matched to a valid registration.' }, { status: 400 });
  }

  try {
    const processed = appendVerifiedStripeWebhookEvent({
      stripeEventId: event.id,
      paymentIntentId: paymentIntent.id,
      topicId,
      registrationId,
      ...eventMapping,
      livemode: event.livemode,
      stripeCreatedAt: event.created,
    });
    return Response.json({ received: true, duplicate: !processed });
  } catch {
    console.error('Verified Stripe event could not be persisted.');
    return Response.json({ error: 'Payment notification could not be recorded.' }, { status: 500 });
  }
}
