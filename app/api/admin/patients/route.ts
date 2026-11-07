import { cookies } from 'next/headers';
import { clinicSessionCookieName, verifyAdminSession } from '@/app/lib/serverClinicSession';
import { createClinicPatient, listClinicPatients } from '@/app/lib/auditStore.server';

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
    return Response.json({ patients: listClinicPatients() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Patient records are temporarily unavailable.' }, { status: 503 });
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
    return Response.json({ error: 'Enter valid patient details.' }, { status: 400 });
  }
  if (
    !isRecord(body)
    || Object.keys(body).some((key) => !['firstName', 'lastName', 'phone'].includes(key))
    || typeof body.firstName !== 'string'
    || typeof body.lastName !== 'string'
    || typeof body.phone !== 'string'
    || body.firstName.trim().length < 1
    || body.firstName.trim().length > 60
    || body.lastName.trim().length < 1
    || body.lastName.trim().length > 60
    || body.phone.trim().length > 30
    || (body.phone.match(/\d/g)?.length ?? 0) < 10
  ) {
    return Response.json({ error: 'Enter a first name, last name, and phone number with at least 10 digits.' }, { status: 400 });
  }
  try {
    const patient = createClinicPatient({
      firstName: body.firstName.trim(),
      lastName: body.lastName.trim(),
      phone: body.phone.trim(),
      sessionId: session.sessionId,
    });
    return Response.json({ patient }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && /UNIQUE constraint failed: clinic_patients\.normalized_phone/.test(error.message)) {
      return Response.json({ error: 'A patient with that phone number is already registered.' }, { status: 409 });
    }
    return Response.json({ error: 'Patient record could not be saved.' }, { status: 503 });
  }
}
