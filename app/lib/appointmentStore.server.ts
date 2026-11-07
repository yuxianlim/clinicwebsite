import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { isValidPractitioner } from './appointmentValidation';
import { findClinicPatientByLastFour } from './auditStore.server';
import { normalizePhone } from './clinicData';
import type { Appointment } from '@/app/context/BookingContext';

const databasePath = process.env.CLINIC_APPOINTMENTS_DB_PATH
  ? path.resolve(process.env.CLINIC_APPOINTMENTS_DB_PATH)
  : path.join(process.cwd(), '.data', 'clinic-appointments.sqlite');
const globalDatabase = globalThis as typeof globalThis & { clinicAppointmentsDatabase?: DatabaseSync };

export class InvalidAppointmentError extends Error {}
export class AppointmentSlotConflictError extends Error {}
export class AppointmentChangeConflictError extends Error {}

export type NewAppointment = Pick<Appointment, 'name' | 'contact' | 'date' | 'time' | 'practitioner'>;

const getClinicDate = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Los_Angeles',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());

export const isValidAppointmentDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime())
    && parsed.toISOString().slice(0, 10) === value
    && value >= getClinicDate();
};

export const isValidAppointmentTime = (value: string) => {
  const match = /^(1[0-2]|[1-9]):(00|30) (AM|PM)$/.exec(value);
  if (!match) return false;
  const hour = Number(match[1]);
  const minutes = Number(match[2]);
  const hour24 = match[3] === 'AM' ? hour % 12 : (hour % 12) + 12;
  const totalMinutes = hour24 * 60 + minutes;
  return totalMinutes >= 9 * 60 && totalMinutes <= 17 * 60 + 30;
};

const getDatabase = () => {
  let database = globalDatabase.clinicAppointmentsDatabase;
  if (!database) {
    mkdirSync(path.dirname(databasePath), { recursive: true });
    database = new DatabaseSync(databasePath);
    database.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS appointments (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        contact TEXT NOT NULL,
        appointment_date TEXT NOT NULL,
        appointment_time TEXT NOT NULL,
        practitioner TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        patient_id TEXT,
        checked_in_at TEXT,
        status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled'))
      );
      CREATE TABLE IF NOT EXISTS kiosk_checkin_tokens (
        token_hash TEXT PRIMARY KEY,
        appointment_id TEXT NOT NULL REFERENCES appointments(id),
        expires_at INTEGER NOT NULL
      );
    `);
    globalDatabase.clinicAppointmentsDatabase = database;
  }
  database.exec('PRAGMA busy_timeout = 5000;');
  const appointmentColumns = database.prepare('PRAGMA table_info(appointments)').all() as { name: string }[];
  if (!appointmentColumns.some((column) => column.name === 'status')) {
    database.exec("ALTER TABLE appointments ADD COLUMN status TEXT NOT NULL DEFAULT 'scheduled'");
  }
  database.exec(`
    DROP INDEX IF EXISTS appointments_unique_slot;
    CREATE UNIQUE INDEX IF NOT EXISTS appointments_unique_active_slot
      ON appointments (appointment_date, appointment_time, practitioner)
      WHERE status = 'scheduled';
  `);
  return database;
};

type AppointmentRow = {
  id: string;
  name: string;
  contact: string;
  appointment_date: string;
  appointment_time: string;
  practitioner: string;
  created_at: number;
  patient_id: string | null;
  checked_in_at: string | null;
  status?: 'scheduled' | 'cancelled';
};

const rowToAppointment = (row: AppointmentRow): Appointment => ({
  id: row.id,
  name: row.name,
  contact: row.contact,
  date: row.appointment_date,
  time: row.appointment_time,
  practitioner: row.practitioner,
  timestamp: row.created_at,
  ...(row.patient_id ? { patientId: row.patient_id } : {}),
  ...(row.checked_in_at ? { checkedInAt: row.checked_in_at } : {}),
  status: row.status ?? 'scheduled',
});

const validateAppointment = (input: NewAppointment) => {
  const name = input.name.trim();
  const contact = input.contact.trim();
  if (name.length < 1 || name.length > 100) throw new InvalidAppointmentError('Enter a valid name.');
  if (contact.length > 32 || normalizePhone(contact).length < 7 || normalizePhone(contact).length > 15) {
    throw new InvalidAppointmentError('Enter a valid phone number.');
  }
  if (!isValidAppointmentDate(input.date)) throw new InvalidAppointmentError('Choose a valid current or future appointment date.');
  if (!isValidPractitioner(input.practitioner)) throw new InvalidAppointmentError('Choose an available practitioner.');
  if (!isValidAppointmentTime(input.time)) throw new InvalidAppointmentError('Choose an available appointment time.');
  return { name, contact };
};

export const createAppointment = (input: NewAppointment): Appointment => {
  const { name, contact } = validateAppointment(input);
  const database = getDatabase();
  const id = randomUUID();
  const timestamp = Date.now();
  const patient = findClinicPatientByLastFour(normalizePhone(contact).slice(-4));

  database.exec('BEGIN IMMEDIATE');
  try {
    const insert = database.prepare(`
      INSERT INTO appointments (
        id, name, contact, appointment_date, appointment_time, practitioner, created_at, patient_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insert.run(id, name, contact, input.date, input.time, input.practitioner, timestamp, patient?.id ?? null);
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    if (
      error instanceof Error
      && 'code' in error
      && error.code === 'ERR_SQLITE_ERROR'
      && /UNIQUE constraint failed/.test(error.message)
    ) throw new AppointmentSlotConflictError('That appointment time is no longer available.');
    throw error;
  }

  return {
    id,
    name,
    contact,
    date: input.date,
    time: input.time,
    practitioner: input.practitioner,
    timestamp,
    ...(patient ? { patientId: patient.id } : {}),
  };
};

export const getUnavailableAppointmentTimes = (date: string, practitioner: string) => {
  const rows = getDatabase().prepare(`
    SELECT appointment_time FROM appointments
    WHERE appointment_date = ? AND practitioner = ? AND status = 'scheduled'
  `).all(date, practitioner) as { appointment_time: string }[];
  return rows.map((row) => row.appointment_time);
};

export type KioskAppointmentMatch = {
  patient: { id: string; name: string };
  appointment: Appointment;
  checkInToken: string;
};

export const findKioskAppointment = (lastFour: string, date: string): KioskAppointmentMatch | null => {
  const patient = findClinicPatientByLastFour(lastFour);
  if (!patient) return null;

  const rows = getDatabase().prepare(`
    SELECT id, name, contact, appointment_date, appointment_time, practitioner,
      created_at, patient_id, checked_in_at, status
    FROM appointments
    WHERE appointment_date = ?
      AND status = 'scheduled'
      AND (patient_id = ? OR (contact = ? AND lower(trim(name)) = lower(?)))
    ORDER BY created_at ASC
  `).all(date, patient.id, patient.phone, `${patient.firstName} ${patient.lastName}`) as AppointmentRow[];
  const row = rows.find((appointment) => !appointment.checked_in_at);
  if (!row) return null;

  const token = randomBytes(32).toString('base64url');
  const database = getDatabase();
  database.prepare('DELETE FROM kiosk_checkin_tokens WHERE expires_at <= ?').run(Date.now());
  database.prepare(`
    INSERT INTO kiosk_checkin_tokens (token_hash, appointment_id, expires_at)
    VALUES (?, ?, ?)
  `).run(createHash('sha256').update(token).digest('hex'), row.id, Date.now() + 5 * 60 * 1000);

  return {
    patient: { id: patient.id, name: `${patient.firstName} ${patient.lastName}` },
    appointment: rowToAppointment(row),
    checkInToken: token,
  };
};

export type CheckInAppointmentResult =
  | { ok: true; appointment: Appointment }
  | { ok: false; reason: 'invalid-token' | 'already-checked-in' | 'missing' };

export const checkInServerAppointment = (appointmentId: string, token: string): CheckInAppointmentResult => {
  const database = getDatabase();
  const tokenHash = createHash('sha256').update(token).digest('hex');
  database.exec('BEGIN IMMEDIATE');
  try {
    const tokenRow = database.prepare(`
      SELECT appointment_id, expires_at FROM kiosk_checkin_tokens WHERE token_hash = ?
    `).get(tokenHash) as { appointment_id: string; expires_at: number } | undefined;
    if (!tokenRow || tokenRow.appointment_id !== appointmentId || tokenRow.expires_at <= Date.now()) {
      database.exec('ROLLBACK');
      return { ok: false, reason: 'invalid-token' };
    }
    const row = database.prepare(`
      SELECT id, name, contact, appointment_date, appointment_time, practitioner,
        created_at, patient_id, checked_in_at, status
      FROM appointments WHERE id = ?
    `).get(appointmentId) as AppointmentRow | undefined;
    if (!row) {
      database.prepare('DELETE FROM kiosk_checkin_tokens WHERE token_hash = ?').run(tokenHash);
      database.exec('COMMIT');
      return { ok: false, reason: 'missing' };
    }
    if (row.status === 'cancelled') {
      database.prepare('DELETE FROM kiosk_checkin_tokens WHERE token_hash = ?').run(tokenHash);
      database.exec('COMMIT');
      return { ok: false, reason: 'missing' };
    }
    if (row.checked_in_at) {
      database.prepare('DELETE FROM kiosk_checkin_tokens WHERE token_hash = ?').run(tokenHash);
      database.exec('COMMIT');
      return { ok: false, reason: 'already-checked-in' };
    }

    const checkedInAt = new Date().toISOString();
    database.prepare('UPDATE appointments SET checked_in_at = ? WHERE id = ? AND checked_in_at IS NULL')
      .run(checkedInAt, appointmentId);
    database.prepare('DELETE FROM kiosk_checkin_tokens WHERE token_hash = ?').run(tokenHash);
    const updatedRow = { ...row, checked_in_at: checkedInAt };
    database.exec('COMMIT');
    return { ok: true, appointment: rowToAppointment(updatedRow) };
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
};

export const getAppointmentStoreStatus = () => {
  const result = getDatabase().prepare(`
    SELECT COUNT(*) AS appointment_count, MAX(created_at) AS latest_created_at
    FROM appointments
  `).get() as { appointment_count: number; latest_created_at: number | null };
  return {
    appointmentCount: result.appointment_count,
    latestCreatedAt: result.latest_created_at,
  };
};

export const listAppointments = (): Appointment[] => getDatabase().prepare(`
  SELECT id, name, contact, appointment_date, appointment_time, practitioner,
    created_at, patient_id, checked_in_at, status
  FROM appointments ORDER BY appointment_date DESC, appointment_time
`).all().map((row) => rowToAppointment(row as AppointmentRow));

export const changeAppointment = (input: {
  id: string;
  date: string;
  time: string;
  practitioner: string;
}): Appointment => {
  if (!isValidAppointmentDate(input.date)) throw new InvalidAppointmentError('Choose a valid current or future appointment date.');
  if (!isValidAppointmentTime(input.time)) throw new InvalidAppointmentError('Choose an available appointment time.');
  if (!isValidPractitioner(input.practitioner)) throw new InvalidAppointmentError('Choose an available practitioner.');

  const database = getDatabase();
  database.exec('BEGIN IMMEDIATE');
  try {
    const row = database.prepare(`
      SELECT id, name, contact, appointment_date, appointment_time, practitioner,
        created_at, patient_id, checked_in_at, status
      FROM appointments WHERE id = ?
    `).get(input.id) as AppointmentRow | undefined;
    if (!row || row.status === 'cancelled' || row.checked_in_at) {
      database.exec('ROLLBACK');
      throw new AppointmentChangeConflictError('This appointment cannot be changed.');
    }
    database.prepare(`
      UPDATE appointments
      SET appointment_date = ?, appointment_time = ?, practitioner = ?
      WHERE id = ? AND status = 'scheduled' AND checked_in_at IS NULL
    `).run(input.date, input.time, input.practitioner, input.id);
    const updated = {
      ...row,
      appointment_date: input.date,
      appointment_time: input.time,
      practitioner: input.practitioner,
    };
    database.exec('COMMIT');
    return rowToAppointment(updated);
  } catch (error) {
    if (database.isTransaction) database.exec('ROLLBACK');
    if (
      error instanceof Error
      && 'code' in error
      && error.code === 'ERR_SQLITE_ERROR'
      && /UNIQUE constraint failed/.test(error.message)
    ) throw new AppointmentSlotConflictError('That appointment time is no longer available.');
    throw error;
  }
};

export const cancelAppointment = (id: string): Appointment => {
  const database = getDatabase();
  database.exec('BEGIN IMMEDIATE');
  try {
    const row = database.prepare(`
      SELECT id, name, contact, appointment_date, appointment_time, practitioner,
        created_at, patient_id, checked_in_at, status
      FROM appointments WHERE id = ?
    `).get(id) as AppointmentRow | undefined;
    if (!row || row.status === 'cancelled' || row.checked_in_at) {
      database.exec('ROLLBACK');
      throw new AppointmentChangeConflictError('This appointment cannot be canceled.');
    }
    database.prepare(`
      UPDATE appointments SET status = 'cancelled'
      WHERE id = ? AND status = 'scheduled' AND checked_in_at IS NULL
    `).run(id);
    database.prepare('DELETE FROM kiosk_checkin_tokens WHERE appointment_id = ?').run(id);
    database.exec('COMMIT');
    return rowToAppointment({ ...row, status: 'cancelled' });
  } catch (error) {
    if (database.isTransaction) database.exec('ROLLBACK');
    throw error;
  }
};
