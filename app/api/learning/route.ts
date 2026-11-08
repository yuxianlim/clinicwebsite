import { cookies } from 'next/headers';
import { createHash } from 'node:crypto';
import path from 'node:path';
import Stripe from 'stripe';
import { stripeConfiguration } from '@/app/lib/stripeConfiguration.server';
import { SharedRateLimiter } from '@/app/lib/sharedRateLimit.server';
import { authenticateLearner, createLearner, endLearnerSession, learnerCookie, learnerFromToken, learningAccount, learningDemoEnabled, LearningError, linkLearningIntent, recordLearningWatch, reserveLearningPurchase, startLearnerSession, submitLearningExam } from '@/app/lib/learningStore.server';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };
const limiterState = globalThis as typeof globalThis & { learningLimiter?: SharedRateLimiter };
const token = async () => (await cookies()).get(learnerCookie)?.value;

export async function GET() {
  if (!learningDemoEnabled()) return Response.json({ error: 'The learning demo is disabled. Set ENABLE_DEVELOPMENT_CEU_DEMO=true in .env.local and restart the development server.' }, { status: 404, headers });
  const user = learnerFromToken(await token());
  if (!user) return Response.json({ error: 'Sign in to view courses.' }, { status: 401, headers });
  return Response.json(learningAccount(user), { headers });
}

export async function POST(request: Request) {
  if (!learningDemoEnabled()) return Response.json({ error: 'The learning demo is disabled.' }, { status: 404, headers });
  const origin = request.headers.get('origin');
  if (origin) {
    try {
      const parsed = new URL(origin);
      // Next.js may normalize request.url to its bind hostname; Host retains the
      // address the browser actually visited (localhost versus 127.0.0.1).
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin || parsed.host !== request.headers.get('host')) throw new Error('Origin mismatch.');
    } catch { return Response.json({ error: 'Request origin rejected.' }, { status: 403, headers }); }
  }
  if (!request.headers.get('content-type')?.includes('application/json')) return Response.json({ error: 'JSON is required.' }, { status: 400, headers });
  try {
    const text = await request.text();
    if (text.length > 16_000) return Response.json({ error: 'Request is too large.' }, { status: 413, headers });
    const body = JSON.parse(text);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new LearningError('Invalid request.');
    const value = (key: string) => typeof body[key] === 'string' ? body[key] : '';
    const action = value('action');
    const sessionToken = await token();
    if (action === 'register' || action === 'signin') {
      const limiter = limiterState.learningLimiter ??= new SharedRateLimiter(
        process.env.CLINIC_LOGIN_RATE_LIMIT_DB_PATH ?? path.join(process.cwd(), '.data', 'clinic-login-limits.sqlite'), 10, 60_000);
      const bucket = createHash('sha256').update(value('email').trim().toLowerCase()).digest('hex');
      if (limiter.consume(`learning:${bucket}`) || limiter.consume('learning:global'))
        return Response.json({ error: 'Too many sign-in attempts. Wait a minute and retry.' }, { status: 429, headers });
      const user = action === 'register' ? createLearner(value('name'), value('email'), value('password')) : authenticateLearner(value('email'), value('password'));
      const issued = startLearnerSession(user.id);
      return Response.json({ ok: true }, { headers: { ...headers, 'Set-Cookie': `${learnerCookie}=${issued}; HttpOnly; Path=/; SameSite=Strict; Max-Age=28800` } });
    }
    if (action === 'signout') {
      if (sessionToken) endLearnerSession(sessionToken);
      return Response.json({ ok: true }, { headers: { ...headers, 'Set-Cookie': `${learnerCookie}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0` } });
    }
    const user = learnerFromToken(sessionToken);
    if (!user) return Response.json({ error: 'Sign in to continue.' }, { status: 401, headers });
    const courseId = value('courseId');
    if (action === 'purchase') {
      if (stripeConfiguration().mode !== 'test') throw new LearningError('Matching Stripe sandbox keys are required. Live payments are disabled for demo courses.');
      const purchase = reserveLearningPurchase(user.id, courseId);
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-06-24.dahlia', timeout: 10_000, maxNetworkRetries: 1 });
      const intent = purchase.intent_id ? await stripe.paymentIntents.retrieve(purchase.intent_id) : await stripe.paymentIntents.create({
        amount: purchase.amount, currency: 'usd', automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
        metadata: { learningPurchaseId: purchase.id, purpose: 'demo-learning' },
      }, { idempotencyKey: `learning-${purchase.id}` });
      if (intent.livemode || !intent.client_secret || intent.amount !== purchase.amount) throw new Error('Unexpected sandbox intent.');
      linkLearningIntent(purchase.id, intent.id);
      return Response.json({ clientSecret: intent.client_secret, purchaseId: purchase.id, amount: purchase.amount }, { headers });
    }
    if (action === 'watch-start' || action === 'watch') {
      if (action === 'watch' && typeof body.position !== 'number') throw new LearningError('A valid playback position is required.');
      return Response.json({ watched: recordLearningWatch(user.id, courseId, value('lessonId'), action === 'watch-start' ? null : body.position) }, { headers });
    }
    if (action === 'exam') return Response.json(submitLearningExam(user.id, courseId, body.answers, value('requestId')), { headers });
    throw new LearningError('Unknown learning action.');
  } catch (error) {
    if (error instanceof LearningError) return Response.json({ error: error.message }, { status: 400, headers });
    if (error instanceof SyntaxError) return Response.json({ error: 'Invalid JSON request.' }, { status: 400, headers });
    return Response.json({ error: 'The request could not be completed. Refresh your account before retrying a purchase or exam.' }, { status: 503, headers });
  }
}
