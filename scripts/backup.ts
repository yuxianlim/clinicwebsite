import { loadEnvConfig } from '@next/env';
import { backupDirectory, backupSources, createVerifiedBackup } from '../app/lib/databaseBackup.server';

loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production');

const main = async () => {
try {
  const { receipt } = await createVerifiedBackup(backupSources(), backupDirectory());
  console.log(`Backup and isolated restore verification passed at ${receipt.checkedAt}.`);
  console.log('Snapshots are consistent per database. Schedule during a maintenance window for cross-database consistency.');
  console.log('Keep encrypted off-host copies and define retention before treating this as disaster recovery.');
} catch {
  console.error('Backup or isolated restore verification failed; no successful backup receipt was written.');
  process.exitCode = 1;
}
};

void main();
