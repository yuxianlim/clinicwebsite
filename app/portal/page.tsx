"use client";

import { useEffect, useState } from 'react';
import { useBooking } from '@/app/context/BookingContext';
import { patients } from '@/app/lib/clinicData';
import { hasClinicPermission, readClinicAuth, type ClinicAuthSession } from '@/app/lib/clinicAuth';
import AuditLogViewer from './components/AuditLogViewer';

const sections = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'patients', label: 'Patient Management' },
  { id: 'appointments', label: 'Appointment Management' },
  { id: 'billing', label: 'Billing & Payments' },
  { id: 'staff', label: 'Staff Management' },
  { id: 'audit', label: 'Administration / Security' },
] as const;

type SectionId = (typeof sections)[number]['id'];

const dashboardStats = [
  { label: 'Today\'s appointments', value: '18', detail: '4 new bookings' },
  { label: 'Patients waiting', value: '6', detail: '2 check-ins pending' },
  { label: 'Patients in treatment', value: '11', detail: '3 in acupuncture' },
  { label: 'Available practitioners', value: '3', detail: 'All teams online' },
  { label: 'Daily revenue', value: '$2,340', detail: '+12% vs yesterday' },
  { label: 'Low herbal inventory', value: '4 items', detail: 'Reorder recommended' },
];

const notifications = [
  'Clinic reminder: flu season vaccination packets available.',
  'Staff meeting moved to 3:00 PM today.',
  'New consent forms uploaded for pediatric visits.',
];

const staff = [
  { name: 'Dr. Li', role: 'Lead Practitioner', hours: '9:00 - 18:00', status: 'On duty' },
  { name: 'Maya', role: 'Reception', hours: '8:30 - 16:30', status: 'On duty' },
  { name: 'Jin', role: 'Herbal Specialist', hours: '10:00 - 17:00', status: 'Break' },
];

const billingItems = [
  { title: 'Consultation fees', amount: '$95' },
  { title: 'Treatment charges', amount: '$140' },
  { title: 'Herbal medicine charges', amount: '$68' },
  { title: 'Membership fees', amount: '$120' },
  { title: 'Insurance claims', amount: 'Pending review' },
  { title: 'Discounts', amount: '-$20' },
  { title: 'Gift cards', amount: '$50' },
  { title: 'Refunds', amount: '$0' },
  { title: 'Invoices', amount: '3 open' },
  { title: 'Receipts', amount: '12 issued' },
  { title: 'Payment methods', amount: 'Card / Cash / Insurance' },
];

export default function PortalPage() {
  const [activeSection, setActiveSection] = useState<SectionId>('dashboard');
  const [patientQuery, setPatientQuery] = useState('');
  const [sortBy, setSortBy] = useState<'firstName' | 'lastName' | 'membershipId'>('lastName');
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(patients[0]?.id ?? null);
  const [authSession, setAuthSession] = useState<ClinicAuthSession | null>(null);
  const { appointments: bookedAppointments } = useBooking();

  useEffect(() => {
    setAuthSession(readClinicAuth());
  }, []);

  const canReadAuditLog = hasClinicPermission(authSession, 'audit-log:read');

  useEffect(() => {
    if (activeSection === 'audit' && !canReadAuditLog) {
      void fetch('/api/audit-log', { cache: 'no-store' }).catch(() => undefined);
    }
  }, [activeSection, canReadAuditLog]);

  const filteredPatients = [...patients]
    .filter((patient) => {
      const search = patientQuery.toLowerCase();
      return [patient.firstName, patient.lastName, patient.id, patient.status].some((value) => value.toLowerCase().includes(search));
    })
    .sort((a, b) => {
      if (sortBy === 'firstName') return a.firstName.localeCompare(b.firstName);
      if (sortBy === 'membershipId') return a.id.localeCompare(b.id);
      return a.lastName.localeCompare(b.lastName);
    });

  const selectedPatient = filteredPatients.find((patient) => patient.id === selectedPatientId) ?? filteredPatients[0] ?? null;

  const renderContent = () => {
    switch (activeSection) {
      case 'audit':
        return canReadAuditLog ? <AuditLogViewer /> : (
          <div className="rounded-xl border border-rose-900 bg-slate-900/70 p-6" role="alert">
            <h2 className="text-xl font-semibold text-white">Access denied</h2>
            <p className="mt-2 text-sm text-slate-300">An authenticated administrator with the audit-log read permission is required.</p>
          </div>
        );
      case 'patients':
        return (
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-semibold text-white">Patient Management</h2>
                  <p className="text-sm text-slate-400">Register patients and keep records organized in one place.</p>
                </div>
                <button className="rounded-lg bg-[#556B42] px-4 py-2 text-sm font-semibold text-white">Register patient</button>
              </div>
              <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <input
                  value={patientQuery}
                  onChange={(event) => setPatientQuery(event.target.value)}
                  placeholder="Search patients by name or membership ID"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-[#556B42] lg:max-w-md"
                />
                <select
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value as 'firstName' | 'lastName' | 'membershipId')}
                  className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                >
                  <option value="lastName">Sort by last name</option>
                  <option value="firstName">Sort by first name</option>
                  <option value="membershipId">Sort by membership ID</option>
                </select>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                {filteredPatients.map((patient) => (
                  <button
                    key={patient.id}
                    onClick={() => setSelectedPatientId(patient.id)}
                    className={`rounded-xl border p-4 text-left transition ${selectedPatientId === patient.id ? 'border-[#556B42] bg-[#556B42]/20' : 'border-slate-700 bg-slate-800/80 hover:border-slate-500'}`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-white">{patient.firstName} {patient.lastName}</p>
                        <p className="text-sm text-slate-400">{patient.id}</p>
                      </div>
                      <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300">{patient.status}</span>
                    </div>
                    <div className="mt-4 grid gap-2 text-sm text-slate-300">
                      <div>Last visit: {patient.lastVisit}</div>
                      <div>Phone: {patient.phone}</div>
                      <div>QR check-in: Ready</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6">
              <h3 className="text-lg font-semibold text-white">Selected patient details</h3>
              {selectedPatient ? (
                <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_0.9fr]">
                  <div className="rounded-xl border border-slate-700 bg-slate-800/80 p-4">
                    <p className="font-semibold text-white">{selectedPatient.firstName} {selectedPatient.lastName}</p>
                    <p className="mt-1 text-sm text-slate-400">Membership ID: {selectedPatient.id}</p>
                    <div className="mt-4 space-y-2 text-sm text-slate-300">
                      <div>Phone: {selectedPatient.phone}</div>
                      <div>Status: {selectedPatient.status}</div>
                      <div>Last visit: {selectedPatient.lastVisit}</div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-700 bg-slate-800/80 p-4">
                    <p className="font-semibold text-white">Visit history</p>
                    <ul className="mt-3 space-y-3 text-sm text-slate-300">
                      {selectedPatient.visitHistory.map((visit) => (
                        <li key={`${visit.date}-${visit.treatment}`} className="rounded-lg bg-slate-900/60 px-3 py-2">
                          <div className="font-medium text-white">{visit.date}</div>
                          <div>{visit.treatment}</div>
                          <div className="text-slate-400">Practitioner: {visit.practitioner}</div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-400">No matching patient found.</p>
              )}
            </div>
          </div>
        );
      case 'appointments':
        return (
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-semibold text-white">Appointment Management</h2>
                  <p className="text-sm text-slate-400">Book online, manage walk-ins, and keep waitlists under control.</p>
                </div>
                <button className="rounded-lg bg-[#556B42] px-4 py-2 text-sm font-semibold text-white">New booking</button>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-slate-700 bg-slate-800/80 p-4">
                  <h3 className="font-semibold text-white">Today&apos;s schedule</h3>
                  {bookedAppointments.length > 0 ? (
                    <ul className="mt-3 space-y-2 text-sm text-slate-300">
                      {bookedAppointments.map((item) => (
                        <li key={item.id} className="flex flex-col gap-1 rounded-lg bg-slate-900/60 px-3 py-2 md:flex-row md:items-center md:justify-between">
                          <span>{item.name} • {item.date} • {item.time}</span>
                          <span className={item.checkedInAt ? 'text-emerald-300' : 'text-slate-400'}>
                            {item.practitioner} • {item.checkedInAt ? 'Checked in' : 'Not checked in'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-slate-400">No bookings have been submitted yet.</p>
                  )}
                </div>
                <div className="rounded-xl border border-slate-700 bg-slate-800/80 p-4">
                  <h3 className="font-semibold text-white">Operational tools</h3>
                  <ul className="mt-3 space-y-2 text-sm text-slate-300">
                    <li>• Online booking and walk-in registration</li>
                    <li>• Practitioner availability and calendar view</li>
                    <li>• Waitlist, reschedule, cancellation, and recurring appointments</li>
                    <li>• Reminder delivery for incoming visits</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        );
      case 'billing':
        return (
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-semibold text-white">Billing & Payments</h2>
                  <p className="text-sm text-slate-400">Track charges, payments, invoices, refunds, and methods in one place.</p>
                </div>
                <button className="rounded-lg bg-[#556B42] px-4 py-2 text-sm font-semibold text-white">Create invoice</button>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {billingItems.map((item) => (
                  <div key={item.title} className="rounded-xl border border-slate-700 bg-slate-800/80 p-4">
                    <p className="text-sm text-slate-400">{item.title}</p>
                    <p className="mt-2 text-xl font-semibold text-white">{item.amount}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6">
              <h3 className="text-lg font-semibold text-white">Payment workflow</h3>
              <ul className="mt-4 space-y-2 text-sm text-slate-300">
                <li>• Consultation fees, treatment charges, and herbal medicine charges can be grouped by visit.</li>
                <li>• Membership fees, insurance claims, discounts, gift cards, refunds, invoices, receipts, and payment methods are visible for staff review.</li>
              </ul>
            </div>
          </div>
        );
      case 'staff':
        return (
          <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-white">Staff Management</h2>
                <p className="text-sm text-slate-400">Coordinate roles, attendance, leave, and payroll readiness.</p>
              </div>
              <button className="rounded-lg bg-[#556B42] px-4 py-2 text-sm font-semibold text-white">Add staff</button>
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              {staff.map((person) => (
                <div key={person.name} className="rounded-xl border border-slate-700 bg-slate-800/80 p-4">
                  <p className="font-semibold text-white">{person.name}</p>
                  <p className="mt-1 text-sm text-slate-400">{person.role}</p>
                  <div className="mt-4 space-y-1 text-sm text-slate-300">
                    <div>Hours: {person.hours}</div>
                    <div>Status: {person.status}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      case 'dashboard':
      default:
        return (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {dashboardStats.map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5">
                  <p className="text-sm text-slate-400">{stat.label}</p>
                  <p className="mt-2 text-3xl font-semibold text-white">{stat.value}</p>
                  <p className="mt-2 text-sm text-[#9DBB7B]">{stat.detail}</p>
                </div>
              ))}
            </div>
            <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6">
                <h2 className="text-xl font-semibold text-white">Notifications & announcements</h2>
                <ul className="mt-4 space-y-3 text-sm text-slate-300">
                  {notifications.map((item) => (
                    <li key={item} className="rounded-lg bg-slate-800/80 px-3 py-2">{item}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6">
                <h2 className="text-xl font-semibold text-white">Upcoming follow-ups</h2>
                <ul className="mt-4 space-y-3 text-sm text-slate-300">
                  <li className="rounded-lg bg-slate-800/80 px-3 py-2">Emily Wong — follow-up in 2 hours</li>
                  <li className="rounded-lg bg-slate-800/80 px-3 py-2">Thomas Hall — review medication response</li>
                  <li className="rounded-lg bg-slate-800/80 px-3 py-2">Nancy Lin — recheck after treatment</li>
                </ul>
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-4 text-slate-100 md:p-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 lg:flex-row">
        <aside className="w-full rounded-2xl border border-slate-700 bg-slate-900/80 p-4 lg:w-72">
          <div className="mb-6">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#9DBB7B]">Clinic Management</p>
            <h1 className="mt-2 text-2xl font-bold text-white">Operations hub</h1>
            <p className="mt-2 text-sm text-slate-400">A lightweight staff workspace for appointments, patients, and teams.</p>
          </div>
          <nav className="space-y-2">
            {sections.filter((section) => section.id !== 'audit' || canReadAuditLog).map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`w-full rounded-lg px-3 py-3 text-left text-sm font-medium transition ${activeSection === section.id ? 'bg-[#556B42] text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
              >
                {section.label}
              </button>
            ))}
          </nav>
        </aside>

        <main className="flex-1 rounded-2xl border border-slate-700 bg-slate-900/70 p-4 md:p-6">
          <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-[#9DBB7B]">Staff workspace</p>
              <h2 className="text-3xl font-semibold text-white">{sections.find((section) => section.id === activeSection)?.label}</h2>
            </div>
            <div className="rounded-full border border-[#556B42] bg-[#556B42]/20 px-4 py-2 text-sm text-[#DCECD0]">
              {process.env.NODE_ENV === 'development' ? 'Development demo admin' : 'Live mode • production'}
            </div>
          </div>
          {renderContent()}
        </main>
      </div>
    </div>
  );
}
