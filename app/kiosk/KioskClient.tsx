'use client';

import { useState } from 'react';
import { useBooking } from '@/app/context/BookingContext';

type KioskStep = 'start' | 'phone' | 'scan' | 'confirm' | 'success';

type KioskPatient = { id: string; name: string };
type KioskAppointment = { id: string; date: string; time: string; practitioner: string };

type KioskLookupResponse = {
  patient?: KioskPatient;
  appointment?: KioskAppointment;
  checkInToken?: string;
  error?: string;
};

export default function KioskClient() {
  const { syncAppointmentCheckIn } = useBooking();
  const [step, setStep] = useState<KioskStep>('start');
  const [lastFour, setLastFour] = useState('');
  const [patient, setPatient] = useState<KioskPatient | null>(null);
  const [appointment, setAppointment] = useState<KioskAppointment | null>(null);
  const [checkInToken, setCheckInToken] = useState('');
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const resetKiosk = () => {
    setStep('start');
    setLastFour('');
    setPatient(null);
    setAppointment(null);
    setCheckInToken('');
    setMessage('');
    setIsSaving(false);
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
    <main className="min-h-dvh [overflow-wrap:anywhere] bg-[#f4f1e8] px-5 py-6 text-[#24352a] sm:px-10 sm:py-10">
      <div className="mx-auto flex min-h-[calc(100dvh-3rem)] max-w-5xl flex-col">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[#cbd4c2] pb-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#6c7f59]">Clinic self-service</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Patient check-in</h1>
          </div>
          <button onClick={() => window.location.assign('/')} className="rounded-lg px-4 py-3 text-sm font-semibold text-[#53684a] hover:bg-white/70">
            Exit kiosk
          </button>
        </header>

        <section className="flex flex-1 flex-col justify-center py-8">
          {step === 'start' && (
            <>
              <div className="max-w-2xl">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8a6b45]">Welcome</p>
                <h2 className="mt-3 text-4xl font-semibold leading-tight sm:text-6xl">Let&apos;s get you checked in.</h2>
                <p className="mt-5 max-w-xl text-lg leading-8 text-[#56665a]">Choose how to find your appointment. Looking up your appointment will not check you in.</p>
              </div>
              <div className="mt-10 grid gap-4 sm:grid-cols-2">
                <button onClick={showPhoneLookup} className="min-h-36 rounded-2xl border-2 border-[#718965] bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                  <span className="text-3xl" aria-hidden="true">⌕</span>
                  <span className="mt-5 block text-xl font-semibold">Enter last four phone digits</span>
                  <span className="mt-2 block text-sm text-[#69766d]">Use the phone number on your patient record.</span>
                </button>
                <button onClick={() => setStep('scan')} className="min-h-36 rounded-2xl border-2 border-[#d0c5b3] bg-white/65 p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                  <span className="text-3xl" aria-hidden="true">▣</span>
                  <span className="mt-5 block text-xl font-semibold">Scan clinic membership ID</span>
                  <span className="mt-2 block text-sm text-[#69766d]">This scanner is unavailable; please see the front desk.</span>
                </button>
                <button onClick={() => setMessage('Please bring your appointment details to the front desk for assistance.')} className="min-h-28 rounded-2xl border border-[#d0c5b3] bg-transparent p-5 text-left hover:bg-white/50">
                  <span className="block text-lg font-semibold">Need front desk assistance?</span>
                  <span className="mt-1 block text-sm text-[#69766d]">A staff member can help you check in.</span>
                </button>
                <button onClick={() => window.location.assign('/')} className="min-h-28 rounded-2xl border border-[#d0c5b3] bg-transparent p-5 text-left hover:bg-white/50">
                  <span className="block text-lg font-semibold">Return to clinic website</span>
                  <span className="mt-1 block text-sm text-[#69766d]">Leave the self-service kiosk.</span>
                </button>
              </div>
              {message && <p className="mt-5 rounded-xl border border-[#d8b98e] bg-[#fff8ed] p-4 text-sm text-[#79582e]">{message}</p>}
            </>
          )}

          {step === 'phone' && (
            <div className="mx-auto w-full max-w-xl rounded-3xl bg-white p-5 shadow-sm sm:p-10">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8a6b45]">Step 1 of 2</p>
              <h2 className="mt-3 text-3xl font-semibold">Verify your phone number</h2>
              <p className="mt-3 text-[#69766d]">Enter the last four digits of the phone number on your patient record.</p>
              <label className="mt-8 block text-sm font-semibold" htmlFor="last-four">Last four digits</label>
              <input id="last-four" autoFocus inputMode="numeric" maxLength={4} value={lastFour} onChange={(event) => setLastFour(event.target.value.replace(/\D/g, ''))} className="mt-2 h-16 w-full rounded-xl border-2 border-[#cbd4c2] px-5 text-center text-3xl tracking-[0.5em] outline-none focus:border-[#718965]" />
              {message && <p className="mt-4 rounded-xl border border-[#e0b7ad] bg-[#fff5f2] p-4 text-sm text-[#8a4437]">{message}</p>}
              <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                <button onClick={resetKiosk} className="rounded-xl px-5 py-4 font-semibold text-[#53684a] hover:bg-[#f4f1e8]">Cancel</button>
                <button disabled={isSaving} onClick={findTodaysAppointment} className="rounded-xl bg-[#53684a] px-7 py-4 font-semibold text-white hover:bg-[#405437] disabled:cursor-wait disabled:opacity-60">{isSaving ? 'Searching...' : 'Find my appointment'}</button>
              </div>
            </div>
          )}

          {step === 'scan' && (
            <div className="mx-auto w-full max-w-xl rounded-3xl bg-white p-5 shadow-sm sm:p-10">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8a6b45]">Scanner unavailable</p>
              <h2 className="mt-3 text-3xl font-semibold">Please see the front desk</h2>
              <p className="mt-4 leading-7 text-[#69766d]">This kiosk does not have a connected membership-ID scanner or verification service. We have not scanned or checked in anyone. A staff member can verify your membership ID at the front desk.</p>
              <button onClick={resetKiosk} className="mt-8 w-full rounded-xl bg-[#53684a] px-6 py-4 font-semibold text-white hover:bg-[#405437]">Return to start</button>
            </div>
          )}

          {step === 'confirm' && patient && appointment && (
            <div className="mx-auto w-full max-w-2xl rounded-3xl bg-white p-5 shadow-sm sm:p-10">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8a6b45]">Appointment found</p>
              <h2 className="mt-3 text-3xl font-semibold">Please confirm your check-in</h2>
              <div className="mt-8 grid min-w-0 grid-cols-1 gap-4 rounded-2xl bg-[#f4f1e8] p-6 sm:grid-cols-2">
                <div><p className="text-sm text-[#69766d]">Patient</p><p className="mt-1 text-xl font-semibold">{patient.name}</p></div>
                <div><p className="text-sm text-[#69766d]">Patient ID</p><p className="mt-1 text-xl font-semibold">{patient.id}</p></div>
                <div><p className="text-sm text-[#69766d]">Appointment time</p><p className="mt-1 text-xl font-semibold">{appointment.time}</p></div>
                <div><p className="text-sm text-[#69766d]">Practitioner</p><p className="mt-1 text-xl font-semibold">{appointment.practitioner}</p></div>
              </div>
              {message && <p className="mt-4 rounded-xl border border-[#e0b7ad] bg-[#fff5f2] p-4 text-sm text-[#8a4437]">{message}</p>}
              <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button onClick={resetKiosk} className="rounded-xl px-5 py-4 font-semibold text-[#53684a] hover:bg-[#f4f1e8]">Cancel</button>
                <button disabled={isSaving} onClick={confirmCheckIn} className="rounded-xl bg-[#53684a] px-7 py-4 font-semibold text-white hover:bg-[#405437] disabled:cursor-wait disabled:opacity-60">{isSaving ? 'Saving...' : 'Confirm Check-In'}</button>
              </div>
            </div>
          )}

          {step === 'success' && (
            <div className="mx-auto w-full max-w-xl rounded-3xl bg-white p-5 text-center sm:p-10 shadow-sm">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#dce8d4] text-3xl text-[#53684a]" aria-hidden="true">✓</div>
              <h2 className="mt-6 text-3xl font-semibold">Check-in successful</h2>
              <p className="mt-3 text-[#69766d]">Your check-in has been recorded. This kiosk will reset for the next patient.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}