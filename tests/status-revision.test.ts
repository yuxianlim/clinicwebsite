import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { systemStatusRevision } from '../app/lib/systemStatusRevision.server';

test('read-only status revisions detect database, WAL, configuration and backup changes without exposing them', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'status-revision-'));
  process.env.AUDIT_LOG_DB_PATH = path.join(root, 'audit.sqlite');
  process.env.CLINIC_APPOINTMENTS_DB_PATH = path.join(root, 'appointments.sqlite');
  process.env.CLINIC_BACKUP_DIR = path.join(root, 'backups');
  process.env.CLINIC_SESSION_SECRET = 'fictional-test-session-secret-for-revisions';
  try {
    const initial = await systemStatusRevision();
    assert.match(initial, /^[0-9a-f]{64}$/);
    assert.equal(await systemStatusRevision(), initial, 'reads do not create a change');
    writeFileSync(process.env.AUDIT_LOG_DB_PATH, 'fictional audit bytes');
    let previous = await systemStatusRevision();
    assert.notEqual(previous, initial);
    writeFileSync(`${process.env.AUDIT_LOG_DB_PATH}-wal`, 'fictional pending WAL bytes');
    let current = await systemStatusRevision();
    assert.notEqual(current, previous, 'WAL writes are detected before checkpoint'); previous = current;
    writeFileSync(process.env.CLINIC_APPOINTMENTS_DB_PATH, 'fictional appointment bytes');
    current = await systemStatusRevision(); assert.notEqual(current, previous); previous = current;
    process.env.ENABLE_DEVELOPMENT_CEU_DEMO = 'true';
    current = await systemStatusRevision(); assert.notEqual(current, previous); previous = current;
    const snapshot = path.join(process.env.CLINIC_BACKUP_DIR, '1234567890123-11111111-1111-4111-8111-111111111111');
    mkdirSync(snapshot, { recursive: true });
    for (const file of ['manifest.json', 'audit.sqlite', 'appointments.sqlite']) writeFileSync(path.join(snapshot, file), 'fictional backup bytes');
    current = await systemStatusRevision(); assert.notEqual(current, previous); previous = current;
    const corrupted = path.join(snapshot, 'audit.sqlite');
    utimesSync(corrupted, new Date(1000), new Date(2000));
    current = await systemStatusRevision(); assert.notEqual(current, previous, 'snapshot modification triggers fresh integrity checks');
    assert.equal(await systemStatusRevision(), current);
    assert.equal(current.includes(root), false);
    assert.equal(current.includes(process.env.CLINIC_SESSION_SECRET), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
