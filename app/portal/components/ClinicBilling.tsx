'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { demoBillingSnapshot } from '@/app/lib/demoBilling.server';

type Snapshot = ReturnType<typeof demoBillingSnapshot>;
type Invoice = Snapshot['invoices'][number];
const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
const field = 'min-h-12 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-3 text-base';
const button = 'min-h-12 rounded-xl bg-[#3158d8] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50';
const panel = 'min-w-0 rounded-2xl border border-[#dce1e8] bg-white p-5 sm:p-7';
const methods: Record<string, string> = { credit_card: 'Credit card', venmo: 'Venmo — external', zelle: 'Zelle — external', paypal: 'PayPal', apple_pay: 'Apple Pay', samsung_pay: 'Samsung Pay', google_pay: 'Google Pay / Android' };
const cents = (value: string) => { const match = /^(\d{1,6})(?:\.(\d{1,2}))?$/.exec(value); if (!match) throw new Error('Enter a valid dollar amount with at most two decimals.'); return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0')); };

function InvoiceCard({ invoice, mutate }: { invoice: Invoice; mutate: (key: string, body: Record<string, unknown>) => Promise<void> }) {
  const [paid, setPaid] = useState(String(Math.max(0, invoice.correctAmount - invoice.totalPaid) / 100));
  const [method, setMethod] = useState('credit_card');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const reserved = invoice.refunds.reduce((sum, refund) => sum + refund.amount, 0);
  const eligible = Math.max(0, invoice.totalPaid - invoice.correctAmount - reserved);
  const due = Math.max(0, invoice.correctAmount - invoice.totalPaid);
  async function action(key: string, body: Record<string, unknown>) {
    setBusy(true); setError('');
    try { await mutate(key, body); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Action could not complete.'); }
    finally { setBusy(false); }
  }
  return <article className={panel}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-semibold">{invoice.number} · {invoice.service}</h3><p className="mt-1 text-sm text-slate-600">{invoice.medicine ? 'Includes medicine +$50 · ' : ''}{new Date(invoice.issued_at).toLocaleString()} · {invoice.kind === 'insurance-treatment' ? 'Insurance invoice' : 'Fictional clinic invoice'}</p></div><span className="rounded-full bg-[#eef1fb] px-3 py-2 font-semibold">Correct bill: {money(invoice.correctAmount)}</span></div>
    <div className="mt-5 grid gap-3 text-sm sm:grid-cols-3"><p>Original invoice: <strong>{money(invoice.amount)}</strong></p><p>Total recorded paid: <strong>{money(invoice.totalPaid)}</strong></p><p>Balance due: <strong>{money(due)}</strong></p></div>
    {invoice.totalPaid > invoice.correctAmount && <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm">Overpayment detected: {money(invoice.totalPaid - invoice.correctAmount)}. Unreserved refund eligible: <strong>{money(eligible)}</strong>.</p>}
    {!invoice.totalPaid || due > 0 ? <form className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" onSubmit={(event) => { event.preventDefault(); try { void action(`payment:${invoice.id}`, { action: 'payment', invoiceId: invoice.id, method, amount: cents(paid) }); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Invalid amount.'); } }}>
      <label className="block space-y-2 text-sm font-medium"><span>Actual amount received (demo USD)</span><input className={field} inputMode="decimal" value={paid} onChange={(event) => setPaid(event.target.value)} required /></label>
      <label className="block space-y-2 text-sm font-medium"><span>Fictional payment method</span><select className={field} value={method} onChange={(event) => setMethod(event.target.value)}>{Object.entries(methods).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <button className={`${button} self-end`} disabled={busy}>Record fictional payment</button>
    </form> : <p className="mt-4 text-sm font-medium text-emerald-800">The correct bill is covered by recorded payments.</p>}
    {eligible > 0 && <button className={`${button} mt-4`} disabled={busy} onClick={() => void action(`refund:${invoice.id}`, { action: 'refund', invoiceId: invoice.id, reason: 'Overpayment above the system-calculated correct visit amount' })}>Approve overpayment refund {money(eligible)}</button>}
    {invoice.payments.length > 0 && <ul className="mt-4 space-y-2 text-sm text-slate-600">{invoice.payments.map((payment) => <li key={payment.id}>{money(payment.amount)} · {methods[payment.method]} · fictional receipt</li>)}</ul>}
    {invoice.refunds.map((refund) => <div key={refund.id} className="mt-4 rounded-xl bg-[#f3f5f8] p-4 text-sm leading-7"><p><strong>{money(refund.amount)}</strong> refund {refund.settled_at ? '— simulated completion recorded' : '— approved'}</p><p>Processing estimate after approval: {refund.expected_start} through {refund.expected_end} (3–5 US business days).</p>{!refund.settled_at && <button className={`${button} mt-3`} disabled={busy} onClick={() => void action(`settle:${refund.id}`, { action: 'settle-refund', refundId: refund.id })}>Simulate refund completion</button>}<p className="mt-2 text-slate-600">These are fixture records. No bank or Stripe refund was requested.</p></div>)}
    {error && <p role="alert" className="mt-4 text-sm text-rose-700">{error} Refresh records before retrying an uncertain transaction.</p>}
  </article>;
}

export default function ClinicBilling() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [patientId, setPatientId] = useState('');
  const [medicine, setMedicine] = useState(false);
  const [insurance, setInsurance] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const pending = useRef<Record<string, string>>({});
  const refresh = useCallback(async () => {
    const response = await fetch('/api/billing', { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) { setData(null); if (response.status !== 403) throw new Error(result.error ?? 'Billing unavailable.'); return; }
    setData(result); setPatientId((current) => current || result.patients[0]?.patient_id || '');
  }, []);
  useEffect(() => { void refresh().catch((reason) => setError(reason.message)).finally(() => setLoading(false)); }, [refresh]);
  const mutate = async (key: string, body: Record<string, unknown>) => {
    pending.current[key] ??= crypto.randomUUID();
    const response = await fetch('/api/billing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, requestId: pending.current[key] }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? 'Action could not be confirmed.');
    delete pending.current[key]; await refresh(); setNotice('Demo billing records saved and audited.');
  };
  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); const form = new FormData(event.currentTarget);
    try { const response = await fetch('/api/billing/demo-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: form.get('email'), password: form.get('password') }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Sign-in failed.'); }
    finally { setBusy(false); }
  }
  const selected = data?.patients.find((patient) => patient.patient_id === patientId);
  async function staffAction(key: string, body: Record<string, unknown>) { setBusy(true); setError(''); setNotice(''); try { await mutate(key, body); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Action failed.'); } finally { setBusy(false); } }
  return <div className="space-y-6">
    <section className={panel}><h2 className="text-2xl font-semibold">Billing &amp; Payments</h2><p className="mt-3 rounded-xl bg-amber-50 p-4 text-sm leading-7">Development ledger only. All treatments, invoices, payments and refunds here are fictional. No payment processor is contacted. These are not tax invoices.</p>
      <p className="mt-3 text-sm leading-7 text-slate-600">System-calculated prices: initial visit $180, follow-up $120, optional medicine +$50. Completed patient history determines visit type, including matched guest bookings. Cancellations and no-shows do not create completed visit history.</p>
      <p className="mt-2 text-sm leading-7 text-slate-600">Venmo and Zelle are separately recorded external methods. Live Stripe wallet availability depends on your US account and customer device; this demo does not claim any live payment integration.</p>
      {data && <p className="mt-3 text-sm font-semibold text-[#3158d8]">Authorized role: {data.actor.role === 'admin' ? 'Administrator' : 'Clinic staff (signed demo session)'}</p>}
    </section>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-rose-800">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-900">{notice}</p>}
    {loading ? <p role="status">Loading billing…</p> : !data ? <section className={panel}><h3 className="text-xl font-semibold">Demo clinic staff sign-in</h3><p className="mt-3 text-sm leading-7">Use billing.staff@example.invalid and DemoBilling!2026 for fictional billing only. This session grants no administrator, patient-management or audit access. Development simulators must be enabled.</p><form className="mt-4 grid max-w-xl gap-4" onSubmit={signIn}><label className="space-y-2"><span>Demo staff email</span><input className={field} name="email" type="email" required /></label><label className="space-y-2"><span>Demo staff password</span><input className={field} name="password" type="password" required /></label><button className={button} disabled={busy}>Sign in as demo clinic staff</button></form></section> : <>
      {!data.patients.length ? <section className={panel}><p>Ask an administrator to run System Status → Run demo setup first.</p></section> : <section className={panel}>
        <div className="flex flex-wrap justify-between gap-3"><h3 className="text-xl font-semibold">Demo patient and visit</h3><button className="min-h-11 text-sm font-semibold text-[#3158d8]" onClick={() => void refresh().catch((reason) => setError(reason.message))}>Refresh billing records</button></div>
        <label className="mt-4 block space-y-2 text-sm font-medium"><span>Fictional billing patient</span><select className={field} value={patientId} onChange={(event) => setPatientId(event.target.value)}>{data.patients.map((patient) => <option value={patient.patient_id} key={patient.patient_id}>{patient.name} · {patient.phone}</option>)}</select></label>
        <p className="mt-3 text-sm">Consecutive no-shows: <strong>{selected?.streak ?? 0}</strong> · New clinic bookings: <strong>{selected?.blocked ? 'Blocked' : 'Allowed'}</strong></p>
        <form className="mt-5 space-y-4" onSubmit={(event) => { event.preventDefault(); void staffAction(`visit:${patientId}:${medicine}:${insurance}`, { action: 'complete-treatment', patientId, medicine, insurance }); }}>
          <p className="text-sm text-slate-600">The server detects the correct visit type from completed history before issuing the bill.</p>
          <div className="flex flex-wrap gap-5"><label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={medicine} onChange={(event) => setMedicine(event.target.checked)} />Medicine add-on +$50</label><label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={insurance} onChange={(event) => setInsurance(event.target.checked)} />Insurance visit — invoice on business day 7</label></div>
          <button className={button} disabled={busy || Boolean(selected?.blocked)}>Complete demo treatment</button>
        </form>
        <details className="mt-6 border-t border-slate-200 pt-4"><summary className="min-h-11 font-semibold">Practice cancellation and no-show rules</summary><p className="mt-2 text-sm leading-7 text-slate-600">Cancellation at 24 hours or less: $50. The third consecutive no-show creates a $100 fee and blocks new public/staff bookings. Attendance or staff unblocking resets the streak; cancellations leave it unchanged.</p><div className="mt-4 flex flex-wrap gap-3"><button className={button} disabled={busy || Boolean(selected?.blocked)} onClick={() => void staffAction(`no-show:${patientId}`, { action: 'no-show', patientId })}>Record demo no-show</button><button className={button} disabled={busy} onClick={() => void staffAction(`cancel:${patientId}`, { action: 'cancellation', patientId, hoursBefore: 24 })}>Simulate cancellation at 24 hours</button>{selected?.blocked === 1 && <button className={button} disabled={busy} onClick={() => void staffAction(`unblock:${patientId}`, { action: 'unblock', patientId })}>Remove booking block and reset count</button>}</div></details>
      </section>}
      {data.visits.some((visit) => visit.insurance && !visit.invoice_id) && <section className={panel}><h3 className="text-xl font-semibold">Insurance invoice queue</h3><p className="mt-3 text-sm leading-7">Invoices issue automatically on business day 7. The job checks every minute while the app runs and catches up on restart. Dates use Pacific time and exclude weekends/US federal holidays. The simulation button tests the due date without changing the real server clock or submitting an insurance claim.</p><ul className="mt-4 space-y-4">{data.visits.filter((visit) => visit.insurance && !visit.invoice_id).map((visit) => <li key={visit.id} className="rounded-xl bg-[#f3f5f8] p-4 text-sm leading-7"><p>{money(visit.amount)} · Due {visit.due_date} · Posting window through {visit.window_end}</p><button className={`${button} mt-3`} disabled={busy} onClick={() => void staffAction(`insurance:${visit.id}`, { action: 'simulate-insurance-day7', treatmentId: visit.id })}>Simulate insurance day 7</button></li>)}</ul></section>}
      <section className="space-y-4"><h3 className="text-xl font-semibold">Fictional invoices and receipts</h3>{data.invoices.length ? data.invoices.map((invoice) => <InvoiceCard key={`${invoice.id}:${invoice.totalPaid}`} invoice={invoice} mutate={mutate} />) : <p className={panel}>No issued invoices yet.</p>}</section>
    </>}
  </div>;
}
