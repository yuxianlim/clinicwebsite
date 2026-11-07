import { appendAuditEvent, listAuditEvents, recordServerAuditEvent, verifyAuditChain } from '@/app/lib/auditStore.server';
import type { AuditModule, AuditResult } from '@/app/lib/auditLog';
import { cookies } from 'next/headers';
import { clinicSessionCookieName, verifyAdminSession } from '@/app/lib/serverClinicSession';

export const runtime = 'nodejs';

const clientActions: Partial<Record<AuditModule, string[]>> = {
  appointments: ['Appointment created', 'Appointment changed', 'Appointment change denied'],
  'check-in': [
    'Patient verification succeeded',
    'Patient verification failed',
    'Appointment lookup failed',
    'Patient checked in',
    'Check-in rejected',
    'Duplicate check-in prevented',
  ],
  payments: [
    'CEU payment failed',
    'CEU payment succeeded',
    'CEU payment pending',
    'CEU payment outcome unknown',
  ],
  ceu: ['CEU enrollment reported'],
  authentication: ['Demo patient session started', 'Demo login input rejected'],
};
const results: AuditResult[] = ['success', 'denied', 'failed', 'pending'];
const safeFixedReferences = new Set([
  'patient-verification',
  'appointment-lookup',
  'admin-login',
  'patient-login',
  'fall-prevention',
  'women-health',
  'children-health',
]);

const isSafeRelatedRecordId = (value: string) => (
  safeFixedReferences.has(value)
  || /^\d{13}-0\.\d+$/.test(value)
  || /^demo-appointment-\d{4}-\d{2}-\d{2}$/i.test(value)
);

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const session = verifyAdminSession(cookieStore.get(clinicSessionCookieName)?.value);
  if (!session) {
    recordServerAuditEvent({
      module: 'authentication',
      action: 'Audit log access denied',
      relatedRecordId: 'audit-log',
      result: 'denied',
      sessionId: null,
    });
    return Response.json({ error: 'Administrator audit permission required.' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const rawLimit = Number(searchParams.get('limit') ?? '100');
  const limit = Number.isInteger(rawLimit) ? Math.min(Math.max(rawLimit, 1), 500) : 100;
  return Response.json({ events: listAuditEvents(limit), chainValid: verifyAuditChain() }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return Response.json({ error: 'Invalid audit event.' }, { status: 400 });
  }

  const event = body as Record<string, unknown>;
  const module = event.module;
  const action = event.action;
  const relatedRecordId = event.relatedRecordId;
  const result = event.result;

  if (
    typeof module !== 'string'
    || !Object.prototype.hasOwnProperty.call(clientActions, module)
    || typeof action !== 'string'
    || !clientActions[module as AuditModule]?.includes(action)
    || typeof relatedRecordId !== 'string'
    || !isSafeRelatedRecordId(relatedRecordId)
    || typeof result !== 'string'
    || !results.includes(result as AuditResult)
  ) {
    return Response.json({ error: 'Audit event failed validation.' }, { status: 400 });
  }

  try {
    const saved = appendAuditEvent({
      module: module as AuditModule,
      action,
      relatedRecordId,
      result: result as AuditResult,
      sessionId: null,
    });
    return Response.json({ event: saved }, { status: 201 });
  } catch {
    return Response.json({ error: 'Audit event could not be persisted.' }, { status: 500 });
  }
}