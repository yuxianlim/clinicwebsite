import { createHmac, randomBytes } from 'node:crypto';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { backupDirectory, backupSources } from './backupStatus.server';

const globalRevision = globalThis as typeof globalThis & { statusRevisionSecret?: string };
const stamp = async (file: string) => {
  try {
    const value = await stat(/* turbopackIgnore: true */ file, { bigint: true });
    return [value.size, value.mtimeNs, value.ctimeNs, value.ino].map(String);
  } catch (error) { return [(error as NodeJS.ErrnoException).code ?? 'unavailable']; }
};

/** Read-only change detection, shared by workers using the same files/secret.
 * No records, filenames, credentials or checksums leave this server function. */
export const systemStatusRevision = async () => {
  const sources = backupSources();
  const stores = [...Object.values(sources), process.env.KIOSK_RATE_LIMIT_DB_PATH ?? path.join(process.cwd(), '.data', 'clinic-rate-limits.sqlite')];
  const files = stores.flatMap((source) => [source, `${source}-wal`]);
  const mode = process.env.NODE_ENV ?? 'development';
  files.push(...['.env', '.env.local', `.env.${mode}`, `.env.${mode}.local`].map((name) => path.join(process.cwd(), name)));
  const root = backupDirectory();
  files.push(root);
  let backupNames: string[] = [];
  try {
    backupNames = (await readdir(/* turbopackIgnore: true */ root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && /^\d+-[0-9a-f-]{36}$/.test(entry.name))
      .map((entry) => entry.name).sort();
    const latest = backupNames.at(-1);
    if (latest) files.push(...['manifest.json', 'audit.sqlite', 'appointments.sqlite'].map((name) => path.join(root, latest, name)));
  } catch { /* Missing backups are part of the stable revision, not a successful backup. */ }
  const configuration = [
    'NODE_ENV', 'ENABLE_DEVELOPMENT_ADMIN_DEMO', 'ENABLE_DEVELOPMENT_INTEGRATION_SIMULATORS', 'ENABLE_DEVELOPMENT_CEU_DEMO',
    'CLINIC_ADMIN_EMAIL', 'CLINIC_ADMIN_PASSWORD', 'CLINIC_ADMIN_TOTP_SECRET',
    'STRIPE_SECRET_KEY', 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', 'STRIPE_WEBHOOK_SECRET',
    'UBUNTU_HOST_HEALTH_URL', 'UBUNTU_HOST_HEALTH_TOKEN', 'DATABASE_SERVER_HEALTH_URL', 'DATABASE_SERVER_HEALTH_TOKEN',
    'AUDIT_LOG_DB_PATH', 'CLINIC_APPOINTMENTS_DB_PATH', 'CLINIC_BACKUP_DIR', 'KIOSK_RATE_LIMIT_DB_PATH', 'KIOSK_TRUSTED_IP_HEADER',
  ].map((key) => process.env[key] ?? '');
  const secret = process.env.CLINIC_SESSION_SECRET || (globalRevision.statusRevisionSecret ??= randomBytes(32).toString('hex'));
  const stamps = await Promise.all(files.map(stamp));
  return createHmac('sha256', secret).update(JSON.stringify({ files, stamps, configuration, backupNames })).digest('hex');
};
