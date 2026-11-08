import { appendAuditEvent } from '@/app/lib/auditStore.server';
import {
  AppointmentSlotConflictError,
  createAppointment,
  getUnavailableAppointmentTimes,
  InvalidAppointmentError,
  isValidAppointmentDate,
} from '@/app/lib/appointmentStore.server';
import { isValidPractitioner } from '@/app/lib/appointmentValidation';

export const runtime = 'nodejs';

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date') ?? '';
  const practitioner = searchParams.get('practitioner') ?? '';
  if (
    !isValidAppointmentDate(date)
    || !isValidPractitioner(practitioner)
  ) {
    return Response.json({ error: 'Choose a valid appointment date and practitioner.' }, { status: 400 });
  }

  try {
    const unavailableTimes = getUnavailableAppointmentTimes(date, practitioner);
    return Response.json({ unavailableTimes }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    console.error('Appointment availability could not be loaded.');
    return Response.json({ error: 'Appointment availability is temporarily unavailable.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid appointment request.' }, { status: 400 });
  }
  if (!isRecord(body)) return Response.json({ error: 'Invalid appointment request.' }, { status: 400 });

  const { name, contact, date, time, practitioner } = body;
  if (
    typeof name !== 'string'
    || typeof contact !== 'string'
    || typeof date !== 'string'
    || typeof time !== 'string'
    || typeof practitioner !== 'string'
    || Object.keys(body).some((key) => !['name', 'contact', 'date', 'time', 'practitioner'].includes(key))
  ) {
    return Response.json({ error: 'Provide a name, phone number, date, time, and practitioner.' }, { status: 400 });
  }

  try {
    const appointment = createAppointment({ name, contact, date, time, practitioner });
    try {
      appendAuditEvent({
        module: 'appointments',
        action: 'Appointment created',
        relatedRecordId: appointment.id,
        result: 'success',
        sessionId: null,
      });
    } catch {
      console.error('Appointment was saved, but its audit event could not be persisted.');
    }
    // A guest confirmation never reveals whether an existing patient was matched.
    return Response.json({ appointment: {
      id: appointment.id, name: appointment.name, contact: appointment.contact,
      date: appointment.date, time: appointment.time, practitioner: appointment.practitioner,
      timestamp: appointment.timestamp, status: appointment.status,
    } }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof InvalidAppointmentError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof AppointmentSlotConflictError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    console.error('Appointment could not be saved.');
    return Response.json({ error: 'Your appointment could not be saved. Please try again later.' }, { status: 503 });
  }
}
