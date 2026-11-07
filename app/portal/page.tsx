"use client";

import { useEffect, useState } from 'react';
import { hasClinicPermission, readClinicAuth, type ClinicAuthSession } from '@/app/lib/clinicAuth';
import AuditLogViewer from './components/AuditLogViewer';
import ClinicRecordsManager from './components/ClinicRecordsManager';
import SystemStatusViewer from './components/SystemStatusViewer';

const sections = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'patients', label: 'Patient Management' },
  { id: 'appointments', label: 'Appointment Management' },
  { id: 'billing', label: 'Billing & Payments' },
  { id: 'staff', label: 'Staff Management' },
  { id: 'audit', label: 'Administration / Security' },
  { id: 'system-status', label: 'Development / System Status' },
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
  const [activeSection, setActiveSection] = useState<SectionId>(
    process.env.NODE_ENV === 'development' ? 'system-status' : 'dashboard',
  );
  const [authSession, setAuthSession] = useState<ClinicAuthSession | null>(null);

  useEffect(() => {
    setAuthSession(readClinicAuth());
  }, []);

  const canReadAuditLog = hasClinicPermission(authSession, 'audit-log:read');

  useEffect(() => {
    if (activeSection === 'audit' && !canReadAuditLog) {
      void fetch('/api/audit-log', { cache: 'no-store' }).catch(() => undefined);
    }
  }, [activeSection, canReadAuditLog]);

  const renderContent = () => {
    switch (activeSection) {
      case 'audit':
        return canReadAuditLog ? <AuditLogViewer /> : (
          <div className="rounded-xl border border-rose-900 bg-slate-900/70 p-6" role="alert">
            <h2 className="text-xl font-semibold text-white">Access denied</h2>
            <p className="mt-2 text-sm text-slate-300">An authenticated administrator with the audit-log read permission is required.</p>
          </div>
        );
      case 'system-status':
        return canReadAuditLog ? <SystemStatusViewer /> : (
          <div className="rounded-xl border border-rose-900 bg-slate-900/70 p-6" role="alert">
            <h2 className="text-xl font-semibold text-white">Access denied</h2>
            <p className="mt-2 text-sm text-slate-300">An authenticated administrator with the audit-log read permission is required.</p>
          </div>
        );
      case 'patients':
        return <ClinicRecordsManager kind="patients" />;
      case 'appointments':
        return <ClinicRecordsManager kind="appointments" />;
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
        return <ClinicRecordsManager kind="staff" />;
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
            {sections.filter((section) => (section.id !== 'audit' && section.id !== 'system-status') || canReadAuditLog).map((section) => (
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
