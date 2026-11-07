import { appendAuditEvent } from '@/app/lib/auditStore.server';
import { findKioskAppointment } from '@/app/lib/appointmentStore.server';
import { isKioskRateLimited } from '@/app/lib/kioskRateLimit.server';

export const runtime = 'nodejs';

const clinicDate = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Los_Angeles',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());

const recordKioskEvent = (action: string, result: 'success' | 'denied' | 'failed', relatedRecordId: string) => {
  try {
    appendAuditEvent({
      module: 'check-in',
      action,
      relatedRecordId,
      result,
      sessionId: null,
    });
  } catch {
    console.error('Kiosk lookup audit event could not be persisted.');
  }
};

export async function POST(request: Request) {
  if (isKioskRateLimited(request)) {
    return Response.json({ error: 'Too many lookup attempts. Please see the front desk for assistance.' }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    recordKioskEvent('Patient verification failed', 'denied', 'patient-verification');
    return Response.json({ error: 'Enter exactly four digits from the phone number on your patient record.' }, { status: 400 });
  }

  if (
    !body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).length !== 1
    || typeof (body as Record<string, unknown>).lastFour !== 'string'
    || !/^\d{4}$/.test((body as Record<string, unknown>).lastFour as string)
  ) {
    recordKioskEvent('Patient verification failed', 'denied', 'patient-verification');
    return Response.json({ error: 'Enter exactly four digits from the phone number on your patient record.' }, { status: 400 });
  }

  try {
    const match = findKioskAppointment((body as { lastFour: string }).lastFour, clinicDate());
    if (!match) {
      recordKioskEvent('Appointment lookup failed', 'failed', 'appointment-lookup');
      return Response.json({ error: 'We could not verify an appointment for today. Please see the front desk.' }, { status: 404 });
    }

    recordKioskEvent('Patient verification succeeded', 'success', 'patient-verification');
    return Response.json({
      patient: match.patient,
      appointment: {
        id: match.appointment.id,
        date: match.appointment.date,
        time: match.appointment.time,
        practitioner: match.appointment.practitioner,
      },
      checkInToken: match.checkInToken,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    console.error('Kiosk appointment lookup failed.');
    return Response.json({ error: 'The appointment service is temporarily unavailable. Please see the front desk.' }, { status: 503 });
  }
}
