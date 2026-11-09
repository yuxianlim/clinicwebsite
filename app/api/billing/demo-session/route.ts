import path from 'node:path';
import { billingDemoCookie, createBillingDemoSession } from '@/app/lib/serverClinicSession';
import { demoBillingEnabled } from '@/app/lib/demoBilling.server';
import { SharedRateLimiter } from '@/app/lib/sharedRateLimit.server';
import { fictionalDataSource } from '@/app/lib/deploymentMode';

export const runtime = 'nodejs';
const state = globalThis as typeof globalThis & { demoBillingLimiter?: SharedRateLimiter };
export async function POST(request: Request) {
  if (!demoBillingEnabled()) return Response.json({ error: 'Demo staff sign-in is disabled.' }, { status: 404 });
  const origin = request.headers.get('origin');
  try { if (origin && new URL(origin).host !== request.headers.get('host')) throw new Error('Origin mismatch.'); }
  catch { return Response.json({ error: 'Request origin rejected.' }, { status: 403 }); }
  try {
    const limiter = state.demoBillingLimiter ??= new SharedRateLimiter(process.env.CLINIC_LOGIN_RATE_LIMIT_DB_PATH ?? path.join(process.cwd(), '.data', 'clinic-login-limits.sqlite'), 8, 60_000);
    if (limiter.consume('demo-billing-staff')) return Response.json({ error: 'Too many attempts. Wait one minute.' }, { status: 429 });
    const body = await request.json();
    if (body?.email !== 'billing.staff@example.invalid' || body?.password !== 'DemoBilling!2026') return Response.json({ error: 'Demo staff credentials could not be verified.' }, { status: 401 });
    const { token } = createBillingDemoSession();
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    return Response.json({ ok: true, role: 'clinic_staff', source: fictionalDataSource() }, { headers: { 'Cache-Control': 'no-store', 'Set-Cookie': `${billingDemoCookie}=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=28800${secure}` } });
  } catch { return Response.json({ error: 'Demo staff sign-in is unavailable.' }, { status: 503 }); }
}
