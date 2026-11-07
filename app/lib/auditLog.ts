export type AuditModule = 'appointments' | 'check-in' | 'payments' | 'ceu' | 'authentication' | 'administration';
export type AuditResult = 'success' | 'denied' | 'failed' | 'pending';

export interface AuditEvent {
  occurredAt: string;
  eventId: string;
  module: AuditModule;
  actorId: string;
  role: string;
  action: string;
  relatedRecordId: string;
  result: AuditResult;
  sessionId: string | null;
  safeChangeSummary: string;
  previousHash: string;
  entryHash: string;
}

export const recordAuditEvent = async (event: {
  module: AuditModule;
  action: string;
  relatedRecordId: string;
  result: AuditResult;
}) => {
  try {
    const response = await fetch('/api/audit-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
      keepalive: true,
    });
    if (!response.ok) console.error('Central audit event was rejected by the server.');
  } catch {
    console.error('Central audit service could not be reached.');
  }
};

export const readAuditLog = async (): Promise<{ events: AuditEvent[]; chainValid: boolean }> => {
  const response = await fetch('/api/audit-log?limit=500', { cache: 'no-store' });
  if (!response.ok) throw new Error('Unable to load audit events.');
  const data = await response.json() as { events: AuditEvent[]; chainValid: boolean };
  if (!Array.isArray(data.events) || typeof data.chainValid !== 'boolean') throw new Error('Invalid audit log response.');
  return data;
};