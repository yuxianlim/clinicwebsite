import { demoKioskEnabled, DemoKioskError, requestDemoCode, verifyDemoCode } from '@/app/lib/demoKiosk.server';
import { checkKioskRequest } from '@/app/lib/kioskRateLimit.server';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  if (!demoKioskEnabled()) return Response.json({ error: 'Development kiosk verification is disabled.' }, { status: 404 });
  const limited = checkKioskRequest(request);
  if (limited) return limited;
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new DemoKioskError('Invalid demo request.');
    const value = (key: string) => typeof body[key] === 'string' ? body[key] : '';
    const result = body.action === 'request' ? requestDemoCode(value('lastFour'), value('fullPhone'))
      : body.action === 'verify' ? verifyDemoCode(value('challengeId'), value('code')) : null;
    if (!result) throw new DemoKioskError('Choose a valid demo action.');
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return Response.json({ error: error instanceof DemoKioskError ? error.message : 'Demo verification is temporarily unavailable.' }, { status: error instanceof DemoKioskError ? 400 : 503 }); }
}
