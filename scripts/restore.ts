import { restoreVerifiedBackup } from '../app/lib/databaseBackup.server';

const [source, destination] = process.argv.slice(2);
if (!source || !destination || process.argv.length !== 4) {
  console.error('Usage: npm run restore -- <snapshot-directory> <new-recovery-directory>');
  process.exitCode = 1;
} else {
  try {
    restoreVerifiedBackup(source, destination);
    console.log('Restored into the new recovery directory; checksum, integrity, and audit-chain verification passed.');
    console.log('Stop all application workers before changing database paths. Working databases were not replaced.');
  } catch {
    console.error('Restore refused or verification failed. Existing working files were not replaced.');
    process.exitCode = 1;
  }
}
