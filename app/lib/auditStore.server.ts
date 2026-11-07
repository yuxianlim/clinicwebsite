import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { AuditEvent, AuditModule, AuditResult } from './auditLog';

const GENESIS_HASH = 'GENESIS';
const LEGACY_GENESIS_HASH = '0'.repeat(64);
const services: Record<AuditModule, { actorId: string; role: string }> = {
  appointments: { actorId: 'clinic-public-booking', role: 'service' },
  'check-in': { actorId: 'clinic-patient-kiosk', role: 'service' },
  payments: { actorId: 'clinic-ceu-payments', role: 'service' },
  ceu: { actorId: 'clinic-education', role: 'service' },
  authentication: { actorId: 'clinic-authentication', role: 'service' },
  administration: { actorId: 'clinic-admin-management', role: 'administrator' },
};

const safeSummaries: Record<string, string> = {
  'appointments:Appointment created': 'An appointment was added to the clinic schedule.',
  'appointments:Appointment changed': 'An appointment was changed in the clinic schedule.',
  'appointments:Appointment change denied': 'An appointment change was denied.',
  'check-in:Patient verification succeeded': 'Patient verification succeeded without storing the verification value.',
  'check-in:Patient verification failed': 'Patient verification failed without storing the submitted value.',
  'check-in:Appointment lookup failed': 'No appointment matched the verified patient for the requested visit.',
  'check-in:Patient checked in': 'A patient check-in was recorded.',
  'check-in:Check-in rejected': 'The requested appointment record was not found.',
  'check-in:Duplicate check-in prevented': 'A duplicate check-in was prevented.',
  'payments:CEU payment setup succeeded': 'A CEU payment intent was created; this does not confirm payment.',
  'payments:CEU payment setup failed': 'Payment intent setup failed.',
  'payments:CEU payment failed': 'The client reported that payment confirmation failed.',
  'payments:CEU payment succeeded': 'The client reported successful payment confirmation.',
  'payments:CEU payment pending': 'The client reported that payment is still pending.',
  'payments:CEU payment outcome unknown': 'The client could not determine the payment outcome.',
  'ceu:CEU enrollment reported': 'The client reported CEU enrollment after payment confirmation.',
  'ceu:CEU certificate issued': 'A CEU certificate was issued.',
  'authentication:Administrator login succeeded': 'Administrator authentication succeeded.',
  'authentication:Administrator login failed': 'An administrator login attempt failed.',
  'authentication:Administrator logout': 'An administrator session was ended.',
  'authentication:Audit log access denied': 'Audit log access was denied to an unauthenticated request.',
  'authentication:Demo patient session started': 'The local demo patient-access flow was selected; no patient identity provider was used.',
  'authentication:Demo login input rejected': 'The local demo sign-in form rejected incomplete input.',
  'administration:Administrative change recorded': 'An administrative change was recorded.',
  'administration:Administrative change denied': 'An administrative change was denied.',
};

const databasePath = process.env.AUDIT_LOG_DB_PATH
  ? path.resolve(process.env.AUDIT_LOG_DB_PATH)
  : path.join(process.cwd(), '.data', 'clinic-audit.sqlite');
const globalDatabase = globalThis as typeof globalThis & { clinicAuditDatabase?: DatabaseSync };

type AuditRow = {
  sequence: number;
  occurred_at: string;
  event_id: string;
  module: AuditModule;
  actor_id: string;
  role: string;
  action: string;
  related_record_id: string;
  result: AuditResult;
  session_id: string | null;
  safe_change_summary: string;
  previous_hash: string;
  entry_hash: string;
};

const auditRowToEvent = (row: AuditRow): AuditEvent => ({
  occurredAt: row.occurred_at,
  eventId: row.event_id,
  module: row.module,
  actorId: row.actor_id,
  role: row.role,
  action: row.action,
  relatedRecordId: row.related_record_id,
  result: row.result,
  sessionId: row.session_id,
  safeChangeSummary: row.safe_change_summary,
  previousHash: row.previous_hash,
  entryHash: row.entry_hash,
});

const hashAuditEvent = (event: AuditEvent, previousHash: string) => createHash('sha256').update(JSON.stringify({
  occurredAt: event.occurredAt,
  eventId: event.eventId,
  module: event.module,
  actorId: event.actorId,
  role: event.role,
  action: event.action,
  relatedRecordId: event.relatedRecordId,
  result: event.result,
  sessionId: event.sessionId,
  safeChangeSummary: event.safeChangeSummary,
  previousHash,
})).digest('hex');

const hasValidAuditChain = (events: AuditEvent[], genesisHash: string) => {
  let previousHash = genesisHash;
  for (const event of events) {
    if (event.previousHash !== previousHash || event.entryHash !== hashAuditEvent(event, previousHash)) return false;
    previousHash = event.entryHash;
  }
  return true;
};

const readAuditRowsInOrder = (database: DatabaseSync) => database.prepare(`
  SELECT sequence, occurred_at, event_id, module, actor_id, role, action, related_record_id,
    result, session_id, safe_change_summary, previous_hash, entry_hash
  FROM audit_log ORDER BY sequence ASC
`).all() as AuditRow[];

const createImmutabilityTriggers = (database: DatabaseSync) => database.exec(`
  CREATE TRIGGER IF NOT EXISTS audit_log_no_update
    BEFORE UPDATE ON audit_log BEGIN
      SELECT RAISE(ABORT, 'audit_log entries are immutable');
    END;
  CREATE TRIGGER IF NOT EXISTS audit_log_no_delete
    BEFORE DELETE ON audit_log BEGIN
      SELECT RAISE(ABORT, 'audit_log entries are immutable');
    END;
`);

const migrateLegacyGenesis = (database: DatabaseSync) => {
  const firstRow = database.prepare('SELECT previous_hash FROM audit_log ORDER BY sequence ASC LIMIT 1').get() as { previous_hash: string } | undefined;
  if (firstRow?.previous_hash !== LEGACY_GENESIS_HASH) return;

  const rows = readAuditRowsInOrder(database);
  const events = rows.map(auditRowToEvent);
  if (!hasValidAuditChain(events, LEGACY_GENESIS_HASH)) return;

  database.exec('BEGIN IMMEDIATE');
  try {
    database.exec('DROP TRIGGER IF EXISTS audit_log_no_update; DROP TRIGGER IF EXISTS audit_log_no_delete;');
    const update = database.prepare('UPDATE audit_log SET previous_hash = ?, entry_hash = ? WHERE sequence = ?');
    let previousHash = GENESIS_HASH;
    for (const [index, event] of events.entries()) {
      const entryHash = hashAuditEvent(event, previousHash);
      update.run(previousHash, entryHash, rows[index].sequence);
      previousHash = entryHash;
    }
    createImmutabilityTriggers(database);
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
};

const getDatabase = () => {
  let database = globalDatabase.clinicAuditDatabase;

  if (!database) {
    mkdirSync(path.dirname(databasePath), { recursive: true });
    database = new DatabaseSync(databasePath);
    globalDatabase.clinicAuditDatabase = database;
    database.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS audit_log (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        occurred_at TEXT NOT NULL,
        event_id TEXT NOT NULL UNIQUE,
        module TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        role TEXT NOT NULL,
        action TEXT NOT NULL,
        related_record_id TEXT NOT NULL,
        result TEXT NOT NULL,
        session_id TEXT,
        safe_change_summary TEXT NOT NULL,
        previous_hash TEXT NOT NULL,
        entry_hash TEXT NOT NULL UNIQUE
      );
    `);
  }
  database.exec('PRAGMA busy_timeout = 5000;');
  migrateLegacyGenesis(database);
  createImmutabilityTriggers(database);
  return database;
};

type NewAuditEvent = {
  module: AuditModule;
  action: string;
  relatedRecordId: string;
  result: AuditResult;
  sessionId: string | null;
};

export const appendAuditEvent = (input: NewAuditEvent): AuditEvent => {
  const database = getDatabase();
  const { actorId, role } = services[input.module];
  const occurredAt = new Date().toISOString();
  const eventId = randomUUID();
  const safeChangeSummary = safeSummaries[`${input.module}:${input.action}`];
  if (!safeChangeSummary) throw new Error('Unsupported audit action.');

  database.exec('BEGIN IMMEDIATE');
  try {
    const last = database.prepare('SELECT entry_hash FROM audit_log ORDER BY sequence DESC LIMIT 1').get() as { entry_hash: string } | undefined;
    const previousHash = last?.entry_hash ?? GENESIS_HASH;
    const entryHash = hashAuditEvent({
      occurredAt,
      eventId,
      module: input.module,
      actorId,
      role,
      action: input.action,
      relatedRecordId: input.relatedRecordId,
      result: input.result,
      sessionId: input.sessionId,
      safeChangeSummary,
      previousHash,
      entryHash: '',
    }, previousHash);

    database.prepare(`
      INSERT INTO audit_log (
        occurred_at, event_id, module, actor_id, role, action, related_record_id,
        result, session_id, safe_change_summary, previous_hash, entry_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      occurredAt,
      eventId,
      input.module,
      actorId,
      role,
      input.action,
      input.relatedRecordId,
      input.result,
      input.sessionId,
      safeChangeSummary,
      previousHash,
      entryHash,
    );
    database.exec('COMMIT');

    return {
      occurredAt,
      eventId,
      module: input.module,
      actorId,
      role,
      action: input.action,
      relatedRecordId: input.relatedRecordId,
      result: input.result,
      sessionId: input.sessionId,
      safeChangeSummary,
      previousHash,
      entryHash,
    };
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
};

export const recordServerAuditEvent = (input: NewAuditEvent) => {
  try {
    appendAuditEvent(input);
  } catch {
    console.error('Server-side audit event could not be persisted.');
  }
};

export const listAuditEvents = (limit: number): AuditEvent[] => {
  const database = getDatabase();
  const rows = database.prepare(`
    SELECT sequence, occurred_at, event_id, module, actor_id, role, action, related_record_id,
      result, session_id, safe_change_summary, previous_hash, entry_hash
    FROM audit_log ORDER BY sequence DESC LIMIT ?
  `).all(limit) as AuditRow[];

  return rows.map(auditRowToEvent);
};

export const verifyAuditChain = () => hasValidAuditChain(
  readAuditRowsInOrder(getDatabase()).map(auditRowToEvent),
  GENESIS_HASH,
);