import { randomUUID } from 'node:crypto';
import { learningDatabase, appendDemoAlertAudit } from './auditStore.server';
import { isMonitoringEvent, normalizeMonitoringReceipt, type MonitoringEvent } from './externalIntegrations.server';
import { fictionalWorkflowEnabled } from './deploymentMode';

export type DemoAlert = MonitoringEvent & { incidentId: string; receivedAt: string; source: 'local-demo-inbox' };
export const demoAlertsEnabled = () => fictionalWorkflowEnabled(process.env.ENABLE_DEVELOPMENT_INTEGRATION_SIMULATORS);
const database = () => {
  const db = learningDatabase();
  db.exec('CREATE TABLE IF NOT EXISTS demo_alerts (event_id TEXT PRIMARY KEY, occurred_at TEXT NOT NULL, severity TEXT NOT NULL, code TEXT NOT NULL, incident_id TEXT NOT NULL UNIQUE, received_at TEXT NOT NULL)');
  return db;
};
export const listDemoAlerts = (): DemoAlert[] => {
  if (!demoAlertsEnabled()) throw new Error('Local demo alerts are disabled.');
  const rows = database().prepare('SELECT * FROM demo_alerts ORDER BY rowid DESC LIMIT 50').all() as { event_id: string; occurred_at: string; severity: MonitoringEvent['severity']; code: string; incident_id: string; received_at: string }[];
  return rows.map((row) => ({ eventId: row.event_id, occurredAt: row.occurred_at, environment: 'development', service: 'clinic-application', severity: row.severity, code: row.code, incidentId: row.incident_id, receivedAt: row.received_at, source: 'local-demo-inbox' }));
};

/** Writes an actual local inbox receipt, never an invented external provider receipt. */
export const deliverDemoAlert = (event: MonitoringEvent): DemoAlert => {
  if (!demoAlertsEnabled() || !isMonitoringEvent(event) || event.environment !== 'development' || event.service !== 'clinic-application'
    || !['SIMULATED_HEALTH_WARNING', 'DEMO_CHECK_IN_FAILURE', 'DEMO_PAYMENT_PENDING'].includes(event.code)
    || Object.keys(event).some((key) => !['eventId', 'occurredAt', 'environment', 'service', 'severity', 'code'].includes(key))) throw new Error('Only allowlisted local demo alerts are accepted.');
  const db = database();
  db.exec('BEGIN IMMEDIATE');
  try {
    const existing = db.prepare('SELECT * FROM demo_alerts WHERE event_id = ?').get(event.eventId) as { occurred_at: string; severity: string; code: string } | undefined;
    if (existing && (existing.occurred_at !== event.occurredAt || existing.severity !== event.severity || existing.code !== event.code)) throw new Error('Event reference already belongs to another payload.');
    if (!existing) {
      const receipt = normalizeMonitoringReceipt({ accepted: true, eventId: event.eventId, incidentId: `demo-incident-${randomUUID()}`, receivedAt: new Date().toISOString() });
      if (!receipt || receipt.eventId !== event.eventId) throw new Error('Local receipt did not match the event.');
      db.prepare('INSERT INTO demo_alerts VALUES (?, ?, ?, ?, ?, ?)').run(event.eventId, event.occurredAt, event.severity, event.code, receipt.incidentId, receipt.receivedAt);
      appendDemoAlertAudit(event.eventId);
    }
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  const row = db.prepare('SELECT * FROM demo_alerts WHERE event_id = ?').get(event.eventId) as { incident_id: string; received_at: string };
  return { ...event, incidentId: row.incident_id, receivedAt: row.received_at, source: 'local-demo-inbox' };
};

export const seedDemoAlert = () => {
  if (!demoAlertsEnabled()) throw new Error('Local demo alerts are disabled.');
  const existing = database().prepare('SELECT occurred_at FROM demo_alerts WHERE event_id = ?').get('demo-setup-local-alert') as { occurred_at: string } | undefined;
  return deliverDemoAlert({ eventId: 'demo-setup-local-alert', occurredAt: existing?.occurred_at ?? new Date().toISOString(), environment: 'development', service: 'clinic-application', severity: 'warning', code: 'SIMULATED_HEALTH_WARNING' });
};

export const demoAlertStatus = (auditValid: boolean) => {
  let alerts: DemoAlert[] | null = null;
  try { alerts = listDemoAlerts(); } catch { /* Fail closed when local evidence cannot be read. */ }
  const connected = auditValid && Boolean(alerts?.length);
  return {
    kind: 'Connection', name: 'Demo monitoring: event -> local alert inbox',
    status: !alerts || !auditValid ? 'Failed' : connected ? 'Connected' : 'Partly Connected',
    description: 'The application stores allowlisted operational test events and matching receipts in a protected local demo inbox. No email, SMS or external alert service is contacted.',
    connectedComponents: ['Admin demo-alert API', 'Monitoring event validator', 'SQLite demo_alerts', 'Audit chain'],
    informationExchanged: 'Event ID, timestamps, allowlisted severity/code and matching local receipt. Patient, card and credential details are prohibited.',
    evidence: [`${alerts?.length ?? 0} local demo alert receipt(s) found.`, 'Local receipt delivery is separate from the format-only monitoring simulation and from external alert delivery.'],
    lastTestedAt: alerts?.[0]?.receivedAt ?? null,
    missingRequirement: connected ? null : 'Run demo setup or send a demo alert from the local inbox.',
    safeErrorMessage: !alerts || !auditValid ? 'Local demo alert evidence could not be verified.' : null,
  };
};
