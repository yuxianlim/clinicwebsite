import { createHash, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { appendDemoKioskAudit, createClinicPatient, getLatestAuditEvent, learningDatabase, listClinicPatients } from './auditStore.server';
import { createAppointment, findKioskAppointmentForVerifiedPatient, getUnavailableAppointmentTimes, listAppointments } from './appointmentStore.server';

export const demoKioskEnabled = () => process.env.NODE_ENV !== 'production' && process.env.ENABLE_DEVELOPMENT_INTEGRATION_SIMULATORS === 'true';
export class DemoKioskError extends Error {}
const required = () => { if (!demoKioskEnabled()) throw new DemoKioskError('Development kiosk verification is disabled.'); };
const date = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const database = () => {
  const db = learningDatabase();
  db.exec(`CREATE TABLE IF NOT EXISTS demo_kiosk_patients (patient_id TEXT PRIMARY KEY, fixture_day TEXT NOT NULL UNIQUE);
    CREATE TABLE IF NOT EXISTS demo_kiosk_codes (id TEXT PRIMARY KEY, patient_id TEXT NOT NULL, code_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, consumed INTEGER NOT NULL DEFAULT 0);`);
  return db;
};
const hash = (id: string, code: string) => createHash('sha256').update(`${id}:${code}`).digest('hex');

export const requestDemoCode = (lastFour: string, fullPhone = '', now = Date.now()) => {
  required();
  if (!/^\d{4}$/.test(lastFour)) throw new DemoKioskError('Enter exactly four digits.');
  const candidates = listClinicPatients().filter((patient) => patient.phone.replace(/\D/g, '').endsWith(lastFour));
  if (candidates.length > 1 && !fullPhone) return { requiresFullPhone: true as const };
  const digits = fullPhone.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  const matches = fullPhone ? candidates.filter((patient) => patient.phone.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '') === digits) : candidates;
  const patient = matches.length === 1 ? matches[0] : null;
  const db = database();
  if (!patient || !db.prepare('SELECT 1 FROM demo_kiosk_patients WHERE patient_id = ?').get(patient.id))
    throw new DemoKioskError('Use the fictional patient created by Run demo setup. Real patient records are not accepted by this demo.');
  const id = randomUUID();
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  db.prepare('DELETE FROM demo_kiosk_codes WHERE expires_at <= ?').run(now);
  db.prepare('INSERT INTO demo_kiosk_codes (id, patient_id, code_hash, expires_at) VALUES (?, ?, ?, ?)').run(id, patient.id, hash(id, code), now + 300_000);
  return { requiresFullPhone: false as const, challengeId: id, demoCode: code, expiresIn: 300, source: 'development-fixture' as const };
};

export const verifyDemoCode = (id: string, code: string, now = Date.now()) => {
  required();
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^\d{6}$/.test(code)) throw new DemoKioskError('Enter the six-digit demo code.');
  const db = database();
  db.exec('BEGIN IMMEDIATE');
  let patientId = '';
  try {
    const challenge = db.prepare('SELECT * FROM demo_kiosk_codes WHERE id = ?').get(id) as { patient_id: string; code_hash: string; attempts: number; consumed: number; expires_at: number } | undefined;
    if (challenge && !challenge.consumed && challenge.attempts < 5 && challenge.expires_at > now) {
      db.prepare('UPDATE demo_kiosk_codes SET attempts = attempts + 1 WHERE id = ?').run(id);
      if (timingSafeEqual(Buffer.from(challenge.code_hash), Buffer.from(hash(id, code)))) {
        db.prepare('UPDATE demo_kiosk_codes SET consumed = 1 WHERE id = ?').run(id);
        patientId = challenge.patient_id;
      }
    }
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  if (!patientId) throw new DemoKioskError('The demo code is incorrect, expired or already used. Request a new code.');
  const patient = listClinicPatients().find((item) => item.id === patientId);
  if (!patient) throw new DemoKioskError('The fictional patient is unavailable.');
  const match = findKioskAppointmentForVerifiedPatient(patient, date());
  if (!match) throw new DemoKioskError('No eligible fictional appointment is available today.');
  db.exec('BEGIN IMMEDIATE');
  try { appendDemoKioskAudit(); db.exec('COMMIT'); } catch (error) { db.exec('ROLLBACK'); throw error; }
  return { patient: match.patient, appointment: { id: match.appointment.id, date: match.appointment.date, time: match.appointment.time, practitioner: match.appointment.practitioner }, checkInToken: match.checkInToken, source: 'development-fixture' as const };
};

export const seedDemoKiosk = () => {
  required();
  const db = database();
  const day = date();
  const existing = db.prepare('SELECT patient_id FROM demo_kiosk_patients WHERE fixture_day = ?').get(day) as { patient_id: string } | undefined;
  let patient = existing ? listClinicPatients().find((item) => item.id === existing.patient_id) : undefined;
  if (!patient) {
    const used = new Set(listClinicPatients().map((item) => item.phone.replace(/\D/g, '').slice(-4)));
    const phone = Array.from({ length: 100 }, (_, index) => `40855501${String(99 - index).padStart(2, '0')}`).find((item) => !used.has(item.slice(-4)));
    if (!phone) throw new DemoKioskError('No free fictional phone suffix is available.');
    patient = createClinicPatient({ firstName: 'Fictional', lastName: 'Code Check', phone, sessionId: null });
    db.prepare('INSERT INTO demo_kiosk_patients VALUES (?, ?)').run(patient.id, day);
  }
  const already = listAppointments().some((item) => item.patientId === patient.id && item.date === day && item.status !== 'cancelled');
  if (!already) {
    const practitioner = '李医生';
    const unavailable = getUnavailableAppointmentTimes(day, practitioner);
    const time = Array.from({ length: 18 }, (_, index) => {
      const hour = 9 + Math.floor(index / 2);
      return `${hour > 12 ? hour - 12 : hour}:${index % 2 ? '30' : '00'} ${hour >= 12 ? 'PM' : 'AM'}`;
    }).find((item) => !unavailable.includes(item));
    if (!time) throw new DemoKioskError('No free fictional appointment slot is available today.');
    createAppointment({ name: `${patient.firstName} ${patient.lastName}`, contact: patient.phone, date: day, time, practitioner });
  }
  if (!getLatestAuditEvent('check-in', ['Demo kiosk code verified'])) {
    const challenge = requestDemoCode(patient.phone.slice(-4));
    if (!challenge.requiresFullPhone) verifyDemoCode(challenge.challengeId, challenge.demoCode);
  }
  return { phone: patient.phone, lastFour: patient.phone.slice(-4) };
};
