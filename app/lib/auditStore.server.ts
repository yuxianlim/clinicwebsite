import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { AuditEvent, AuditModule, AuditResult } from './auditLog';
import type { IntegrationSimulationTarget } from './externalIntegrations.server';
import { initialStaff, patients, type Patient, type StaffMember } from './clinicData';

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
  'appointments:Admin appointment rescheduled': 'An administrator rescheduled an appointment.',
  'appointments:Admin appointment canceled': 'An administrator canceled an appointment.',
  'appointments:Appointment change denied': 'An appointment change was denied.',
  'check-in:Patient verification succeeded': 'Patient verification succeeded without storing the verification value.',
  'check-in:Patient verification failed': 'Patient verification failed without storing the submitted value.',
  'check-in:Appointment lookup failed': 'No appointment matched the verified patient for the requested visit.',
  'check-in:Patient checked in': 'A patient check-in was recorded.',
  'check-in:Check-in rejected': 'The requested appointment record was not found.',
  'check-in:Duplicate check-in prevented': 'A duplicate check-in was prevented.',
  'payments:CEU payment setup succeeded': 'A CEU payment intent was created; this does not confirm payment.',
  'payments:CEU payment setup failed': 'Payment intent setup failed.',
  'payments:CEU payment failed': 'A signature-verified Stripe event reported that the payment failed.',
  'payments:CEU payment succeeded': 'A signature-verified Stripe event reported that the payment succeeded.',
  'payments:CEU payment pending': 'A signature-verified Stripe event reported that the payment is processing.',
  'payments:CEU payment canceled': 'Stripe confirmed that the payment was canceled.',
  'ceu:CEU enrollment reported': 'The client reported CEU enrollment after payment confirmation.',
  'ceu:CEU certificate issued': 'A CEU certificate was issued.',
  'ceu:Demo course payment verified': 'A signed Stripe sandbox event confirmed a demo learning purchase; no real CE credit was awarded.',
  'ceu:Demo final exam submitted': 'A demo final exam result was stored; no answers or learner details are included.',
  'ceu:Demo certificate issued': 'A clearly labeled non-credit demo completion document was issued.',
  'authentication:Administrator login succeeded': 'Administrator authentication succeeded.',
  'authentication:Administrator login failed': 'An administrator login attempt failed.',
  'authentication:Administrator logout': 'An administrator session was ended.',
  'authentication:Audit log access denied': 'Audit log access was denied to an unauthenticated request.',
  'authentication:Demo patient session started': 'The local demo patient-access flow was selected; no patient identity provider was used.',
  'authentication:Demo login input rejected': 'The local demo sign-in form rejected incomplete input.',
  'administration:Administrative change recorded': 'An administrative change was recorded.',
  'administration:Administrative change denied': 'An administrative change was denied.',
  'administration:Patient record created': 'A patient record was created without including patient details in the audit event.',
  'administration:Staff record created': 'A staff record was created without including staff details in the audit event.',
  'administration:Development Simulation recorded': 'A development-only fictional integration payload was processed; no external system or physical device was contacted.',
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
  database.exec(`
    CREATE TABLE IF NOT EXISTS verified_stripe_events (
      stripe_event_id TEXT PRIMARY KEY,
      payment_intent_id TEXT NOT NULL,
      topic_id TEXT NOT NULL,
      action TEXT NOT NULL,
      result TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      livemode INTEGER NOT NULL,
      stripe_created_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS ceu_enrollments (
      registration_id TEXT PRIMARY KEY,
      payment_intent_id TEXT NOT NULL UNIQUE,
      topic_id TEXT NOT NULL,
      learner_name TEXT NOT NULL,
      learner_email TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending_payment', 'enrolled')),
      created_at TEXT NOT NULL,
      enrolled_at TEXT
    );
    CREATE TABLE IF NOT EXISTS ceu_payment_setups (
      registration_id TEXT PRIMARY KEY REFERENCES ceu_enrollments(registration_id),
      created_at TEXT NOT NULL,
      livemode INTEGER NOT NULL,
      configuration_scope TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS stripe_api_connectivity_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      checked_at TEXT NOT NULL,
      mode TEXT NOT NULL CHECK (mode = 'test'),
      result TEXT NOT NULL CHECK (result IN ('success', 'failed'))
    );
    CREATE TABLE IF NOT EXISTS integration_simulation_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target TEXT NOT NULL CHECK (target IN (
        'identity-provider', 'membership-scanner', 'ubuntu-host', 'database-server', 'monitoring-alerts'
      )),
      checked_at TEXT NOT NULL,
      result TEXT NOT NULL CHECK (result IN ('success', 'failed')),
      label TEXT NOT NULL CHECK (label = 'SIMULATED_DEVELOPMENT_INPUT'),
      source TEXT NOT NULL DEFAULT 'Development Simulation'
    );
    CREATE TABLE IF NOT EXISTS clinic_patients (
      id TEXT PRIMARY KEY,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      status TEXT NOT NULL,
      last_visit TEXT NOT NULL,
      phone TEXT NOT NULL,
      normalized_phone TEXT NOT NULL UNIQUE,
      visit_history TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS clinic_staff (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      hours TEXT NOT NULL,
      status TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS clinic_staff_name_unique ON clinic_staff(lower(name));
  `);
  database.exec('PRAGMA busy_timeout = 5000;');
  const stripeColumns = database.prepare('PRAGMA table_info(verified_stripe_events)').all() as { name: string }[];
  if (!stripeColumns.some((column) => column.name === 'livemode')) {
    database.exec('ALTER TABLE verified_stripe_events ADD COLUMN livemode INTEGER NOT NULL DEFAULT 0');
  }
  if (!stripeColumns.some((column) => column.name === 'stripe_created_at')) {
    database.exec('ALTER TABLE verified_stripe_events ADD COLUMN stripe_created_at INTEGER NOT NULL DEFAULT 0');
  }
  const simulationColumns = database.prepare('PRAGMA table_info(integration_simulation_checks)').all() as { name: string }[];
  if (!simulationColumns.some((column) => column.name === 'source')) {
    database.exec("ALTER TABLE integration_simulation_checks ADD COLUMN source TEXT NOT NULL DEFAULT 'Development Simulation'");
  }
  const insertPatient = database.prepare(`
    INSERT OR IGNORE INTO clinic_patients
      (id, first_name, last_name, status, last_visit, phone, normalized_phone, visit_history)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const patient of patients) {
    insertPatient.run(
      patient.id,
      patient.firstName,
      patient.lastName,
      patient.status,
      patient.lastVisit,
      patient.phone,
      patient.phone.replace(/\D/g, ''),
      JSON.stringify(patient.visitHistory),
    );
  }
  const insertStaff = database.prepare(`
    INSERT OR IGNORE INTO clinic_staff (id, name, role, hours, status) VALUES (?, ?, ?, ?, ?)
  `);
  for (const member of initialStaff) {
    insertStaff.run(member.id, member.name, member.role, member.hours, member.status);
  }
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
  database.exec('BEGIN IMMEDIATE');
  try {
    const event = appendAuditEventInTransaction(database, input);
    database.exec('COMMIT');
    return event;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
};

const appendAuditEventInTransaction = (database: DatabaseSync, input: NewAuditEvent): AuditEvent => {
  const { actorId, role } = services[input.module];
  const occurredAt = new Date().toISOString();
  const eventId = randomUUID();
  const safeChangeSummary = safeSummaries[`${input.module}:${input.action}`];
  if (!safeChangeSummary) throw new Error('Unsupported audit action.');

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
    sessionId: input.sessionId ?? null,
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

  return {
    occurredAt,
    eventId,
    module: input.module,
    actorId,
    role,
    action: input.action,
    relatedRecordId: input.relatedRecordId,
    result: input.result,
    sessionId: input.sessionId ?? null,
    safeChangeSummary,
    previousHash,
    entryHash,
  };
};

// Learning records share the backed-up audit database and atomic audit writes.
export const learningDatabase = getDatabase;
export const appendLearningAudit = (action: 'Demo course payment verified' | 'Demo final exam submitted' | 'Demo certificate issued', recordId: string) =>
  appendAuditEventInTransaction(getDatabase(), { module: 'ceu', action, relatedRecordId: recordId, result: 'success', sessionId: null });

type PatientRow = {
    id: string;
    first_name: string;
    last_name: string;
    status: string;
    last_visit: string;
    phone: string;
    visit_history: string;
  };

const mapPatient = (row: PatientRow): Patient => ({
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    status: row.status,
    lastVisit: row.last_visit,
    phone: row.phone,
    visitHistory: JSON.parse(row.visit_history) as Patient['visitHistory'],
  });

export const listClinicPatients = (): Patient[] => getDatabase().prepare(`
    SELECT id, first_name, last_name, status, last_visit, phone, visit_history
    FROM clinic_patients ORDER BY lower(last_name), lower(first_name)
  `).all().map((row) => mapPatient(row as PatientRow));

  export const findClinicPatientByLastFour = (lastFour: string): Patient | null => {
    if (!/^\d{4}$/.test(lastFour)) return null;
    const rows = getDatabase().prepare(`
      SELECT id, first_name, last_name, status, last_visit, phone, visit_history
      FROM clinic_patients WHERE substr(normalized_phone, -4) = ?
    `).all(lastFour) as PatientRow[];
    return rows.length === 1 ? mapPatient(rows[0]) : null;
  };

export const getClinicRecordCounts = () => {
    const database = getDatabase();
    const patientsCount = database.prepare('SELECT COUNT(*) AS count FROM clinic_patients').get() as { count: number };
    const staffCount = database.prepare('SELECT COUNT(*) AS count FROM clinic_staff').get() as { count: number };
    return { patients: patientsCount.count, staff: staffCount.count };
  };

export const createClinicPatient = (input: {
    firstName: string;
    lastName: string;
    phone: string;
    sessionId: string | null;
  }): Patient => {
    const database = getDatabase();
    const id = `PT-${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
    const patient: Patient = {
      ...input,
      id,
      status: 'New',
      lastVisit: 'No visits recorded',
      visitHistory: [],
    };
    database.exec('BEGIN IMMEDIATE');
    try {
      database.prepare(`
        INSERT INTO clinic_patients
          (id, first_name, last_name, status, last_visit, phone, normalized_phone, visit_history)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, input.firstName, input.lastName, patient.status, patient.lastVisit, input.phone, input.phone.replace(/\D/g, ''), '[]');
      appendAuditEventInTransaction(database, {
        module: 'administration',
        action: 'Patient record created',
        relatedRecordId: id,
        result: 'success',
        sessionId: input.sessionId,
      });
      database.exec('COMMIT');
      return patient;
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  };

type StaffRow = { id: string; name: string; role: string; hours: string; status: string };

export const listClinicStaff = (): StaffMember[] => getDatabase().prepare(`
    SELECT id, name, role, hours, status FROM clinic_staff ORDER BY lower(name)
  `).all().map((row) => row as StaffRow);

export const createClinicStaff = (input: Omit<StaffMember, 'id' | 'status'> & { sessionId: string | null }): StaffMember => {
    const database = getDatabase();
    const staff: StaffMember = {
      ...input,
      id: `STAFF-${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`,
      status: 'Active',
    };
    database.exec('BEGIN IMMEDIATE');
    try {
      database.prepare(`
        INSERT INTO clinic_staff (id, name, role, hours, status) VALUES (?, ?, ?, ?, ?)
      `).run(staff.id, staff.name, staff.role, staff.hours, staff.status);
      appendAuditEventInTransaction(database, {
        module: 'administration',
        action: 'Staff record created',
        relatedRecordId: staff.id,
        result: 'success',
        sessionId: input.sessionId,
      });
      database.exec('COMMIT');
      return staff;
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
};

export type VerifiedStripePaymentState = {
  action: string;
  result: AuditResult;
  occurredAt: string;
  livemode: boolean;
};

export type CeuEnrollmentState = {
  registrationId: string;
  paymentIntentId: string;
  topicId: string;
  status: 'pending_payment' | 'enrolled';
  createdAt: string;
  enrolledAt: string | null;
};

const mapCeuEnrollment = (row: {
  registration_id: string;
  payment_intent_id: string;
  topic_id: string;
  status: 'pending_payment' | 'enrolled';
  created_at: string;
  enrolled_at: string | null;
}): CeuEnrollmentState => ({
  registrationId: row.registration_id,
  paymentIntentId: row.payment_intent_id,
  topicId: row.topic_id,
  status: row.status,
  createdAt: row.created_at,
  enrolledAt: row.enrolled_at,
});

type NewCeuEnrollment = {
  registrationId: string;
  paymentIntentId: string;
  topicId: string;
  learnerName: string;
  learnerEmail: string;
};

const insertPendingCeuEnrollment = (database: DatabaseSync, input: NewCeuEnrollment) => {
  const createdAt = new Date().toISOString();
  database.prepare(`
    INSERT INTO ceu_enrollments (
      registration_id, payment_intent_id, topic_id, learner_name, learner_email,
      status, created_at, enrolled_at
    ) VALUES (?, ?, ?, ?, ?, 'pending_payment', ?, NULL)
  `).run(
    input.registrationId,
    input.paymentIntentId,
    input.topicId,
    input.learnerName,
    input.learnerEmail,
    createdAt,
  );
  return {
    registrationId: input.registrationId,
    paymentIntentId: input.paymentIntentId,
    topicId: input.topicId,
    status: 'pending_payment' as const,
    createdAt,
    enrolledAt: null,
  };
};

export const createPendingCeuEnrollment = (input: NewCeuEnrollment) => insertPendingCeuEnrollment(getDatabase(), input);

// Only the real application PaymentIntent handler uses this attested setup path.
export const recordCeuPaymentSetup = (input: NewCeuEnrollment & { livemode: boolean; configurationScope: string }) => {
  const database = getDatabase();
  database.exec('BEGIN IMMEDIATE');
  try {
    const registration = insertPendingCeuEnrollment(database, input);
    database.prepare('INSERT INTO ceu_payment_setups(registration_id, created_at, livemode, configuration_scope) VALUES (?, ?, ?, ?)')
      .run(input.registrationId, registration.createdAt, input.livemode ? 1 : 0, input.configurationScope);
    appendAuditEventInTransaction(database, { module: 'payments', action: 'CEU payment setup succeeded', relatedRecordId: input.registrationId, result: 'pending', sessionId: null });
    database.exec('COMMIT');
    return registration;
  } catch (error) { database.exec('ROLLBACK'); throw error; }
};

export const getLatestCeuPaymentSetup = (configurationScope: string | null) => {
  if (!configurationScope) return null;
  const row = getDatabase().prepare(`
    SELECT e.registration_id, e.payment_intent_id, e.topic_id, s.created_at, s.livemode
    FROM ceu_payment_setups s JOIN ceu_enrollments e ON e.registration_id = s.registration_id
    JOIN audit_log a ON a.related_record_id = e.registration_id AND a.module = 'payments'
      AND a.action = 'CEU payment setup succeeded' AND a.result = 'pending'
    WHERE s.configuration_scope = ? ORDER BY a.sequence DESC LIMIT 1
  `).get(configurationScope) as { registration_id: string; payment_intent_id: string; topic_id: string; created_at: string; livemode: number } | undefined;
  return row ? { registrationId: row.registration_id, paymentIntentId: row.payment_intent_id, topicId: row.topic_id, createdAt: row.created_at, livemode: Boolean(row.livemode) } : null;
};

export const getCeuEnrollmentByPaymentIntent = (paymentIntentId: string): CeuEnrollmentState | null => {
  const row = getDatabase().prepare(`
    SELECT registration_id, payment_intent_id, topic_id, status, created_at, enrolled_at
    FROM ceu_enrollments WHERE payment_intent_id = ?
  `).get(paymentIntentId) as {
    registration_id: string;
    payment_intent_id: string;
    topic_id: string;
    status: 'pending_payment' | 'enrolled';
    created_at: string;
    enrolled_at: string | null;
  } | undefined;
  return row ? mapCeuEnrollment(row) : null;
};

export const getLatestCeuEnrollment = (): CeuEnrollmentState | null => {
  const row = getDatabase().prepare(`
    SELECT registration_id, payment_intent_id, topic_id, status, created_at, enrolled_at
    FROM ceu_enrollments WHERE status = 'enrolled'
      AND EXISTS (SELECT 1 FROM verified_stripe_events v WHERE v.payment_intent_id = ceu_enrollments.payment_intent_id
        AND v.topic_id = ceu_enrollments.topic_id AND v.action = 'CEU payment succeeded' AND v.result = 'success')
    ORDER BY enrolled_at DESC LIMIT 1
  `).get() as {
    registration_id: string;
    payment_intent_id: string;
    topic_id: string;
    status: 'pending_payment' | 'enrolled';
    created_at: string;
    enrolled_at: string | null;
  } | undefined;
  return row ? mapCeuEnrollment(row) : null;
};

export type StripeApiConnectivityCheck = {
  checkedAt: string;
  mode: 'test';
  result: 'success' | 'failed';
};

export const recordStripeApiConnectivityCheck = (input: StripeApiConnectivityCheck) => {
  getDatabase().prepare(`
    INSERT INTO stripe_api_connectivity_checks (checked_at, mode, result)
    VALUES (?, ?, ?)
  `).run(input.checkedAt, input.mode, input.result);
};

export const getLatestStripeApiConnectivityCheck = (): StripeApiConnectivityCheck | null => {
  const row = getDatabase().prepare(`
    SELECT checked_at, mode, result FROM stripe_api_connectivity_checks
    ORDER BY id DESC LIMIT 1
  `).get() as { checked_at: string; mode: 'test'; result: 'success' | 'failed' } | undefined;
  return row ? { checkedAt: row.checked_at, mode: row.mode, result: row.result } : null;
};

export type IntegrationSimulationCheck = {
  target: IntegrationSimulationTarget;
  checkedAt: string;
  result: 'success' | 'failed';
  label: 'SIMULATED_DEVELOPMENT_INPUT';
  source: 'Development Simulation';
  sessionId?: string | null;
};

export const recordIntegrationSimulationCheck = (input: IntegrationSimulationCheck) => {
  const database = getDatabase();
  database.exec('BEGIN IMMEDIATE');
  try {
    database.prepare(`
      INSERT INTO integration_simulation_checks (target, checked_at, result, label, source)
      VALUES (?, ?, ?, ?, ?)
    `).run(input.target, input.checkedAt, input.result, input.label, input.source);
    appendAuditEventInTransaction(database, {
      module: 'administration',
      action: 'Development Simulation recorded',
      relatedRecordId: input.target,
      result: input.result === 'success' ? 'success' : 'failed',
      sessionId: input.sessionId ?? null,
    });
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
};

export const getLatestIntegrationSimulationChecks = (): Map<IntegrationSimulationTarget, IntegrationSimulationCheck> => {
  const rows = getDatabase().prepare(`
    SELECT target, checked_at, result, label, source
    FROM integration_simulation_checks
    WHERE id IN (
      SELECT MAX(id) FROM integration_simulation_checks GROUP BY target
    )
  `).all() as {
    target: IntegrationSimulationTarget;
    checked_at: string;
    result: 'success' | 'failed';
    label: 'SIMULATED_DEVELOPMENT_INPUT';
    source: 'Development Simulation';
  }[];
  return new Map(rows.map((row) => [row.target, {
    target: row.target,
    checkedAt: row.checked_at,
    result: row.result,
    label: row.label,
    source: row.source,
  }]));
};

export const appendVerifiedStripeWebhookEvent = (input: {
  stripeEventId: string;
  paymentIntentId: string;
  topicId: string;
  registrationId?: string;
  action: string;
  result: AuditResult;
  livemode: boolean;
  stripeCreatedAt: number;
}) => {
  const database = getDatabase();
  database.exec('BEGIN IMMEDIATE');
  try {
    const existing = database.prepare('SELECT 1 FROM verified_stripe_events WHERE stripe_event_id = ?')
      .get(input.stripeEventId);
    if (existing) {
      database.exec('COMMIT');
      return false;
    }
    if (input.registrationId) {
      const enrollment = database.prepare(`
        SELECT registration_id, payment_intent_id, topic_id, status
        FROM ceu_enrollments WHERE registration_id = ?
      `).get(input.registrationId) as {
        registration_id: string;
        payment_intent_id: string;
        topic_id: string;
        status: 'pending_payment' | 'enrolled';
      } | undefined;
      if (
        !enrollment
        || enrollment.payment_intent_id !== input.paymentIntentId
        || enrollment.topic_id !== input.topicId
      ) {
        throw new Error('Verified payment did not match a pending CEU enrollment.');
      }
    }
    const auditEvent = appendAuditEventInTransaction(database, {
      module: 'payments',
      action: input.action,
      relatedRecordId: input.topicId,
      result: input.result,
      sessionId: null,
    });
    database.prepare(`
      INSERT INTO verified_stripe_events (
        stripe_event_id, payment_intent_id, topic_id, action, result, occurred_at, livemode, stripe_created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.stripeEventId,
      input.paymentIntentId,
      input.topicId,
      input.action,
      input.result,
      auditEvent.occurredAt,
      input.livemode ? 1 : 0,
      input.stripeCreatedAt,
    );
    if (input.action === 'CEU payment succeeded' && input.result === 'success' && input.registrationId) {
      database.prepare(`
        UPDATE ceu_enrollments
        SET status = 'enrolled', enrolled_at = COALESCE(enrolled_at, ?)
        WHERE registration_id = ? AND payment_intent_id = ? AND topic_id = ?
      `).run(auditEvent.occurredAt, input.registrationId, input.paymentIntentId, input.topicId);
    }
    database.exec('COMMIT');
    return true;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
};

export const getVerifiedStripePaymentState = (paymentIntentId: string): VerifiedStripePaymentState | null => {
  const row = getDatabase().prepare(`
    SELECT action, result, occurred_at, livemode FROM verified_stripe_events
    WHERE payment_intent_id = ? ORDER BY CASE WHEN action = 'CEU payment succeeded' AND result = 'success' THEN 1 ELSE 0 END DESC, stripe_created_at DESC, rowid DESC LIMIT 1
  `).get(paymentIntentId) as { action: string; result: AuditResult; occurred_at: string; livemode: number } | undefined;
  return row ? { action: row.action, result: row.result, occurredAt: row.occurred_at, livemode: Boolean(row.livemode) } : null;
};

export const getLatestAuditEvent = (module: AuditModule, actions: string[]): AuditEvent | null => {
  if (actions.length === 0) return null;
  const placeholders = actions.map(() => '?').join(', ');
  const row = getDatabase().prepare(`
    SELECT sequence, occurred_at, event_id, module, actor_id, role, action, related_record_id,
      result, session_id, safe_change_summary, previous_hash, entry_hash
    FROM audit_log
    WHERE module = ? AND action IN (${placeholders})
    ORDER BY sequence DESC LIMIT 1
  `).get(module, ...actions) as AuditRow | undefined;
  return row ? auditRowToEvent(row) : null;
};

export const getLatestVerifiedStripeEvent = (): VerifiedStripePaymentState | null => {
  const row = getDatabase().prepare(`
    SELECT action, result, occurred_at, livemode FROM verified_stripe_events
    ORDER BY stripe_created_at DESC LIMIT 1
  `).get() as { action: string; result: AuditResult; occurred_at: string; livemode: number } | undefined;
  return row ? { action: row.action, result: row.result, occurredAt: row.occurred_at, livemode: Boolean(row.livemode) } : null;
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

export const getLatestAdministratorLoginEvent = (): AuditEvent | null => {
  const row = getDatabase().prepare(`
    SELECT sequence, occurred_at, event_id, module, actor_id, role, action, related_record_id,
      result, session_id, safe_change_summary, previous_hash, entry_hash
    FROM audit_log
    WHERE module = 'authentication' AND related_record_id = 'administrator-login'
      AND action IN ('Administrator login succeeded', 'Administrator login failed')
    ORDER BY sequence DESC
    LIMIT 1
  `).get() as AuditRow | undefined;

  return row ? auditRowToEvent(row) : null;
};

export const verifyAuditChain = () => hasValidAuditChain(
  readAuditRowsInOrder(getDatabase()).map(auditRowToEvent),
  GENESIS_HASH,
);

export const getAuditStoreStatus = () => {
  const database = getDatabase();
  const row = database.prepare('SELECT COUNT(*) AS event_count FROM audit_log').get() as { event_count: number };
  const events = readAuditRowsInOrder(database).map(auditRowToEvent);
  return {
    eventCount: row.event_count,
    chainValid: hasValidAuditChain(events, GENESIS_HASH),
  };
};
