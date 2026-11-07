import { randomUUID } from 'node:crypto';
import Stripe from 'stripe';
import { createPendingCeuEnrollment, recordServerAuditEvent } from '@/app/lib/auditStore.server';

const topics = [
  { id: 'fall-prevention', title: 'Fall Prevention', amount: 9500 },
  { id: 'women-health', title: 'Women Health', amount: 10500 },
  { id: 'children-health', title: 'Children Health', amount: 9000 },
];

export async function POST(req: Request) {
  let relatedRecordId = 'ceu-payment-setup';
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Payment registration details are invalid.' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return Response.json({ error: 'Payment registration details are invalid.' }, { status: 400 });
  }

  const data = body as { topicId?: unknown; name?: unknown; email?: unknown };
  const topicId = typeof data.topicId === 'string' ? data.topicId : '';
  const learnerName = typeof data.name === 'string' ? data.name.trim() : '';
  const learnerEmail = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
  const topic = topics.find((item) => item.id === topicId);
  if (
    !topic
    || learnerName.length < 1
    || learnerName.length > 100
    || /[\u0000-\u001f\u007f]/.test(learnerName)
    || learnerEmail.length > 254
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(learnerEmail)
  ) {
    recordServerAuditEvent({ module: 'payments', action: 'CEU payment setup failed', relatedRecordId: topic?.id ?? relatedRecordId, result: 'denied', sessionId: null });
    return Response.json({ error: 'Enter a valid name and email, then choose a CEU topic.' }, { status: 400 });
  }
  relatedRecordId = topic.id;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    recordServerAuditEvent({ module: 'payments', action: 'CEU payment setup failed', relatedRecordId, result: 'failed', sessionId: null });
    return Response.json({ error: 'Payment is temporarily unavailable. Please try again later.' }, { status: 503 });
  }

  try {
    const registrationId = randomUUID();
    const stripe = new Stripe(secretKey, {
      apiVersion: '2026-06-24.dahlia',
    });

    const paymentIntent = await stripe.paymentIntents.create({
      amount: topic.amount,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      metadata: {
        topicId: topic.id,
        topicTitle: topic.title,
        registrationId,
      },
    });
    if (!paymentIntent.client_secret) {
      console.error('Stripe created a CEU PaymentIntent without a client secret.');
      return Response.json({ error: 'Payment could not be started. Please try again later.' }, { status: 503 });
    }

    try {
      createPendingCeuEnrollment({
        registrationId,
        paymentIntentId: paymentIntent.id,
        topicId: topic.id,
        learnerName,
        learnerEmail,
      });
    } catch {
      console.error('Pending CEU enrollment could not be recorded.');
      try {
        await stripe.paymentIntents.cancel(paymentIntent.id);
      } catch {
        console.error('Unissued CEU PaymentIntent could not be canceled.');
      }
      recordServerAuditEvent({ module: 'payments', action: 'CEU payment setup failed', relatedRecordId, result: 'failed', sessionId: null });
      return Response.json({ error: 'Registration could not be saved. Please try again later.' }, { status: 503 });
    }

    recordServerAuditEvent({ module: 'payments', action: 'CEU payment setup succeeded', relatedRecordId, result: 'pending', sessionId: null });

    return Response.json({ clientSecret: paymentIntent.client_secret }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    recordServerAuditEvent({ module: 'payments', action: 'CEU payment setup failed', relatedRecordId, result: 'failed', sessionId: null });
    return Response.json({ error: 'Payment could not be started. Please try again later.' }, { status: 503 });
  }
}
