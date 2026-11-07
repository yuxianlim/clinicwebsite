import { createHash, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { recordServerAuditEvent } from '@/app/lib/auditStore.server';
import { createAdminSession, clinicSessionCookieName, clinicSessionTtlSeconds, verifyAdminSession } from '@/app/lib/serverClinicSession';

export const runtime = 'nodejs';

const matchesSecret = (value: string, expected: string) => {
  const actualHash = createHash('sha256').update(value).digest();
  const expectedHash = createHash('sha256').update(expected).digest();
  return timingSafeEqual(actualHash, expectedHash);
};

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

  const data = body as { email?: unknown; password?: unknown; method?: unknown };
  const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
  const password = typeof data.password === 'string' ? data.password : '';

  if (process.env.NODE_ENV === 'production') {
    const expectedEmail = process.env.CLINIC_ADMIN_EMAIL?.trim().toLowerCase();
    const expectedPassword = process.env.CLINIC_ADMIN_PASSWORD;
    if (!process.env.CLINIC_SESSION_SECRET || !expectedEmail || !expectedPassword) {
      recordAdministratorLogin('Administrator login failed', 'failed');
      return Response.json({ error: 'Server-side administrator authentication is not configured.' }, { status: 503 });
    }
    if (data.method !== 'email' || !matchesSecret(email, expectedEmail) || !matchesSecret(password, expectedPassword)) {
      recordAdministratorLogin('Administrator login failed', 'denied');
      return Response.json({ error: 'Administrator credentials could not be verified.' }, { status: 401 });
    }
  } else if (email.length === 0) {
    recordAdministratorLogin('Administrator login failed', 'denied');
    return Response.json({ error: 'Enter an administrator email to continue.' }, { status: 400 });
  }

  try {
    const { token } = createAdminSession();
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