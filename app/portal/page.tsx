"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { hasClinicPermission } from '@/app/lib/clinicAuth';
import { useClinicAuth } from '@/app/lib/useClinicAuth';
import AuditLogViewer from './components/AuditLogViewer';
import ClinicRecordsManager from './components/ClinicRecordsManager';
import SystemStatusViewer from './components/SystemStatusViewer';
import ClinicBilling from './components/ClinicBilling';

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

export default function PortalPage() {
  const [activeSection, setActiveSection] = useState<SectionId>(
    process.env.NODE_ENV === 'development' ? 'system-status' : 'dashboard',
  );
  const authSession = useClinicAuth();
  const [navigationOpen, setNavigationOpen] = useState(false);

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
          <div className="rounded-xl border border-rose-200 bg-white p-4 sm:p-6" role="alert">
            <h2 className="text-xl font-semibold text-slate-900">Access denied</h2>
            <p className="mt-2 text-sm text-slate-700">An authenticated administrator with the audit-log read permission is required.</p>
          </div>
        );
      case 'system-status':
        return canReadAuditLog ? <SystemStatusViewer /> : (
          <div className="rounded-xl border border-rose-200 bg-white p-4 sm:p-6" role="alert">
            <h2 className="text-xl font-semibold text-slate-900">Access denied</h2>
            <p className="mt-2 text-sm text-slate-700">An authenticated administrator with the audit-log read permission is required.</p>
          </div>
        );
      case 'patients':
        return <ClinicRecordsManager key="patients" kind="patients" />;
      case 'appointments':
        return <ClinicRecordsManager key="appointments" kind="appointments" />;
      case 'billing':
        return <ClinicBilling />;
      case 'staff':
        return <ClinicRecordsManager key="staff" kind="staff" />;
      case 'dashboard':
      default:
        return (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {dashboardStats.map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-[#dce1e8] bg-white p-5">
                  <p className="text-sm text-slate-600">{stat.label}</p>
                  <p className="mt-2 text-3xl font-semibold text-slate-900">{stat.value}</p>
                  <p className="mt-2 text-sm text-[#3158d8]">{stat.detail}</p>
                </div>
              ))}
            </div>
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
              <div className="rounded-2xl border border-[#dce1e8] bg-white p-4 sm:p-6">
                <h2 className="text-xl font-semibold text-slate-900">Notifications & announcements</h2>
                <ul className="mt-4 space-y-3 text-sm text-slate-700">
                  {notifications.map((item) => (
                    <li key={item} className="rounded-lg bg-[#f3f5f8] px-3 py-2">{item}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-[#dce1e8] bg-white p-4 sm:p-6">
                <h2 className="text-xl font-semibold text-slate-900">Upcoming follow-ups</h2>
                <ul className="mt-4 space-y-3 text-sm text-slate-700">
                  <li className="rounded-lg bg-[#f3f5f8] px-3 py-2">Emily Wong — follow-up in 2 hours</li>
                  <li className="rounded-lg bg-[#f3f5f8] px-3 py-2">Thomas Hall — review medication response</li>
                  <li className="rounded-lg bg-[#f3f5f8] px-3 py-2">Nancy Lin — recheck after treatment</li>
                </ul>
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen [--focus-ring:#3158d8] bg-[#f4f5f7] p-3 text-slate-900 sm:p-6 lg:p-8">
      <div className="mx-auto flex w-full max-w-[1600px] min-w-0 flex-col items-start gap-4 lg:flex-row lg:gap-6">
        <aside className="w-full shrink-0 rounded-2xl border border-[#dce1e8] bg-white p-4 lg:sticky lg:top-6 lg:w-64">
          <div className="mb-4">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#3158d8]">Aven Clinic</p>
            <h1 className="mt-2 text-2xl font-bold text-slate-900">Practice workspace</h1>
            <p className="mt-2 hidden text-sm text-slate-600 lg:block">A lightweight staff workspace for appointments, patients, and teams.</p>
          </div>
          <Link href="/" className="mb-4 inline-flex min-h-11 items-center text-sm text-slate-700 hover:text-[#3158d8]">← Clinic website</Link>
          <button type="button" className="flex min-h-11 w-full items-center justify-between rounded-lg border border-[#dce1e8] px-3 py-2 text-left text-sm font-semibold text-slate-900 lg:hidden" aria-expanded={navigationOpen} aria-controls="workspace-navigation" onClick={() => setNavigationOpen(!navigationOpen)}>
            Workspace navigation <span aria-hidden="true">{navigationOpen ? '−' : '+'}</span>
          </button>
          <nav id="workspace-navigation" aria-label="Workspace" className={`${navigationOpen ? 'grid' : 'hidden'} mt-3 grid-cols-1 gap-2 sm:grid-cols-2 lg:mt-0 lg:grid lg:grid-cols-1`}>
            {sections.filter((section) => (section.id !== 'audit' && section.id !== 'system-status') || canReadAuditLog).map((section) => (
              <button
                key={section.id}
                onClick={() => { setActiveSection(section.id); setNavigationOpen(false); }}
                aria-current={activeSection === section.id ? 'page' : undefined}
                className={`min-h-11 w-full rounded-lg px-3 py-3 text-left text-sm font-medium transition ${activeSection === section.id ? 'bg-[#3158d8] text-white' : 'bg-[#f3f5f8] text-slate-700 hover:bg-[#f3f5f8]'}`}
              >
                {section.label}
              </button>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 w-full flex-1 [overflow-wrap:anywhere] rounded-2xl border border-[#dce1e8] bg-white p-4 md:p-6">
          <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-[#3158d8]">Staff workspace</p>
              <h2 className="text-2xl font-semibold text-slate-900 sm:text-3xl">{sections.find((section) => section.id === activeSection)?.label}</h2>
            </div>
            <div className="max-w-full shrink-0 self-start rounded-full border border-[#3158d8] bg-[#3158d8]/20 px-4 py-2 text-sm text-[#294bb8]">
              {process.env.NODE_ENV === 'development' ? 'Development demo admin' : 'Live mode • production'}
            </div>
          </div>
          {renderContent()}
        </main>
      </div>
    </div>
  );
}
