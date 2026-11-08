import { randomUUID } from 'node:crypto';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';

import { digest, sourceFingerprint, type BackupSources, type BackupReceipt } from './backupStatus.server';
export { backupSources, backupDirectory } from './backupStatus.server';

export const verifyDatabaseSnapshot = (file: string, audit: boolean) => {
  const database = new DatabaseSync(file, { readOnly: true });
  try {
    const checks = database.prepare('PRAGMA integrity_check').all();
    if (checks.length !== 1 || Object.values(checks[0])[0] !== 'ok') throw new Error('Backup integrity check failed.');
    if (audit) {
      const rows = database.prepare('SELECT * FROM audit_log ORDER BY sequence').all();
      let previousHash = 'GENESIS';
      for (const row of rows) {
        const hash = digest(JSON.stringify({
          occurredAt: row.occurred_at, eventId: row.event_id, module: row.module,
          actorId: row.actor_id, role: row.role, action: row.action,
          relatedRecordId: row.related_record_id, result: row.result, sessionId: row.session_id,
          safeChangeSummary: row.safe_change_summary, previousHash,
        }));
        if (row.previous_hash !== previousHash || row.entry_hash !== hash) throw new Error('Backup audit-chain verification failed.');
        previousHash = hash;
      }
    } else {
      database.prepare('SELECT count(*) FROM appointments').get();
    }
  } finally {
    database.close();
  }
};

export const createVerifiedBackup = async (sources: BackupSources, outputRoot: string) => {
  mkdirSync(outputRoot, { recursive: true, mode: 0o700 });
  chmodSync(outputRoot, 0o700);
  const directory = path.join(outputRoot, `${Date.now()}-${randomUUID()}`);
  mkdirSync(directory, { mode: 0o700 });
  const restored = mkdtempSync(path.join(os.tmpdir(), 'clinic-restore-'));
  const files: BackupReceipt['files'] = [];
  try {
    for (const [kind, source] of Object.entries(sources)) {
      const name = `${kind}.sqlite`;
      const target = path.join(directory, name);
      const database = new DatabaseSync(source, { readOnly: true });
      try {
        // SQLite's online backup includes committed WAL contents; copying the live file does not.
        await backup(database, target);
      } finally {
        database.close();
      }
      chmodSync(target, 0o600);
      const restorePath = path.join(restored, name);
      copyFileSync(target, restorePath);
      chmodSync(restorePath, 0o600);
      verifyDatabaseSnapshot(restorePath, kind === 'audit');
      files.push({ name, sha256: digest(readFileSync(/* turbopackIgnore: true */ target)) });
    }
    const receipt: BackupReceipt = {
      checkedAt: new Date().toISOString(), sourceFingerprint: sourceFingerprint(sources),
      restoredAndVerified: true, files,
    };
    writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(receipt, null, 2), { mode: 0o600, flag: 'wx' });
    return { directory, receipt };
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  } finally {
    rmSync(restored, { recursive: true, force: true });
  }
};


/** Restore into a NEW directory only; switching the application to it is a separate operation. */
export const restoreVerifiedBackup = (sourceDirectory: string, destination: string) => {
  const receipt = JSON.parse(readFileSync(path.join(sourceDirectory, 'manifest.json'), 'utf8')) as BackupReceipt;
  if (receipt.restoredAndVerified !== true || !Array.isArray(receipt.files) || receipt.files.length !== 2) throw new Error('Invalid backup manifest.');
  for (const name of ['audit.sqlite', 'appointments.sqlite']) {
    const entry = receipt.files.find((file) => file.name === name);
    if (!entry || digest(readFileSync(path.join(sourceDirectory, name))) !== entry.sha256) throw new Error('Backup checksum verification failed.');
    verifyDatabaseSnapshot(path.join(sourceDirectory, name), name === 'audit.sqlite');
  }
  // No recursive flag: an existing directory is refused without changing its contents.
  mkdirSync(destination, { mode: 0o700 });
  try {
    for (const name of ['audit.sqlite', 'appointments.sqlite']) {
      const target = path.join(destination, name);
      copyFileSync(path.join(sourceDirectory, name), target);
      chmodSync(target, 0o600);
      verifyDatabaseSnapshot(target, name === 'audit.sqlite');
    }
  } catch (error) {
    rmSync(destination, { recursive: true, force: true });
    throw error;
  }
};
