import path from 'node:path';
import { createHash } from 'node:crypto';
import { SharedRateLimiter } from './sharedRateLimit.server';

const state = globalThis as typeof globalThis & { clinicKioskLimiter?: SharedRateLimiter };
const getLimiter = () => state.clinicKioskLimiter ??= new SharedRateLimiter(
  process.env.KIOSK_RATE_LIMIT_DB_PATH
    ?? path.join(process.cwd(), '.data', 'clinic-rate-limits.sqlite'),
  8,
  60_000,
);

export const isKioskRateLimited = (request: Request) => {
  // Trust a header only behind a proxy that overwrites client-supplied values.
  // Otherwise all requests share a conservative fallback bucket.
  const header = process.env.KIOSK_TRUSTED_IP_HEADER;
  const address = header ? request.headers.get(header)?.trim() || 'unknown' : 'unknown';
  const key = createHash('sha256').update(address).digest('hex');
  return getLimiter().consume(key);
};

export const checkKioskRequest = (request: Request): Response | null => {
  try {
    return isKioskRateLimited(request)
      ? Response.json({ error: 'Too many attempts. Please see the front desk for assistance.' }, {
        status: 429, headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' },
      })
      : null;
  } catch {
    // A storage failure must never remove abuse protection.
    return Response.json({ error: 'Check-in is temporarily unavailable. Please see the front desk.' }, { status: 503 });
  }
};

export const getKioskRateLimitStatus = () => getLimiter().status();
