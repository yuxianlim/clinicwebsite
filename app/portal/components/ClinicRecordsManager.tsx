"use client";

import { practitionerLabel } from '@/app/lib/practitionerLabels';
import { useCallback, useEffect, useState } from 'react';
import type { Appointment } from '@/app/context/BookingContext';
import type { Patient, StaffMember } from '@/app/lib/clinicData';

type Props = { kind: 'patients' | 'staff' | 'appointments' };

const fieldClass = 'min-h-11 min-w-0 w-full rounded-lg border border-[#dce1e8] bg-[#f3f5f8] px-3 py-2 text-base text-slate-900 outline-none focus:border-[#3158d8]';
const buttonClass = 'min-h-11 rounded-lg bg-[#3158d8] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50';
const practitioners = ['李医生', '王医生', '张医生'];
const times = Array.from({ length: 18 }, (_, index) => {
  const total = 9 * 60 + index * 30;
  const hour = Math.floor(total / 60);
  return `${hour > 12 ? hour - 12 : hour}:${total % 60 === 0 ? '00' : '30'} ${hour >= 12 ? 'PM' : 'AM'}`;
});

const responseError = async (response: Response) => {
  const body = await response.json().catch(() => null) as { error?: string } | null;
  return body?.error ?? 'The request could not be completed.';
};

export default function ClinicRecordsManager({ kind }: Props) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [patientQuery, setPatientQuery] = useState('');
  const [patientSort, setPatientSort] = useState<'firstName' | 'lastName' | 'id'>('lastName');
  const [selectedPatientId, setSelectedPatientId] = useState('');

  const refresh = useCallback(async () => {
    const endpoint = kind === 'appointments' ? '/api/admin/appointments' : `/api/admin/${kind}`;
    const response = await fetch(endpoint, { cache: 'no-store' });
    if (!response.ok) throw new Error(await responseError(response));
    const data = await response.json() as { patients?: Patient[]; staff?: StaffMember[]; appointments?: Appointment[] };
    if (kind === 'patients' && Array.isArray(data.patients)) setPatients(data.patients);
    else if (kind === 'staff' && Array.isArray(data.staff)) setStaff(data.staff);
    else if (kind === 'appointments' && Array.isArray(data.appointments)) setAppointments(data.appointments);
    else throw new Error('The server returned an invalid records response.');
  }, [kind]);

  useEffect(() => {
    setLoading(true);
    setError('');
    void refresh()
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Records could not be loaded.'))
      .finally(() => setLoading(false));
  }, [refresh]);

  const submitRecord = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    setSaving(true);
    setError('');
    setNotice('');
    const form = new FormData(formElement);
    const payload = Object.fromEntries(form.entries());
    try {
      const response = await fetch(`/api/admin/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(await responseError(response));
      formElement.reset();
      await refresh();
      setNotice(kind === 'patients' ? 'Patient record saved and audited.' : 'Staff record saved and audited.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The record could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const changeAppointment = async (event: React.FormEvent<HTMLFormElement>, id: string) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const response = await fetch('/api/admin/appointments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, id }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      await refresh();
      setNotice('Appointment rescheduled and audited.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Appointment could not be changed.');
      await refresh().catch(() => undefined);
    } finally {
      setSaving(false);
    }
  };

  const cancelAppointment = async (id: string) => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/appointments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      await refresh();
      setNotice('Appointment canceled and audited.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Appointment could not be canceled.');
      await refresh().catch(() => undefined);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-sm text-slate-600">Loading records…</p>;

  const filteredPatients = patients
    .filter((patient) => [patient.firstName, patient.lastName, patient.id, patient.status]
      .some((value) => value.toLocaleLowerCase().includes(patientQuery.toLocaleLowerCase())))
    .sort((left, right) => left[patientSort].localeCompare(right[patientSort]));
  const selectedPatient = filteredPatients.find((patient) => patient.id === selectedPatientId) ?? filteredPatients[0] ?? null;

  return (
    <div className="min-w-0 space-y-6 [overflow-wrap:anywhere]">
      {error && <p className="min-h-11 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">{error}</p>}
      {notice && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700" role="status">{notice}</p>}

      {kind === 'patients' && (
        <>
          <section className="rounded-2xl border border-[#dce1e8] bg-white p-4 sm:p-6">
            <h2 className="text-2xl font-semibold text-slate-900">Register patient</h2>
            <p className="mt-1 text-sm text-slate-600">Patient contact details are available to authorized administrators only.</p>
            <form onSubmit={submitRecord} className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <input className={fieldClass} name="firstName" required maxLength={60} placeholder="First name" aria-label="First name" />
              <input className={fieldClass} name="lastName" required maxLength={60} placeholder="Last name" aria-label="Last name" />
              <input className={fieldClass} name="phone" type="tel" required maxLength={30} placeholder="Phone number" aria-label="Phone number" />
              <button className={buttonClass} disabled={saving}>Register patient</button>
            </form>
          </section>
          <section className="rounded-2xl border border-[#dce1e8] bg-white p-4 sm:p-6">
            <h2 className="text-xl font-semibold text-slate-900">Patient records ({patients.length})</h2>
            <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <input className={`${fieldClass} md:max-w-md`} value={patientQuery} onChange={(event) => setPatientQuery(event.target.value)} placeholder="Search patients by name or membership ID" aria-label="Search patients" />
              <select className={fieldClass} value={patientSort} onChange={(event) => setPatientSort(event.target.value as typeof patientSort)} aria-label="Sort patients">
                <option value="lastName">Sort by last name</option>
                <option value="firstName">Sort by first name</option>
                <option value="id">Sort by membership ID</option>
              </select>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {filteredPatients.map((patient) => (
                <button key={patient.id} onClick={() => setSelectedPatientId(patient.id)} className={`rounded-xl border p-4 text-left ${selectedPatient?.id === patient.id ? 'border-[#3158d8] bg-[#3158d8]/20' : 'border-[#dce1e8] bg-[#f3f5f8]'}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{patient.firstName} {patient.lastName}</p>
                      <p className="text-sm text-slate-600">Membership ID: {patient.id}</p>
                    </div>
                    <span className="max-w-full rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-700">{patient.status}</span>
                  </div>
                  <p className="mt-3 text-sm text-slate-700">Phone: {patient.phone}</p>
                  <p className="text-sm text-slate-700">Last visit: {patient.lastVisit}</p>
                  <p className="mt-2 text-xs text-slate-600">Visit history entries: {patient.visitHistory.length}</p>
                </button>
              ))}
            </div>
            {selectedPatient && (
              <div className="mt-5 rounded-xl border border-[#dce1e8] bg-[#f3f5f8] p-4">
                <h3 className="font-semibold text-slate-900">Selected patient details</h3>
                <p className="mt-2 text-sm text-slate-700">{selectedPatient.firstName} {selectedPatient.lastName} · {selectedPatient.id} · {selectedPatient.phone}</p>
                <p className="text-sm text-slate-600">Visit history entries: {selectedPatient.visitHistory.length}</p>
                {selectedPatient.visitHistory.map((visit) => <p key={`${visit.date}-${visit.treatment}`} className="mt-1 text-xs text-slate-600">{visit.date} · {visit.treatment} · {visit.practitioner}</p>)}
              </div>
            )}
          </section>
        </>
      )}

      {kind === 'staff' && (
        <>
          <section className="rounded-2xl border border-[#dce1e8] bg-white p-4 sm:p-6">
            <h2 className="text-2xl font-semibold text-slate-900">Add staff member</h2>
            <form onSubmit={submitRecord} className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <input className={fieldClass} name="name" required maxLength={80} placeholder="Name" aria-label="Name" />
              <input className={fieldClass} name="role" required maxLength={80} placeholder="Role" aria-label="Role" />
              <input className={fieldClass} name="hours" required maxLength={80} placeholder="Working hours" aria-label="Working hours" />
              <button className={buttonClass} disabled={saving}>Add staff</button>
            </form>
            <p className="mt-3 text-xs text-slate-500">This prototype stores staff directory details only; payroll and role-based permissions are not configured.</p>
          </section>
          <section className="rounded-2xl border border-[#dce1e8] bg-white p-4 sm:p-6">
            <h2 className="text-xl font-semibold text-slate-900">Staff directory ({staff.length})</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
              {staff.map((person) => (
                <article key={person.id} className="rounded-xl border border-[#dce1e8] bg-[#f3f5f8] p-4">
                  <p className="font-semibold text-slate-900">{person.name}</p>
                  <p className="mt-1 text-sm text-slate-600">{person.role}</p>
                  <div className="mt-4 space-y-1 text-sm text-slate-700">
                    <p>Hours: {person.hours}</p>
                    <p>Status: {person.status}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      )}

      {kind === 'appointments' && (
        <section className="rounded-2xl border border-[#dce1e8] bg-white p-4 sm:p-6">
          <h2 className="text-2xl font-semibold text-slate-900">Appointment Management</h2>
          <p className="mt-1 text-sm text-slate-600">Reschedules enforce available-slot constraints; cancellations retain the appointment record.</p>
          {appointments.length ? (
            <div className="mt-4 space-y-4">
              {appointments.map((appointment) => {
                const isEditable = appointment.status !== 'cancelled' && !appointment.checkedInAt;
                return (
                  <article key={appointment.id} className="rounded-xl border border-[#dce1e8] bg-[#f3f5f8] p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-slate-900">{appointment.name} • {appointment.date} • {appointment.time}</p>
                      <p className="text-sm text-slate-600">{practitionerLabel(appointment.practitioner)} • {appointment.checkedInAt ? 'Checked in' : appointment.status === 'cancelled' ? 'Canceled' : 'Not checked in'}</p>
                    </div>
                    {!appointment.patientId && <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Patient match needs staff review. Verify the full name and phone against the patient directory before using visit history or calculating a treatment bill.</p>}
                    {isEditable && (
                      <div className="flex flex-col gap-3 lg:flex-row">
                        <form onSubmit={(event) => void changeAppointment(event, appointment.id)} className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                          <input className={fieldClass} type="date" name="date" min={new Date().toLocaleDateString('en-CA')} defaultValue={appointment.date} required aria-label="Appointment date" />
                          <select className={fieldClass} name="time" defaultValue={appointment.time} aria-label="Appointment time">
                            {Array.from(new Set([appointment.time, ...times])).map((time) => <option key={time} value={time}>{time}</option>)}
                          </select>
                          <select className={fieldClass} name="practitioner" defaultValue={appointment.practitioner} aria-label="Practitioner">
                            {Array.from(new Set([appointment.practitioner, ...practitioners])).map((practitioner) => <option key={practitioner} value={practitioner}>{practitionerLabel(practitioner)}</option>)}
                          </select>
                          <button className={buttonClass} disabled={saving}>Save reschedule</button>
                        </form>
                        <button className="min-h-11 rounded-lg border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50" disabled={saving} onClick={() => void cancelAppointment(appointment.id)}>Cancel appointment</button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          ) : <p className="mt-4 text-sm text-slate-600">No appointment records are available.</p>}
        </section>
      )}
    </div>
  );
}
