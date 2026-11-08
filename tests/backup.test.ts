import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { latestVerifiedBackup } from '../app/lib/backupStatus.server';
import { createVerifiedBackup, restoreVerifiedBackup, verifyDatabaseSnapshot } from '../app/lib/databaseBackup.server';

test('online backup includes WAL writes, restores separately, and detects later corruption', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'clinic-backup-'));
  const sources = { audit: path.join(root, 'audit.sqlite'), appointments: path.join(root, 'appointments.sqlite') };
  process.env.AUDIT_LOG_DB_PATH = sources.audit;
  process.env.CLINIC_APPOINTMENTS_DB_PATH = sources.appointments;
  process.env.CLINIC_BACKUP_DIR = path.join(root, 'backups');
  const { appendAuditEvent, getAuditStoreStatus } = await import('../app/lib/auditStore.server');
  const { createAppointment } = await import('../app/lib/appointmentStore.server');
  appendAuditEvent({ module: 'appointments', action: 'Appointment created', relatedRecordId: 'backup-test', result: 'success', sessionId: null });
  createAppointment({ name: 'Fictional Test', contact: '4085550199', date: '2099-01-01', time: '9:00 AM', practitioner: '李医生' });
  try {
    const result = await createVerifiedBackup(sources, process.env.CLINIC_BACKUP_DIR);
    assert.ok(await latestVerifiedBackup());
    const recovery = path.join(root, 'recovery');
    restoreVerifiedBackup(result.directory, recovery);
    assert.doesNotThrow(() => verifyDatabaseSnapshot(path.join(recovery, 'audit.sqlite'), true));
    assert.throws(() => restoreVerifiedBackup(result.directory, recovery), /EEXIST/);
    assert.doesNotThrow(() => verifyDatabaseSnapshot(path.join(recovery, 'audit.sqlite'), true));
    assert.equal(statSync(result.directory).mode & 0o077, 0);
    const audit = path.join(result.directory, 'audit.sqlite');
    const appointments = path.join(result.directory, 'appointments.sqlite');
    assert.equal(statSync(audit).mode & 0o077, 0);
    assert.doesNotThrow(() => verifyDatabaseSnapshot(audit, true));
    const restored = new DatabaseSync(appointments, { readOnly: true });
    assert.equal((restored.prepare('SELECT count(*) as count FROM appointments').get() as { count: number }).count, 1);
    restored.close();
    const changed = new DatabaseSync(audit);
    changed.exec("DROP TRIGGER audit_log_no_update; UPDATE audit_log SET result = 'failed'");
    changed.close();
    assert.throws(() => verifyDatabaseSnapshot(audit, true), /audit-chain/);
    assert.equal(await latestVerifiedBackup(), null);
    assert.equal(getAuditStoreStatus().chainValid, true, 'restore checks never modify the working database');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a missing source cannot create a misleading successful backup', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'clinic-missing-backup-'));
  try {
    await assert.rejects(createVerifiedBackup({ audit: path.join(root, 'absent.sqlite'), appointments: path.join(root, 'also-absent.sqlite') }, path.join(root, 'backups')));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
