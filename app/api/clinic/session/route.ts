import path from 'node:path';
import { administratorAuthenticationConfigured, administratorDemoEnabled, verifyAdministratorCredentials } from '@/app/lib/adminAuthentication.server';
import { SharedRateLimiter } from '@/app/lib/sharedRateLimit.server';
import { cookies } from 'next/headers';
import { recordServerAuditEvent } from '@/app/lib/auditStore.server';
import { createAdminSession, clinicSessionCookieName, clinicSessionTtlSeconds, verifyAdminSession } from '@/app/lib/serverClinicSession';

export const runtime = 'nodejs';

const loginLimiterState = globalThis as typeof globalThis & { clinicLoginLimiter?: SharedRateLimiter };

const recordAdministratorLogin = (action: 'Administrator login succeeded' | 'Administrator login failed', result: 'success' | 'failed' | 'denied') => {
  recordServerAuditEvent({
    module: 'authentication',
    action,
    relatedRecordId: 'administrator-login',
    result,
    sessionId: null,
  });
};

export async function POST(request: Request) {
  try {
    const limiter = loginLimiterState.clinicLoginLimiter ??= new SharedRateLimiter(
      process.env.CLINIC_LOGIN_RATE_LIMIT_DB_PATH ?? path.join(process.cwd(), '.data', 'clinic-login-limits.sqlite'), 8, 60_000,
    );
    if (limiter.consume('administrator-login')) {
      return Response.json({ error: 'Too many sign-in attempts. Please retry later.' }, { status: 429, headers: { 'Retry-After': '60' } });
    }
  } catch {
    return Response.json({ error: 'Administrator sign-in is temporarily unavailable.' }, { status: 503 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    recordAdministratorLogin('Administrator login failed', 'failed');
    return Response.json({ error: 'Invalid sign-in request.' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    recordAdministratorLogin('Administrator login failed', 'failed');
    return Response.json({ error: 'Invalid sign-in request.' }, { status: 400 });
  }

  const data = body as { email?: unknown; password?: unknown; method?: unknown; code?: unknown };
  const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
  const password = typeof data.password === 'string' ? data.password : '';

  if (!administratorDemoEnabled()) {
    if (!administratorAuthenticationConfigured()) {
      return Response.json({ error: 'Server-side administrator authentication is not configured.' }, { status: 503 });
    }
    let verified = false;
    try {
      verified = data.method === 'email' && verifyAdministratorCredentials(email, password, typeof data.code === 'string' ? data.code : '');
    } catch {
      return Response.json({ error: 'Administrator sign-in is temporarily unavailable.' }, { status: 503 });
    }
    if (!verified) {
      recordAdministratorLogin('Administrator login failed', 'denied');
      return Response.json({ error: 'Administrator credentials or verification code could not be verified.' }, { status: 401 });
    }
  } else if (data.method !== 'email' || !email || !password) {
    recordAdministratorLogin('Administrator login failed', 'denied');
    return Response.json({ error: 'Enter an administrator email and password to continue.' }, { status: 400 });
  }

  try {
    const { token } = createAdminSession(administratorDemoEnabled() ? 'development-demo' : 'password-totp');
    recordAdministratorLogin('Administrator login succeeded', 'success');
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    return Response.json({ ok: true }, {
      headers: {
        'Set-Cookie': `${clinicSessionCookieName}=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${clinicSessionTtlSeconds}${secure}`,
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    recordAdministratorLogin('Administrator login failed', 'failed');
    return Response.json({ error: 'Administrator session could not be created.' }, { status: 503 });
  }
}

export async function DELETE() {
  const cookieStore = await cookies();
  if (verifyAdminSession(cookieStore.get(clinicSessionCookieName)?.value)) {
    recordServerAuditEvent({
      module: 'authentication',
      action: 'Administrator logout',
      relatedRecordId: 'administrator-session',
      result: 'success',
      sessionId: null,
    });
  }
  return Response.json({ ok: true }, {
    headers: {
      'Set-Cookie': `${clinicSessionCookieName}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0`,
      'Cache-Control': 'no-store',
    },
  });
}
