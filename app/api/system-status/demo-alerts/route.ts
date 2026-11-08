import { cookies } from 'next/headers';
import { randomUUID } from 'node:crypto';
import { clinicSessionCookieName, verifyAdminSession } from '@/app/lib/serverClinicSession';
import { demoAlertsEnabled, deliverDemoAlert, listDemoAlerts } from '@/app/lib/demoAlerts.server';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store' };
const allowed = async () => demoAlertsEnabled() && Boolean(verifyAdminSession((await cookies()).get(clinicSessionCookieName)?.value));
export async function GET() {
  if (!await allowed()) return Response.json({ error: 'Development administrator access required.' }, { status: 403, headers });
  try { return Response.json({ alerts: listDemoAlerts() }, { headers }); }
  catch { return Response.json({ error: 'The local demo inbox is unavailable.' }, { status: 503, headers }); }
}
export async function POST(request: Request) {
  if (!await allowed()) return Response.json({ error: 'Development administrator access required.' }, { status: 403, headers });
  if (request.headers.get('origin')) {
    try { if (new URL(request.headers.get('origin')!).host !== request.headers.get('host')) throw new Error('Origin mismatch.'); }
    catch { return Response.json({ error: 'Request origin rejected.' }, { status: 403, headers }); }
  }
  try {
    const alert = deliverDemoAlert({ eventId: `demo-alert-${randomUUID()}`, occurredAt: new Date().toISOString(), environment: 'development', service: 'clinic-application', severity: 'warning', code: 'SIMULATED_HEALTH_WARNING' });
    return Response.json({ alert }, { headers });
  } catch { return Response.json({ error: 'The local test alert could not be stored.' }, { status: 503, headers }); }
}
