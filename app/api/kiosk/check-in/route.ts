import { appendAuditEvent } from '@/app/lib/auditStore.server';
import { checkInServerAppointment } from '@/app/lib/appointmentStore.server';
import { checkKioskRequest } from '@/app/lib/kioskRateLimit.server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const limitedResponse = checkKioskRequest(request);
  if (limitedResponse) return limitedResponse;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'This appointment could not be checked in. Please see the front desk.' }, { status: 400 });
  }
  if (
    !body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).length !== 2
    || typeof (body as Record<string, unknown>).appointmentId !== 'string'
    || typeof (body as Record<string, unknown>).checkInToken !== 'string'
    || !/^[0-9a-f-]{36}$/i.test((body as Record<string, unknown>).appointmentId as string)
    || !/^[A-Za-z0-9_-]{43}$/.test((body as Record<string, unknown>).checkInToken as string)
  ) {
    return Response.json({ error: 'This appointment could not be checked in. Please see the front desk.' }, { status: 400 });
  }

  try {
    const result = checkInServerAppointment(
      (body as { appointmentId: string }).appointmentId,
      (body as { checkInToken: string }).checkInToken,
    );
    if (!result.ok) {
      const denied = result.reason === 'already-checked-in';
      if (result.reason !== 'invalid-token') {
        try {
          appendAuditEvent({
            module: 'check-in',
            action: denied ? 'Duplicate check-in prevented' : 'Check-in rejected',
            relatedRecordId: (body as { appointmentId: string }).appointmentId,
            result: denied ? 'denied' : 'failed',
            sessionId: null,
          });
        } catch {
          console.error('Kiosk check-in failure audit event could not be persisted.');
        }
      }
      return Response.json({
        error: denied
          ? 'This appointment has already been checked in. Please see the front desk if you need help.'
          : 'This appointment could not be checked in. Please see the front desk.',
      }, { status: denied ? 409 : 403 });
    }

    try {
      appendAuditEvent({
        module: 'check-in',
        action: 'Patient checked in',
        relatedRecordId: result.appointment.id,
        result: 'success',
        sessionId: null,
      });
    } catch {
      console.error('Appointment was checked in, but its audit event could not be persisted.');
    }
    return Response.json({
      checkedIn: true,
      checkedInAt: result.appointment.checkedInAt,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    console.error('Kiosk check-in could not be saved.');
    return Response.json({ error: 'Check-in is temporarily unavailable. Please see the front desk.' }, { status: 503 });
  }
}
