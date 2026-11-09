import { backup, DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.env.CLINIC_DATA_DIR ?? '/data';
const output = path.join(process.env.CLINIC_BACKUP_DIR ?? path.join(root, 'backups'), `${Date.now()}-${randomUUID()}`);
mkdirSync(output, { recursive: true, mode: 0o700 });
const sources = ['clinic-audit.sqlite', 'clinic-appointments.sqlite', 'clinic-auth.sqlite', 'clinic-login-limits.sqlite', 'clinic-rate-limits.sqlite'];
const files = [];
for (const name of sources) {
  const source = path.join(root, name);
  if (!existsSync(source)) {
    if (name === 'clinic-audit.sqlite' || name === 'clinic-appointments.sqlite') throw new Error(`${name} is missing`);
    continue;
  }
  const database = new DatabaseSync(source, { readOnly: true });
  const target = path.join(output, name);
  try { await backup(database, target); } finally { database.close(); }
  const check = new DatabaseSync(target, { readOnly: true });
  try {
    const rows = check.prepare('PRAGMA integrity_check').all();
    if (rows.length !== 1 || Object.values(rows[0])[0] !== 'ok') throw new Error(`${name} integrity check failed`);
  } finally { check.close(); }
  chmodSync(target, 0o600);
  files.push({ name, sha256: createHash('sha256').update(readFileSync(target)).digest('hex') });
}
writeFileSync(path.join(output, 'manifest.json'), JSON.stringify({ createdAt: new Date().toISOString(), files }, null, 2), { mode: 0o600, flag: 'wx' });
console.log(output);
