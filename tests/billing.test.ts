import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { addClinicBusinessDays, clinicDateKey } from '../app/lib/clinicBusinessDays';

test('clinic business days handle observed federal holidays and Pacific dates', () => {
  assert.equal(addClinicBusinessDays('2026-07-02', 1), '2026-07-06'); // July 4 observed Friday
  assert.equal(addClinicBusinessDays('2027-12-30', 1), '2028-01-03'); // Jan 1 observed in previous year
  assert.equal(addClinicBusinessDays('2026-11-20', 7), '2026-12-02'); // Thanksgiving
  assert.equal(addClinicBusinessDays('2026-11-20', 14), '2026-12-11');
  assert.equal(addClinicBusinessDays('2026-11-25', 3), '2026-12-01');
  assert.equal(addClinicBusinessDays('2026-11-25', 5), '2026-12-03');
  assert.equal(clinicDateKey('2026-11-08T03:00:00Z'), '2026-11-07');
  assert.throws(() => addClinicBusinessDays('2026-02-30', 7));
});

test('fictional billing enforces history pricing, exact refunds, staff scope, blocking and insurance timing', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'clinic-billing-test-'));
  process.env.AUDIT_LOG_DB_PATH = path.join(root, 'audit.sqlite');
  process.env.CLINIC_APPOINTMENTS_DB_PATH = path.join(root, 'appointments.sqlite');
  process.env.ENABLE_DEVELOPMENT_INTEGRATION_SIMULATORS = 'true';
  process.env.CLINIC_SESSION_SECRET = randomUUID();
  const b = await import('../app/lib/demoBilling.server');
  const a = await import('../app/lib/auditStore.server');
  const appointments = await import('../app/lib/appointmentStore.server');
  const sessions = await import('../app/lib/serverClinicSession');
  const staff = { role: 'clinic_staff' as const, sessionId: 'fictional-staff' };
  const pid = b.seedBillingPatient();
  const patient = a.listClinicPatients().find((item) => item.id === pid)!;
  const now = Date.parse('2026-11-20T20:00:00Z');
  const snapshot = () => b.demoBillingSnapshot(staff);
  try {
    const token = sessions.createBillingDemoSession().token;
    assert.equal(sessions.verifyBillingDemoSession(token)?.role, 'clinic_staff');
    assert.equal(sessions.verifyAdminSession(token), null, 'billing staff cannot gain admin access');
    assert.equal(sessions.verifyBillingDemoSession(token + 'x'), null);
    assert.equal(sessions.verifyBillingDemoSession(sessions.createAdminSession('development-demo').token), null);
    assert.throws(() => b.completeDemoTreatment({ role: 'patient' as never, sessionId: 'forged' }, pid, 'auto', false, false, randomUUID()), /Authorized/);
    const existing = a.listClinicPatients().find((item) => item.id !== pid)!;
    assert.throws(() => b.completeDemoTreatment(staff, existing.id, 'auto', false, false, randomUUID()), /marked fictional/);

    assert.equal(a.findClinicPatientForBooking(' fictional   BILLING patient ', `+1 ${patient.phone}`)?.id, pid);
    assert.equal(a.findClinicPatientForBooking('Another Person', patient.phone), null);
    assert.equal(a.findClinicPatientForBooking('Fictional Billing Patient', `650555${patient.phone.slice(-4)}`), null);
    const booked = appointments.createAppointment({ name: 'Fictional Billing Patient', contact: patient.phone, date: '2099-02-01', time: '9:00 AM', practitioner: '李医生' });
    assert.equal(booked.patientId, pid, 'guest booking resolves stored identity without logging in');
    b.recordDemoNoShow(staff, pid, randomUUID(), now);
    b.recordDemoCancellation(staff, pid, now + 25 * 3600000, randomUUID(), now);
    const firstId = randomUUID();
    const first = b.completeDemoTreatment(staff, pid, 'follow-up', false, false, firstId, now);
    assert.equal(first.service_id, 'initial', 'bookings, cancellations and no-shows are not completed visits; client visit type is ignored');
    assert.equal(first.amount, 18000);
    assert.equal(b.completeDemoTreatment(staff, pid, 'auto', false, false, firstId, now).id, firstId);
    assert.equal(snapshot().visits.length, 1, 'retrying treatment does not create a follow-up');
    assert.equal(snapshot().patients[0].streak, 0);
    b.recordDemoPayment(staff, firstId, 'credit_card', randomUUID(), 12000);
    assert.throws(() => b.approveDemoRefund(staff, firstId, 'Underpayment is not a refund', randomUUID()), /overpayment/);
    assert.equal(snapshot().invoices.find((item) => item.id === firstId)!.correctAmount - snapshot().invoices.find((item) => item.id === firstId)!.totalPaid, 6000);
    b.recordDemoPayment(staff, firstId, 'zelle', randomUUID(), 6000);
    assert.throws(() => b.correctDemoInvoice(staff, firstId, 'follow-up', false, 'Wrong manual classification', randomUUID()), /completed treatment records/);

    const next = b.completeDemoTreatment(staff, pid, 'initial', false, false, randomUUID(), now + 1000);
    assert.equal(next.service_id, 'follow-up');
    assert.equal(next.amount, 12000);
    const payId = randomUUID();
    b.recordDemoPayment(staff, next.id, 'venmo', payId, 18000);
    b.recordDemoPayment(staff, next.id, 'venmo', payId, 18000);
    assert.throws(() => b.recordDemoPayment(staff, firstId, 'venmo', payId, 18000), /another payment/);
    assert.throws(() => b.approveDemoRefund(staff, next.id, 'Wrong arbitrary refund', randomUUID(), 18000), /overpayment/);
    const refundId = randomUUID();
    const refund = b.approveDemoRefund(staff, next.id, 'Initial rate was incorrectly collected', refundId, undefined, Date.parse('2026-11-25T20:00:00Z'));
    assert.equal(refund.amount, 6000);
    assert.equal(refund.expected_start, '2026-12-01');
    assert.equal(refund.expected_end, '2026-12-03');
    assert.equal(b.approveDemoRefund(staff, next.id, refund.reason, refundId).id, refundId);
    assert.throws(() => b.approveDemoRefund(staff, next.id, 'Duplicate refund', randomUUID()), /overpayment/);
    b.settleDemoRefund(staff, refundId);
    assert.equal(snapshot().invoices.find((item) => item.id === next.id)!.payments.length, 1);
    assert.equal(snapshot().invoices.find((item) => item.id === next.id)!.amount, 12000, 'refund preserves the original invoice');

    const insured = b.completeDemoTreatment(staff, pid, 'initial', true, true, randomUUID(), now);
    assert.equal(insured.amount, 17000);
    assert.equal(insured.invoice_id, null);
    assert.equal(insured.due_date, '2026-12-02');
    assert.equal(insured.window_end, '2026-12-11');
    assert.equal(b.processDueDemoInsuranceInvoices(Date.parse('2026-12-01T20:00:00Z')), 0);
    assert.equal(b.processDueDemoInsuranceInvoices(Date.parse('2026-12-02T20:00:00Z')), 1);
    assert.equal(b.processDueDemoInsuranceInvoices(Date.parse('2026-12-03T20:00:00Z')), 0);
    assert.equal(snapshot().invoices.find((item) => item.id === insured.id)!.actor_role, 'system');

    const firstNoShow = randomUUID();
    b.recordDemoNoShow(staff, pid, firstNoShow, now);
    b.recordDemoNoShow(staff, pid, firstNoShow, now);
    assert.equal(snapshot().patients[0].streak, 1);
    const beforeCancel = snapshot().invoices.length;
    b.recordDemoCancellation(staff, pid, now + 24 * 3600000 + 1, randomUUID(), now);
    assert.equal(snapshot().invoices.length, beforeCancel);
    b.recordDemoCancellation(staff, pid, now + 24 * 3600000, randomUUID(), now);
    assert.equal(snapshot().invoices.length, beforeCancel + 1);
    assert.equal(snapshot().invoices[0].amount, 5000);
    assert.equal(snapshot().patients[0].streak, 1, 'cancellation leaves streak unchanged');
    b.recordDemoNoShow(staff, pid, randomUUID(), now);
    b.recordDemoNoShow(staff, pid, randomUUID(), now);
    assert.equal(snapshot().patients[0].blocked, 1);
    assert.equal(snapshot().invoices[0].amount, 10000);
    assert.equal(b.isDemoBookingBlocked(patient.phone), true);
    assert.equal(b.isDemoBookingBlocked('+1' + patient.phone), true);
    assert.throws(() => appointments.createAppointment({ name: 'Fictional Billing Patient', contact: patient.phone, date: '2099-02-02', time: '9:00 AM', practitioner: '李医生' }), /Booking is unavailable/);
    assert.throws(() => b.completeDemoTreatment(staff, pid, 'auto', false, false, randomUUID()), /unblock/);
    b.unblockDemoPatient(staff, pid);
    assert.equal(snapshot().patients[0].streak, 0);
    assert.equal(b.isDemoBookingBlocked(patient.phone), false);
    b.recordDemoNoShow(staff, pid, randomUUID(), now);
    b.recordDemoAttendance(pid, booked.id);
    assert.equal(snapshot().patients[0].streak, 0);
    b.recordDemoAttendance(pid, booked.id);
    assert.equal(a.getAuditStoreStatus().chainValid, true);
    process.env.ENABLE_DEVELOPMENT_INTEGRATION_SIMULATORS = 'false';
    assert.equal(b.demoBillingEvidence(), null);
    assert.throws(() => b.demoBillingSnapshot(staff), /Authorized/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
