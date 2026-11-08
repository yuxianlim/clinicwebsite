import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('local demo alerts persist matching receipts, reject sensitive payloads and keep seed delivery idempotent', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'local-alerts-'));
  process.env.AUDIT_LOG_DB_PATH = path.join(root, 'audit.sqlite');
  process.env.ENABLE_DEVELOPMENT_INTEGRATION_SIMULATORS = 'true';
  const alerts = await import('../app/lib/demoAlerts.server');
  const audit = await import('../app/lib/auditStore.server');
  try {
    const seed = alerts.seedDemoAlert();
    assert.equal(alerts.seedDemoAlert().incidentId, seed.incidentId);
    const event = { eventId: 'demo-test-event', occurredAt: new Date().toISOString(), environment: 'development', service: 'clinic-application', severity: 'warning' as const, code: 'DEMO_PAYMENT_PENDING' };
    const receipt = alerts.deliverDemoAlert(event);
    assert.equal(receipt.eventId, event.eventId);
    assert.equal(receipt.source, 'local-demo-inbox');
    assert.equal(alerts.deliverDemoAlert(event).incidentId, receipt.incidentId);
    assert.throws(() => alerts.deliverDemoAlert({ ...event, code: 'SIMULATED_HEALTH_WARNING' }));
    assert.throws(() => alerts.deliverDemoAlert({ ...event, eventId: 'sensitive-payload', patientName: 'Forbidden' } as typeof event));
    assert.throws(() => alerts.deliverDemoAlert({ ...event, eventId: 'production-payload', environment: 'production' }));
    for (let index = 0; index < 55; index++) alerts.deliverDemoAlert({ ...event, eventId: `demo-history-${index}` });
    assert.equal(alerts.listDemoAlerts().length, 50);
    assert.equal(alerts.seedDemoAlert().incidentId, seed.incidentId, 'the seed stays idempotent outside the latest 50 inbox items');
    assert.equal(alerts.demoAlertStatus(true).status, 'Connected');
    assert.equal(alerts.demoAlertStatus(false).status, 'Failed');
    assert.equal(audit.getAuditStoreStatus().chainValid, true);
    process.env.ENABLE_DEVELOPMENT_INTEGRATION_SIMULATORS = 'false';
    assert.throws(() => alerts.deliverDemoAlert(event));
    assert.throws(() => alerts.listDemoAlerts());
  } finally { rmSync(root, { recursive: true, force: true }); }
});
