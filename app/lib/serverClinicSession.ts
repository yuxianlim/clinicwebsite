import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

const SESSION_COOKIE = 'clinic_admin_session';
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const globalSession = globalThis as typeof globalThis & { clinicSessionSecret?: string };
const sessionSecret = process.env.CLINIC_SESSION_SECRET
  ?? (process.env.NODE_ENV === 'development'
    ? (globalSession.clinicSessionSecret ??= randomBytes(32).toString('hex'))
    : '');

interface ServerClinicSession {
  sessionId: string;
  role: 'admin';
  authenticationMethod: 'password-totp' | 'development-demo';
  permissions: ['audit-log:read'];
  expiresAt: number;
}

const sign = (payload: string) => createHmac('sha256', sessionSecret).update(payload).digest('base64url');

export const createAdminSession = (authenticationMethod: ServerClinicSession['authenticationMethod']) => {
  if (process.env.NODE_ENV === 'production' && authenticationMethod === 'development-demo') throw new Error('Demo sessions are not allowed in production.');
  if (!sessionSecret) throw new Error('CLINIC_SESSION_SECRET is required.');
  const session: ServerClinicSession = {
    sessionId: randomUUID(),
    role: 'admin',
    authenticationMethod,
    permissions: ['audit-log:read'],
    expiresAt: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url');
  return { token: `${payload}.${sign(payload)}`, session };
};

export const verifyAdminSession = (token?: string) => {
  if (!token || !sessionSecret) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  if (!payload || !signature) return null;

  const expected = Buffer.from(sign(payload));
  const supplied = Buffer.from(signature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as ServerClinicSession;
    if (
      session.role !== 'admin'
      || !['password-totp', 'development-demo'].includes(session.authenticationMethod)
      || (process.env.NODE_ENV === 'production' && session.authenticationMethod !== 'password-totp')
      || !Array.isArray(session.permissions)
      || !session.permissions.includes('audit-log:read')
      || typeof session.sessionId !== 'string'
      || !Number.isSafeInteger(session.expiresAt)
      || session.expiresAt <= Math.floor(Date.now() / 1000)
    ) return null;
    return session;
  } catch {
    return null;
  }
};

export const clinicSessionCookieName = SESSION_COOKIE;
export const clinicSessionTtlSeconds = SESSION_TTL_SECONDS;

const billingSign = (payload: string) => createHmac('sha256', sessionSecret).update(`billing-demo:${payload}`).digest('base64url');
export const billingDemoCookie = 'clinic_billing_demo_session';
export const createBillingDemoSession = () => {
  if (process.env.NODE_ENV === 'production' || !sessionSecret) throw new Error('Demo billing sessions are disabled.');
  const session = { sessionId: randomUUID(), role: 'clinic_staff' as const, source: 'development-fixture' as const, expiresAt: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS };
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url');
  return { token: `${payload}.${billingSign(payload)}`, session };
};
export const verifyBillingDemoSession = (token?: string) => {
  if (process.env.NODE_ENV === 'production' || !sessionSecret || !token) return null;
  const parts = token.split('.'); if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const expected = Buffer.from(billingSign(parts[0])); const supplied = Buffer.from(parts[1]);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  try {
    const session = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as ReturnType<typeof createBillingDemoSession>['session'];
    if (session.role !== 'clinic_staff' || session.source !== 'development-fixture' || typeof session.sessionId !== 'string' || !Number.isSafeInteger(session.expiresAt) || session.expiresAt <= Math.floor(Date.now() / 1000)) return null;
    return session;
  } catch { return null; }
};
