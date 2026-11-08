import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

export type BackupSources = { audit: string; appointments: string };
export type BackupReceipt = {
  checkedAt: string;
  sourceFingerprint: string;
  restoredAndVerified: true;
  files: { name: string; sha256: string }[];
};
export const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export const backupSources = (): BackupSources => ({
  audit: process.env.AUDIT_LOG_DB_PATH ?? path.join(process.cwd(), '.data', 'clinic-audit.sqlite'),
  appointments: process.env.CLINIC_APPOINTMENTS_DB_PATH ?? path.join(process.cwd(), '.data', 'clinic-appointments.sqlite'),
});
export const backupDirectory = () => process.env.CLINIC_BACKUP_DIR ?? path.join(process.cwd(), '.data', 'backups');
export const sourceFingerprint = (sources: BackupSources) => digest(JSON.stringify(sources));

export const latestVerifiedBackup = async () => {
  const root = backupDirectory();
  try {
    const names = readdirSync(/* turbopackIgnore: true */ root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^\d+-[0-9a-f-]{36}$/.test(entry.name))
      .map((entry) => entry.name).sort().reverse();
    if (!names.length) return null;
    const directory = path.join(/*turbopackIgnore: true*/ root, names[0]);
    const receipt = JSON.parse(readFileSync(/* turbopackIgnore: true */ path.join(/*turbopackIgnore: true*/ directory, 'manifest.json'), 'utf8')) as BackupReceipt;
    const age = Date.now() - Date.parse(receipt.checkedAt);
    if (receipt.restoredAndVerified !== true || receipt.sourceFingerprint !== sourceFingerprint(backupSources())
      || !Number.isFinite(age) || age < 0 || age > 24 * 60 * 60 * 1000
      || !Array.isArray(receipt.files) || receipt.files.length !== 2) return null;
    for (const name of ['audit.sqlite', 'appointments.sqlite']) {
      const entry = receipt.files.find((file) => file.name === name);
      if (!entry || entry.sha256 !== digest(readFileSync(/* turbopackIgnore: true */ path.join(/*turbopackIgnore: true*/ directory, name)))) return null;
    }
    return { checkedAt: receipt.checkedAt };
  } catch { return null; }
};
