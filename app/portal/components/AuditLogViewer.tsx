'use client';

import { useEffect, useMemo, useState } from 'react';
import { hasClinicPermission, readClinicAuth } from '@/app/lib/clinicAuth';
import { readAuditLog, type AuditEvent, type AuditModule } from '@/app/lib/auditLog';

const modules: { value: 'all' | AuditModule; label: string }[] = [
  { value: 'all', label: 'All activity' },
  { value: 'appointments', label: 'Appointments' },
  { value: 'check-in', label: 'Check-in' },
  { value: 'payments', label: 'Payments' },
  { value: 'ceu', label: 'CEU' },
  { value: 'authentication', label: 'Authentication' },
  { value: 'administration', label: 'Administration' },
];

export default function AuditLogViewer() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [module, setModule] = useState<'all' | AuditModule>('all');
  const [search, setSearch] = useState('');
  const [authorized, setAuthorized] = useState(false);
  const [chainValid, setChainValid] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const refresh = async () => {
      setAuthorized(hasClinicPermission(readClinicAuth(), 'audit-log:read'));
      try {
        const auditLog = await readAuditLog();
        setEvents(auditLog.events);
        setChainValid(auditLog.chainValid);
        setError('');
      } catch {
        setChainValid(false);
        setError('The central audit table is unavailable. Check the server logs and database path.');
      } finally {
        setLoading(false);
      }
    };

    void refresh();
    const interval = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(interval);
  }, []);

  const filteredEvents = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return events.filter((event) => {
      const moduleMatches = module === 'all' || event.module === module;
      const searchMatches = !normalizedSearch || [
        event.eventId,
        event.module,
        event.actorId,
        event.role,
        event.action,
        event.relatedRecordId,
        event.result,
        event.sessionId ?? '',
        event.safeChangeSummary,
        event.previousHash,
        event.entryHash,
      ].some((value) => value.toLowerCase().includes(normalizedSearch));
      return moduleMatches && searchMatches;
    });
  }, [events, module, search]);

  if (!authorized) {
    return (
      <section className="rounded-xl border border-rose-200 bg-white p-6" role="alert">
        <h3 className="text-lg font-semibold text-slate-900">Access denied</h3>
        <p className="mt-2 text-sm text-slate-700">An authenticated administrator with the audit-log read permission is required.</p>
      </section>
    );
  }

  return (
    <section className="min-w-0 space-y-5">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Hash-chain verification detects changes to audit events. It does not replace access controls, secure storage, monitoring, or backups.
      </div>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-xl font-semibold text-slate-900">Central audit activity</h3>
          <p className="mt-1 text-sm text-slate-600">Appointment, check-in, payment, CEU, and authentication events. Verification values and payment details are not included.</p>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span role="status" aria-live="polite" className={chainValid ? 'text-emerald-700' : 'text-rose-700'}>
            Verify Chain: {chainValid ? 'Valid' : 'Failed'}
          </span>
          <span className="text-slate-600">{filteredEvents.length} events</span>
        </div>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <select aria-label="Filter audit activity" value={module} onChange={(event) => setModule(event.target.value as 'all' | AuditModule)} className="min-h-11 rounded-lg border border-[#dce1e8] bg-[#f3f5f8] px-3 text-slate-900">
          {modules.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <input aria-label="Search audit events" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search event, actor, action, record, or hash" className="min-h-11 min-w-0 flex-1 rounded-lg border border-[#dce1e8] bg-[#f3f5f8] px-3 text-slate-900 placeholder:text-slate-500" />
      </div>
      {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</p> : null}
      {loading ? <p className="py-8 text-center text-sm text-slate-600">Loading audit events...</p> : filteredEvents.length ? (
        <>
          <div className="space-y-3 lg:hidden">
            {filteredEvents.map((event) => (
              <article key={event.eventId} className="min-w-0 rounded-xl border border-[#dce1e8] bg-white p-4 [overflow-wrap:anywhere]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h4 className="min-w-0 font-semibold text-slate-900">{event.action}</h4>
                  <span className={`rounded-full border border-current px-2 py-1 text-xs ${event.result === 'success' ? 'text-emerald-700' : event.result === 'denied' || event.result === 'pending' ? 'text-amber-800' : 'text-rose-700'}`}>{event.result}</span>
                </div>
                <p className="mt-2 text-xs text-slate-600"><time dateTime={event.occurredAt}>{new Date(event.occurredAt).toLocaleString()}</time> · {event.module}</p>
                <p className="mt-3 text-sm leading-6 text-slate-700">{event.safeChangeSummary}</p>
                <details className="mt-3 border-t border-[#dce1e8] pt-3">
                  <summary className="min-h-11 text-sm font-medium text-slate-800">Event details</summary>
                  <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                    {[
                      ['Event ID', event.eventId], ['User / service ID', event.actorId], ['Role', event.role],
                      ['Related record ID', event.relatedRecordId], ['Session ID', event.sessionId ?? 'N/A'],
                      ['UTC date/time', event.occurredAt], ['Previous hash', event.previousHash], ['Entry hash', event.entryHash],
                    ].map(([label, value]) => <div key={label} className="min-w-0"><dt className="font-medium text-slate-800">{label}</dt><dd className="mt-1 break-all text-xs text-slate-600">{value}</dd></div>)}
                  </dl>
                </details>
              </article>
            ))}
          </div>
          <div className="hidden min-w-0 lg:block">
            <p className="mb-2 text-xs text-slate-600">Scroll the table horizontally to view all event fields.</p>
            <div role="region" aria-label="Audit history table" tabIndex={0} className="max-w-full overflow-x-auto rounded-xl border border-[#dce1e8]">
          <table className="w-full min-w-[1500px] text-left text-sm">
            <caption className="sr-only">Audit events with full hash-chain details</caption>
            <thead className="bg-[#f3f5f8] text-slate-700">
              <tr>
                <th className="px-4 py-3 font-semibold">UTC date/time</th>
                <th className="px-4 py-3 font-semibold">Event ID</th>
                <th className="px-4 py-3 font-semibold">Module</th>
                <th className="px-4 py-3 font-semibold">User / service ID</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Action</th>
                <th className="px-4 py-3 font-semibold">Related record ID</th>
                <th className="px-4 py-3 font-semibold">Result</th>
                <th className="px-4 py-3 font-semibold">Session ID</th>
                <th className="px-4 py-3 font-semibold">Safe change summary</th>
                <th className="px-4 py-3 font-semibold">Previous Hash</th>
                <th className="px-4 py-3 font-semibold">Entry Hash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredEvents.map((event) => (
                <tr key={event.eventId} className="bg-white text-slate-800">
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{event.occurredAt}</td>
                  <td className="px-4 py-3 font-mono text-xs">{event.eventId}</td>
                  <td className="px-4 py-3">{event.module}</td>
                  <td className="px-4 py-3">{event.actorId}</td>
                  <td className="px-4 py-3">{event.role}</td>
                  <td className="px-4 py-3">{event.action}</td>
                  <td className="px-4 py-3 font-mono text-xs">{event.relatedRecordId}</td>
                  <td className="px-4 py-3"><span className={event.result === 'success' ? 'text-emerald-700' : event.result === 'denied' || event.result === 'pending' ? 'text-amber-800' : 'text-rose-700'}>{event.result}</span></td>
                  <td className="px-4 py-3 font-mono text-xs">{event.sessionId ?? 'N/A'}</td>
                  <td className="max-w-xs whitespace-normal px-4 py-3">{event.safeChangeSummary}</td>
                  <td className="px-4 py-3 font-mono text-xs">{event.previousHash}</td>
                  <td className="px-4 py-3 font-mono text-xs">{event.entryHash}</td>
                </tr>
              ))}
            </tbody>
          </table>
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-[#dce1e8] bg-white px-5 py-12 text-center">
          <p className="font-medium text-slate-900">No audit events found</p>
          <p className="mt-2 text-sm text-slate-600">Clinic activity will appear here as it is recorded.</p>
        </div>
      )}
    </section>
  );
}