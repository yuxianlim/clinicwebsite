import { cookies } from 'next/headers';
import { appendAuditEvent } from '@/app/lib/auditStore.server';
import {
  AppointmentChangeConflictError,
  AppointmentSlotConflictError,
  changeAppointment,
  cancelAppointment,
  InvalidAppointmentError,
  listAppointments,
} from '@/app/lib/appointmentStore.server';
import { clinicSessionCookieName, verifyAdminSession } from '@/app/lib/serverClinicSession';

export const runtime = 'nodejs';

const getAdminSession = async () => {
  const cookieStore = await cookies();
  return verifyAdminSession(cookieStore.get(clinicSessionCookieName)?.value);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

export async function GET() {
  if (!await getAdminSession()) {
    return Response.json({ error: 'Administrator access required.' }, { status: 403 });
  }
  try {
    return Response.json({ appointments: listAppointments() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Appointment records are temporarily unavailable.' }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  const session = await getAdminSession();
  if (!session) return Response.json({ error: 'Administrator access required.' }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Enter valid appointment details.' }, { status: 400 });
  }
  if (
    !isRecord(body)
    || Object.keys(body).some((key) => !['id', 'date', 'time', 'practitioner'].includes(key))
    || typeof body.id !== 'string'
    || !/^[0-9a-f-]{36}$/i.test(body.id)
    || typeof body.date !== 'string'
    || typeof body.time !== 'string'
    || typeof body.practitioner !== 'string'
  ) {
    return Response.json({ error: 'Enter valid appointment details.' }, { status: 400 });
  }
  try {
    const appointment = changeAppointment({
      id: body.id,
      date: body.date,
      time: body.time,
      practitioner: body.practitioner,
    });
    try {
      appendAuditEvent({
        module: 'appointments',
        action: 'Admin appointment rescheduled',
        relatedRecordId: appointment.id,
        result: 'success',
        sessionId: session.sessionId,
      });
    } catch {
      return Response.json({ error: 'The appointment was saved, but its audit record could not be confirmed. Refresh before retrying.', appointment }, { status: 503 });
    }
    return Response.json({ appointment });
  } catch (error) {
    if (error instanceof InvalidAppointmentError) return Response.json({ error: error.message }, { status: 400 });
    if (error instanceof AppointmentSlotConflictError) return Response.json({ error: error.message }, { status: 409 });
    if (error instanceof AppointmentChangeConflictError) return Response.json({ error: error.message }, { status: 409 });
    return Response.json({ error: 'Appointment could not be changed.' }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  const session = await getAdminSession();
  if (!session) return Response.json({ error: 'Administrator access required.' }, { status: 403 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Select an appointment to cancel.' }, { status: 400 });
  }
  if (!isRecord(body) || Object.keys(body).length !== 1 || typeof body.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.id)) {
    return Response.json({ error: 'Select an appointment to cancel.' }, { status: 400 });
  }
  try {
    const appointment = cancelAppointment(body.id);
    try {
      appendAuditEvent({
        module: 'appointments',
        action: 'Admin appointment canceled',
        relatedRecordId: appointment.id,
        result: 'success',
        sessionId: session.sessionId,
      });
    } catch {
      return Response.json({ error: 'The appointment was canceled, but its audit record could not be confirmed. Refresh before retrying.', appointment }, { status: 503 });
    }
    return Response.json({ appointment });
  } catch (error) {
    if (error instanceof AppointmentChangeConflictError) return Response.json({ error: error.message }, { status: 409 });
    return Response.json({ error: 'Appointment could not be canceled.' }, { status: 503 });
  }
}
