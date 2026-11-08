import { demoKioskEnabled, DemoKioskError, verifyDemoCard } from '@/app/lib/demoKiosk.server';
import { checkKioskRequest } from '@/app/lib/kioskRateLimit.server';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  if (!demoKioskEnabled()) return Response.json({ error: 'Development card input is disabled.' }, { status: 404 });
  const limited = checkKioskRequest(request);
  if (limited) return limited;
  try {
    const body = await request.json();
    if (!body || typeof body.token !== 'string' || body.token.length > 128) throw new DemoKioskError('A fictional card token is required.');
    return Response.json(verifyDemoCard(body.token), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return Response.json({ error: error instanceof DemoKioskError ? error.message : 'Card lookup is temporarily unavailable.' }, { status: error instanceof DemoKioskError ? 400 : 503 }); }
}
