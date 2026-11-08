import { createHash, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Secret, TOTP } from 'otpauth';

export const administratorDemoEnabled = () => process.env.NODE_ENV === 'development'
  && process.env.ENABLE_DEVELOPMENT_ADMIN_DEMO === 'true';

export const administratorAuthenticationConfigured = () => Boolean(
  process.env.CLINIC_ADMIN_EMAIL && process.env.CLINIC_ADMIN_PASSWORD
  && (process.env.CLINIC_SESSION_SECRET?.length ?? 0) >= 32
  && /^[A-Z2-7]{32,}$/i.test(process.env.CLINIC_ADMIN_TOTP_SECRET ?? ''),
);

const matches = (actual: string, expected: string) => timingSafeEqual(
  createHash('sha256').update(actual).digest(), createHash('sha256').update(expected).digest(),
);

/** A code can only create one session, including across workers and process restarts. */
export const verifyAdministratorCredentials = (
  email: string, password: string, code: string, now = Date.now(),
): boolean => {
  if (!administratorAuthenticationConfigured()) return false;
  if (!matches(email.trim().toLowerCase(), process.env.CLINIC_ADMIN_EMAIL!.trim().toLowerCase())
    || !matches(password, process.env.CLINIC_ADMIN_PASSWORD!) || !/^\d{6}$/.test(code)) return false;
  const totp = new TOTP({ secret: Secret.fromBase32(process.env.CLINIC_ADMIN_TOTP_SECRET!), algorithm: 'SHA1', digits: 6, period: 30 });
  const delta = totp.validate({ token: code, timestamp: now, window: 1 });
  if (delta === null) return false;
  const counter = Math.floor(now / 30_000) + delta;
  const file = process.env.CLINIC_AUTH_DB_PATH ?? path.join(process.cwd(), '.data', 'clinic-auth.sqlite');
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const database = new DatabaseSync(file);
  try {
    database.exec('PRAGMA busy_timeout = 5000; CREATE TABLE IF NOT EXISTS consumed_admin_totp (credential TEXT PRIMARY KEY, counter INTEGER NOT NULL)');
    const credential = createHash('sha256').update(process.env.CLINIC_ADMIN_TOTP_SECRET!).digest('hex');
    const result = database.prepare(`
      INSERT INTO consumed_admin_totp(credential, counter) VALUES (?, ?)
      ON CONFLICT(credential) DO UPDATE SET counter = excluded.counter
      WHERE excluded.counter > consumed_admin_totp.counter
    `).run(credential, counter);
    return result.changes === 1;
  } finally { database.close(); }
};
