import { cookies } from 'next/headers';
import { clinicSessionCookieName, verifyAdminSession } from '@/app/lib/serverClinicSession';
import { createClinicStaff, listClinicStaff } from '@/app/lib/auditStore.server';

export const runtime = 'nodejs';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const getAdminSession = async () => {
  const cookieStore = await cookies();
  return verifyAdminSession(cookieStore.get(clinicSessionCookieName)?.value);
};

export async function GET() {
  if (!await getAdminSession()) {
    return Response.json({ error: 'Administrator access required.' }, { status: 403 });
  }
  try {
    return Response.json({ staff: listClinicStaff() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Staff records are temporarily unavailable.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return Response.json({ error: 'Administrator access required.' }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Enter valid staff details.' }, { status: 400 });
  }
  if (
    !isRecord(body)
    || Object.keys(body).some((key) => !['name', 'role', 'hours'].includes(key))
    || typeof body.name !== 'string'
    || typeof body.role !== 'string'
    || typeof body.hours !== 'string'
    || body.name.trim().length < 1
    || body.name.trim().length > 80
    || body.role.trim().length < 1
    || body.role.trim().length > 80
    || body.hours.trim().length < 1
    || body.hours.trim().length > 80
  ) {
    return Response.json({ error: 'Enter a name, role, and working hours.' }, { status: 400 });
  }
  try {
    const staff = createClinicStaff({
      name: body.name.trim(),
      role: body.role.trim(),
      hours: body.hours.trim(),
      sessionId: session.sessionId,
    });
    return Response.json({ staff }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && /clinic_staff_name_unique/.test(error.message)) {
      return Response.json({ error: 'A staff member with that name is already registered.' }, { status: 409 });
    }
    return Response.json({ error: 'Staff record could not be saved.' }, { status: 503 });
  }
}
