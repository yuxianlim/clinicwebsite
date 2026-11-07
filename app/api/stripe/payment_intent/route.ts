import Stripe from 'stripe';
import { recordServerAuditEvent } from '@/app/lib/auditStore.server';

const topics = [
  { id: 'fall-prevention', title: 'Fall Prevention', amount: 9500 },
  { id: 'women-health', title: 'Women Health', amount: 10500 },
  { id: 'children-health', title: 'Children Health', amount: 9000 },
];

export async function POST(req: Request) {
  let relatedRecordId = 'ceu-payment-setup';
  try {
    const body = await req.json();
    const topicId = body?.topicId;

    if (!topicId) {
      recordServerAuditEvent({ module: 'payments', action: 'CEU payment setup failed', relatedRecordId, result: 'failed', sessionId: null });
      return new Response(JSON.stringify({ error: 'Missing topicId' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const topic = topics.find((item) => item.id === topicId);
    if (!topic) {
      recordServerAuditEvent({ module: 'payments', action: 'CEU payment setup failed', relatedRecordId, result: 'failed', sessionId: null });
      return new Response(JSON.stringify({ error: 'Invalid topic selected' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    relatedRecordId = topic.id;

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
      apiVersion: '2026-06-24.dahlia',
    });

    const paymentIntent = await stripe.paymentIntents.create({
      amount: topic.amount,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      metadata: {
        topicId: topic.id,
        topicTitle: topic.title,
      },
    });

    recordServerAuditEvent({ module: 'payments', action: 'CEU payment setup succeeded', relatedRecordId, result: 'pending', sessionId: null });

    return new Response(JSON.stringify({ clientSecret: paymentIntent.client_secret }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    recordServerAuditEvent({ module: 'payments', action: 'CEU payment setup failed', relatedRecordId, result: 'failed', sessionId: null });
    return new Response(JSON.stringify({ error: 'Stripe payment intent creation failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
