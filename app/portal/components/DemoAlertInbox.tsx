'use client';

import { useEffect, useState } from 'react';
import type { DemoAlert } from '@/app/lib/demoAlerts.server';

export default function DemoAlertInbox({ checkedAt }: { checkedAt: string }) {
  const [alerts, setAlerts] = useState<DemoAlert[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/system-status/demo-alerts', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => { const data = await response.json(); if (!response.ok || !Array.isArray(data.alerts)) throw new Error(data.error ?? 'Inbox could not be loaded.'); setAlerts(data.alerts); setError(''); })
      .catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Inbox is unavailable.'); });
    return () => controller.abort();
  }, [checkedAt]);
  async function send() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/system-status/demo-alerts', { method: 'POST' });
      const data = await response.json(); if (!response.ok) throw new Error(data.error ?? 'Test alert failed.');
      setAlerts((previous) => [data.alert, ...previous].slice(0, 50));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Test alert failed.'); }
    finally { setBusy(false); }
  }
  return <details className="mt-5 rounded-xl border border-[#dce1e8] bg-white p-5">
    <summary className="min-h-11 font-semibold">Local demo alert inbox ({alerts.length})</summary>
    <p className="mt-2 text-sm leading-6 text-slate-600">Operational test events and actual local receipts. No external notifications are sent; no patient or payment details belong here.</p>
    <button className="mt-4 min-h-12 rounded-xl bg-[#3158d8] px-5 py-3 font-semibold text-white disabled:opacity-50" disabled={busy} onClick={() => void send()}>{busy ? 'Sending local test…' : 'Send demo alert'}</button>
    {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
    <ul className="mt-4 space-y-3">{alerts.map((alert) => <li key={alert.eventId} className="min-w-0 rounded-xl bg-[#f3f5f8] p-4 text-sm leading-6"><p className="font-semibold">{alert.severity.toUpperCase()} · {alert.code}</p><p>Received: {new Date(alert.receivedAt).toLocaleString()}</p><p className="break-all text-slate-600">Event: {alert.eventId}<br />Receipt: {alert.incidentId}<br />Source: local demo inbox</p></li>)}</ul>
    {!alerts.length && <p className="mt-4 text-sm text-slate-600">No local test alerts recorded.</p>}
  </details>;
}
