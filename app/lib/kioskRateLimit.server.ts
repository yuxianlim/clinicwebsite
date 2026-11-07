const WINDOW_MS = 60_000;
const MAX_REQUESTS = 8;
const requests = new Map<string, number[]>();

export const isKioskRateLimited = (request: Request) => {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const forwardedAddresses = forwardedFor?.split(',').map((value) => value.trim()).filter(Boolean);
  const address = forwardedAddresses?.at(-1)
    || request.headers.get('x-real-ip')
    || 'unknown';
  const now = Date.now();
  if (requests.size > 1000) {
    for (const [key, times] of requests) {
      if (times.every((time) => now - time >= WINDOW_MS)) requests.delete(key);
    }
  }
  const recent = (requests.get(address) ?? []).filter((time) => now - time < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS) {
    requests.set(address, recent);
    return true;
  }
  recent.push(now);
  requests.set(address, recent);
  return false;
};
