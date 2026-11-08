'use client';

import { useState } from 'react';
import { practitionerLabel } from '@/app/lib/practitionerLabels';
import { useBooking } from '@/app/context/BookingContext';

type KioskStep = 'start' | 'phone' | 'code' | 'scan' | 'confirm' | 'success';

type KioskPatient = { id: string; name: string };
type KioskAppointment = { id: string; date: string; time: string; practitioner: string };

type KioskLookupResponse = {
  patient?: KioskPatient;
  appointment?: KioskAppointment;
  checkInToken?: string;
  error?: string;
};

export default function KioskClient({ demoVerificationEnabled = false }: { demoVerificationEnabled?: boolean }) {
  const { syncAppointmentCheckIn } = useBooking();
  const [step, setStep] = useState<KioskStep>('start');
  const [lastFour, setLastFour] = useState('');
  const [patient, setPatient] = useState<KioskPatient | null>(null);
  const [appointment, setAppointment] = useState<KioskAppointment | null>(null);
  const [checkInToken, setCheckInToken] = useState('');
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [demoFlow, setDemoFlow] = useState(false);
  const [fullPhone, setFullPhone] = useState('');
  const [needsFullPhone, setNeedsFullPhone] = useState(false);
  const [challengeId, setChallengeId] = useState('');
  const [demoCode, setDemoCode] = useState('');
  const [code, setCode] = useState('');
  const [cardToken, setCardToken] = useState('');

  const resetKiosk = () => {
    setStep('start');
    setLastFour('');
    setPatient(null);
    setAppointment(null);
    setCheckInToken('');
    setMessage('');
    setIsSaving(false);
    setDemoFlow(false); setFullPhone(''); setNeedsFullPhone(false); setChallengeId(''); setDemoCode(''); setCode('');
    setCardToken('');
  };

  const showPhoneLookup = () => {
    setStep('phone');
    setMessage('');
  };

  const findTodaysAppointment = async () => {
    const normalizedLastFour = lastFour.replace(/\D/g, '');
    if (normalizedLastFour.length !== 4) {
      setMessage('Enter exactly four digits from the phone number on your patient record.');
      return;
    }

    setIsSaving(true);
    setMessage('');
    try {
      if (demoFlow) {
        const response = await fetch('/api/kiosk/demo-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'request', lastFour: normalizedLastFour, ...(needsFullPhone ? { fullPhone } : {}) }) });
        const data = await response.json();
        if (!response.ok) { setMessage(data.error ?? 'Demo code could not be created.'); return; }
        if (data.requiresFullPhone) { setNeedsFullPhone(true); setMessage('Several records share these last four digits. Enter the full phone number.'); return; }
        setChallengeId(data.challengeId); setDemoCode(data.demoCode); setCode(''); setStep('code'); return;
      }
      const response = await fetch('/api/kiosk/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lastFour: normalizedLastFour }),
      });
      const data = await response.json() as KioskLookupResponse;
      if (!response.ok || !data.patient || !data.appointment || !data.checkInToken) {
        setMessage(data.error ?? 'We could not verify an appointment for today. Please see the front desk.');
        return;
      }
      setPatient(data.patient);
      setAppointment(data.appointment);
      setCheckInToken(data.checkInToken);
      setStep('confirm');
    } catch {
      setMessage('The appointment service is temporarily unavailable. Please see the front desk.');
    } finally {
      setIsSaving(false);
    }
  };

  const verifyCode = async () => {
    setIsSaving(true); setMessage('');
    try {
      const response = await fetch('/api/kiosk/demo-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'verify', challengeId, code }) });
      const data = await response.json() as KioskLookupResponse;
      if (!response.ok || !data.patient || !data.appointment || !data.checkInToken) { setMessage(data.error ?? 'The demo code could not be verified.'); return; }
      setPatient(data.patient); setAppointment(data.appointment); setCheckInToken(data.checkInToken); setStep('confirm');
    } catch { setMessage('Demo verification is temporarily unavailable.'); }
    finally { setIsSaving(false); }
  };

  const readDemoCard = async (simulate = false) => {
    setIsSaving(true); setMessage('');
    try {
      const response = await fetch('/api/kiosk/demo-card', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(simulate ? { action: 'simulate-tap' } : { token: cardToken.trim() }) });
      const data = await response.json() as KioskLookupResponse;
      if (!response.ok || !data.patient || !data.appointment || !data.checkInToken) { setMessage(data.error ?? 'The demo card could not be verified.'); return; }
      setPatient(data.patient); setAppointment(data.appointment); setCheckInToken(data.checkInToken); setStep('confirm');
    } catch { setMessage('Demo card lookup is temporarily unavailable.'); }
    finally { setIsSaving(false); }
  };

  const confirmCheckIn = async () => {
    if (!appointment) return;

    setIsSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/kiosk/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId: appointment.id, checkInToken }),
      });
      const data = await response.json() as { checkedIn?: boolean; checkedInAt?: string; error?: string };
      if (!response.ok || !data.checkedIn || !data.checkedInAt) {
        setMessage(data.error ?? 'This appointment could not be checked in. Please see the front desk.');
        setIsSaving(false);
        return;
      }
      syncAppointmentCheckIn(appointment.id, data.checkedInAt);
      setStep('success');
      window.setTimeout(resetKiosk, 2500);
    } catch {
      setIsSaving(false);
      setMessage('Check-in is temporarily unavailable. Please see the front desk.');
    }
  };

  return (
    <main className="min-h-dvh [overflow-wrap:anywhere] bg-[#f6f5f1] px-5 py-6 text-[#192738] sm:px-10 sm:py-10">
      <div className="mx-auto flex min-h-[calc(100dvh-3rem)] max-w-5xl flex-col">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[#dce1e8] pb-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#617089]">Aven Clinic · self-service</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Patient check-in</h1>
          </div>
          <button onClick={() => window.location.assign('/')} className="rounded-lg px-4 py-3 text-sm font-semibold text-[#3158d8] hover:bg-white/70">
            Exit kiosk
          </button>
        </header>

        <section className="flex flex-1 flex-col justify-center py-8">
          {step === 'start' && (
            <>
              <div className="max-w-2xl">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#617089]">Welcome</p>
                <h2 className="mt-3 text-4xl font-semibold leading-tight sm:text-6xl">Let&apos;s get you checked in.</h2>
                <p className="mt-5 max-w-xl text-lg leading-8 text-[#657184]">Choose how to find your appointment. Looking up your appointment will not check you in.</p>
              </div>
              <div className="mt-10 grid gap-4 sm:grid-cols-2">
                {demoVerificationEnabled && <button onClick={() => { setDemoFlow(true); showPhoneLookup(); }} className="min-h-28 rounded-2xl border-2 border-amber-300 bg-amber-50 p-6 text-left"><span className="block text-xl font-semibold">Try demo phone verification</span><span className="mt-2 block text-sm">Fictional patients only. Demo code is displayed locally; no SMS is sent.</span></button>}
                <button onClick={showPhoneLookup} className="min-h-36 rounded-2xl border-2 border-[#3158d8] bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                  <span className="text-3xl" aria-hidden="true">⌕</span>
                  <span className="mt-5 block text-xl font-semibold">Enter last four phone digits</span>
                  <span className="mt-2 block text-sm text-[#657184]">Use the phone number on your patient record.</span>
                </button>
                <button onClick={() => setStep('scan')} className="min-h-36 rounded-2xl border-2 border-[#dce1e8] bg-white/65 p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                  <span className="text-3xl" aria-hidden="true">▣</span>
                  <span className="mt-5 block text-xl font-semibold">Scan clinic membership ID</span>
                  <span className="mt-2 block text-sm text-[#657184]">{demoVerificationEnabled ? 'Test a fictional card token. Physical NFC reader setup is pending.' : 'This scanner is unavailable; please see the front desk.'}</span>
                </button>
                <button onClick={() => setMessage('Please bring your appointment details to the front desk for assistance.')} className="min-h-28 rounded-2xl border border-[#dce1e8] bg-transparent p-5 text-left hover:bg-white/50">
                  <span className="block text-lg font-semibold">Need front desk assistance?</span>
                  <span className="mt-1 block text-sm text-[#657184]">A staff member can help you check in.</span>
                </button>
                <button onClick={() => window.location.assign('/')} className="min-h-28 rounded-2xl border border-[#dce1e8] bg-transparent p-5 text-left hover:bg-white/50">
                  <span className="block text-lg font-semibold">Return to clinic website</span>
                  <span className="mt-1 block text-sm text-[#657184]">Leave the self-service kiosk.</span>
                </button>
              </div>
              {message && <p className="mt-5 rounded-xl border border-[#d8b98e] bg-[#fff8ed] p-4 text-sm text-[#79582e]">{message}</p>}
            </>
          )}

          {step === 'phone' && (
            <div className="mx-auto w-full max-w-xl rounded-3xl bg-white p-5 shadow-sm sm:p-10">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#617089]">Step 1 of 2</p>
              <h2 className="mt-3 text-3xl font-semibold">Verify your phone number</h2>
              <p className="mt-3 text-[#657184]">Enter the last four digits of the phone number on your patient record.</p>
              <label className="mt-8 block text-sm font-semibold" htmlFor="last-four">Last four digits</label>
              <input id="last-four" autoFocus inputMode="numeric" maxLength={4} value={lastFour} onChange={(event) => setLastFour(event.target.value.replace(/\D/g, ''))} className="mt-2 h-16 w-full rounded-xl border-2 border-[#dce1e8] px-5 text-center text-3xl tracking-[0.5em] outline-none focus:border-[#3158d8]" />
              {demoFlow && <p className="mt-3 text-sm text-amber-900">Development demo: use the fictional phone number provided by Run demo setup.</p>}
              {needsFullPhone && <label className="mt-4 block text-sm font-semibold">Full phone number<input className="mt-2 min-h-14 w-full rounded-xl border-2 border-[#dce1e8] px-4 text-lg" inputMode="tel" value={fullPhone} onChange={(event) => setFullPhone(event.target.value)} maxLength={20} /></label>}
              {message && <p className="mt-4 rounded-xl border border-[#e0b7ad] bg-[#fff5f2] p-4 text-sm text-[#8a4437]">{message}</p>}
              <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                <button onClick={resetKiosk} className="rounded-xl px-5 py-4 font-semibold text-[#3158d8] hover:bg-[#f6f5f1]">Cancel</button>
                <button disabled={isSaving} onClick={findTodaysAppointment} className="rounded-xl bg-[#3158d8] px-7 py-4 font-semibold text-white hover:bg-[#2649bb] disabled:cursor-wait disabled:opacity-60">{isSaving ? 'Searching...' : 'Find my appointment'}</button>
              </div>
            </div>
          )}

          {step === 'code' && <div className="mx-auto w-full max-w-xl rounded-3xl bg-white p-5 shadow-sm sm:p-10">
            <h2 className="text-3xl font-semibold">Enter your demo verification code</h2>
            <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm leading-7">Fictional demo only. No SMS was sent. Your demo code is <strong data-testid="demo-kiosk-code">{demoCode}</strong>. It expires in five minutes and can be used once.</p>
            <label className="mt-5 block font-semibold">Six-digit demo code<input className="mt-2 min-h-16 w-full rounded-xl border-2 border-[#dce1e8] px-4 text-center text-2xl tracking-widest" autoComplete="one-time-code" inputMode="numeric" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} /></label>
            {message && <p className="mt-4 text-sm text-rose-700" role="alert">{message}</p>}
            <div className="mt-6 flex flex-wrap gap-3"><button className="min-h-12 rounded-xl px-5 font-semibold text-[#3158d8]" onClick={resetKiosk}>Cancel</button><button className="min-h-12 rounded-xl bg-[#3158d8] px-5 font-semibold text-white disabled:opacity-50" disabled={isSaving || code.length !== 6} onClick={() => void verifyCode()}>{isSaving ? 'Verifying…' : 'Verify demo code'}</button></div>
          </div>}

          {step === 'scan' && (
            <div className="mx-auto w-full max-w-xl rounded-3xl bg-white p-5 shadow-sm sm:p-10">
              {demoVerificationEnabled ? <>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#617089]">Development card demo</p>
                <h2 className="mt-3 text-3xl font-semibold">Try a fictional membership card</h2>
                <p className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">Demo ACR1252U reader connected · NTAG213 simulation</p>
                <button className="mt-4 min-h-12 rounded-xl bg-[#3158d8] px-5 font-semibold text-white disabled:opacity-50" disabled={isSaving} onClick={() => void readDemoCard(true)}>{isSaving ? 'Reading simulated tag…' : 'Simulate NTAG213 tap'}</button>
                <p className="mt-4 text-sm leading-7 text-[#657184]">Paste the fictional card token from Run demo setup, then press Enter. This tests appointment lookup and check-in. It does not read an ACR1252U NFC device; that needs a local reader bridge.</p>
                <form className="mt-5 space-y-4" onSubmit={(event) => { event.preventDefault(); void readDemoCard(); }}>
                  <label className="block text-sm font-semibold">Demo membership card token<input className="mt-2 min-h-14 w-full rounded-xl border-2 border-[#dce1e8] px-4 text-base" autoFocus autoComplete="off" maxLength={128} value={cardToken} onChange={(event) => setCardToken(event.target.value)} /></label>
                  <button className="min-h-12 rounded-xl bg-[#3158d8] px-5 font-semibold text-white disabled:opacity-50" disabled={isSaving || !cardToken.trim()}>{isSaving ? 'Finding appointment…' : 'Find demo card appointment'}</button>
                </form>
                {message && <p role="alert" className="mt-4 text-sm text-rose-700">{message}</p>}
              </> : <>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#617089]">Scanner unavailable</p>
              <h2 className="mt-3 text-3xl font-semibold">Please see the front desk</h2>
              <p className="mt-4 leading-7 text-[#657184]">This kiosk does not have a connected membership-ID scanner or verification service. We have not scanned or checked in anyone. A staff member can verify your membership ID at the front desk.</p>
              </>}
              <button onClick={resetKiosk} className="mt-8 w-full rounded-xl bg-[#3158d8] px-6 py-4 font-semibold text-white hover:bg-[#2649bb]">Return to start</button>
            </div>
          )}

          {step === 'confirm' && patient && appointment && (
            <div className="mx-auto w-full max-w-2xl rounded-3xl bg-white p-5 shadow-sm sm:p-10">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#617089]">Appointment found</p>
              <h2 className="mt-3 text-3xl font-semibold">Please confirm your check-in</h2>
              <div className="mt-8 grid min-w-0 grid-cols-1 gap-4 rounded-2xl bg-[#f6f5f1] p-6 sm:grid-cols-2">
                <div><p className="text-sm text-[#657184]">Patient</p><p className="mt-1 text-xl font-semibold">{patient.name}</p></div>
                <div><p className="text-sm text-[#657184]">Patient ID</p><p className="mt-1 text-xl font-semibold">{patient.id}</p></div>
                <div><p className="text-sm text-[#657184]">Appointment time</p><p className="mt-1 text-xl font-semibold">{appointment.time}</p></div>
                <div><p className="text-sm text-[#657184]">Practitioner</p><p className="mt-1 text-xl font-semibold">{practitionerLabel(appointment.practitioner)}</p></div>
              </div>
              {message && <p className="mt-4 rounded-xl border border-[#e0b7ad] bg-[#fff5f2] p-4 text-sm text-[#8a4437]">{message}</p>}
              <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button onClick={resetKiosk} className="rounded-xl px-5 py-4 font-semibold text-[#3158d8] hover:bg-[#f6f5f1]">Cancel</button>
                <button disabled={isSaving} onClick={confirmCheckIn} className="rounded-xl bg-[#3158d8] px-7 py-4 font-semibold text-white hover:bg-[#2649bb] disabled:cursor-wait disabled:opacity-60">{isSaving ? 'Saving...' : 'Confirm Check-In'}</button>
              </div>
            </div>
          )}

          {step === 'success' && (
            <div className="mx-auto w-full max-w-xl rounded-3xl bg-white p-5 text-center sm:p-10 shadow-sm">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#e9edff] text-3xl text-[#3158d8]" aria-hidden="true">✓</div>
              <h2 className="mt-6 text-3xl font-semibold">Check-in successful</h2>
              <p className="mt-3 text-[#657184]">Your check-in has been recorded. This kiosk will reset for the next patient.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
