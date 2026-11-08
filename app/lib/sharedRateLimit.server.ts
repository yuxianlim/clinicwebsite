import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/** Shared by workers using the same local SQLite file; not a cross-host store. */
export class SharedRateLimiter {
  private database: DatabaseSync;

  constructor(databasePath: string, private maximum: number, private windowMs: number) {
    if (!Number.isSafeInteger(maximum) || maximum < 1 || !Number.isSafeInteger(windowMs) || windowMs < 1) {
      throw new Error('Invalid rate-limit configuration.');
    }
    mkdirSync(path.dirname(databasePath), { recursive: true, mode: 0o700 });
    this.database = new DatabaseSync(databasePath);
    this.database.exec(`
      PRAGMA busy_timeout = 5000;
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS request_attempts (bucket TEXT NOT NULL, attempted_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS request_attempts_bucket_time ON request_attempts(bucket, attempted_at);
      CREATE INDEX IF NOT EXISTS request_attempts_expiry ON request_attempts(attempted_at);
    `);
  }

  consume(bucket: string, now = Date.now()): boolean {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.database.prepare('DELETE FROM request_attempts WHERE attempted_at <= ?').run(now - this.windowMs);
      const { count } = this.database.prepare('SELECT count(*) AS count FROM request_attempts WHERE bucket = ?').get(bucket) as { count: number };
      if (count < this.maximum) {
        this.database.prepare('INSERT INTO request_attempts(bucket, attempted_at) VALUES (?, ?)').run(bucket, now);
      }
      this.database.exec('COMMIT');
      return count >= this.maximum;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  status() {
    this.database.prepare('SELECT 1 FROM request_attempts LIMIT 1').get();
    return { storage: 'SQLite', scope: 'workers sharing one local database file', checkedAt: new Date().toISOString() };
  }

  close() { this.database.close(); }
}
