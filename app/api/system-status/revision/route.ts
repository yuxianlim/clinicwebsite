import { cookies } from 'next/headers';
import { clinicSessionCookieName, verifyAdminSession } from '@/app/lib/serverClinicSession';
import { systemStatusRevision } from '@/app/lib/systemStatusRevision.server';

export const runtime = 'nodejs';
export async function GET() {
  const session = verifyAdminSession((await cookies()).get(clinicSessionCookieName)?.value);
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!session) return Response.json({ error: 'Administrator access required.' }, { status: 403, headers });
  try { return Response.json({ revision: await systemStatusRevision() }, { headers }); }
  catch { return Response.json({ error: 'Change detection is temporarily unavailable.' }, { status: 503, headers }); }
}
