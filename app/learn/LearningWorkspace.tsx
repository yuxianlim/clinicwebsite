'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { loadStripe } from '@stripe/stripe-js/pure';
import { CardElement, Elements, useElements, useStripe } from '@stripe/react-stripe-js';
import { learningOrganizer, type LearningAccount, type LearningCourseState } from '@/app/lib/learningPolicy';

const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
const field = 'min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900';
const button = 'min-h-12 rounded-xl bg-[#3158d8] px-5 py-3 font-semibold text-white disabled:opacity-50';
const panel = 'rounded-2xl border border-[#dce1e8] bg-white p-5 sm:p-8';
const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';
const stripePromise = publishableKey.startsWith('pk_test_') ? loadStripe(publishableKey) : null;
async function send(body: Record<string, unknown>) {
  const response = await fetch('/api/learning', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Request could not be completed.');
  return data;
}
const message = (error: unknown) => error instanceof Error ? error.message : 'Please try again.';

function SandboxPayment({ course, refresh }: { course: LearningCourseState; refresh: () => Promise<LearningAccount | null> }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  async function pay(event: FormEvent) {
    event.preventDefault();
    if (!stripe || !elements?.getElement(CardElement)) return;
    setBusy(true); setStatus('Starting sandbox payment…');
    try {
      const setup = await send({ action: 'purchase', courseId: course.id });
      const result = await stripe.confirmCardPayment(setup.clientSecret, { payment_method: { card: elements.getElement(CardElement)! } });
      if (result.error) throw new Error(result.error.message ?? 'The sandbox card could not be confirmed.');
      setStatus('Waiting for the signed Stripe webhook. Keep your listener running; do not submit another purchase.');
      const deadline = Date.now() + 30_000;
      while (Date.now() < deadline) {
        const account = await refresh();
        if (account?.courses.some((item) => item.id === course.id && item.paid && item.purchaseId === setup.purchaseId)) {
          setStatus('Sandbox payment verified. Your course is unlocked.'); return;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
      }
      setStatus('Payment verification is pending. Check the Stripe listener, then use Refresh account. Retrying this course resumes the same pending payment.');
    } catch (error) { setStatus(message(error)); }
    finally { setBusy(false); }
  }
  return <form onSubmit={pay} className="mt-5 space-y-4 rounded-xl bg-[#eef1fb] p-5">
    <h3 className="font-semibold">Stripe sandbox checkout</h3>
    <p className="text-sm leading-6">Test card: 4242 4242 4242 4242, a future expiration date, and any three-digit CVC. No real money is collected.</p>
    <div className="rounded-lg border border-slate-300 bg-white p-4"><CardElement options={{ hidePostalCode: true }} /></div>
    <button className={button} disabled={busy || !stripe}>{busy ? 'Confirming…' : `Pay ${money(course.nextPrice)} in sandbox`}</button>
    {status && <p role="status" className="text-sm leading-6">{status}</p>}
  </form>;
}

function Lesson({ course, lesson, refresh }: { course: LearningCourseState; lesson: LearningCourseState['lessons'][number]; refresh: () => Promise<LearningAccount | null> }) {
  const [watched, setWatched] = useState(course.watched[lesson.id] ?? 0);
  const [error, setError] = useState('');
  const player = useRef<HTMLVideoElement>(null);
  const lastSent = useRef(0);
  const queue = useRef(Promise.resolve());
  const push = (ended = false) => {
    const video = player.current;
    if (!video || course.certificateId || (!ended && (video.paused || Date.now() - lastSent.current < 1200))) return;
    lastSent.current = Date.now();
    const position = Math.min(video.currentTime, lesson.seconds);
    queue.current = queue.current.then(async () => {
      try {
        const result = await send({ action: 'watch', courseId: course.id, lessonId: lesson.id, position });
        setWatched(result.watched); setError('');
        if (result.watched >= lesson.seconds) await refresh();
      } catch (reason) { setError(message(reason)); }
    });
  };
  return <article className="space-y-3 rounded-xl border border-slate-200 p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{lesson.title}</h3><span className="text-sm">{Math.min(100, Math.floor(watched / lesson.seconds * 100))}% watched</span></div>
    <video ref={player} className="aspect-video w-full rounded-lg bg-[#192738]" controls playsInline preload="metadata" aria-label={lesson.title}
      src={`/api/learning/media?${new URLSearchParams({ course: course.id, lesson: lesson.id })}`}
      onPlay={() => { if (course.certificateId) return; queue.current = queue.current.then(async () => {
        try {
          const result = await send({ action: 'watch-start', courseId: course.id, lessonId: lesson.id });
          setWatched(result.watched);
          if (player.current && player.current.currentTime > result.watched + 0.5) player.current.currentTime = result.watched;
        } catch (reason) { setError(message(reason)); }
      }); }}
      onSeeking={() => { if (player.current && player.current.currentTime > watched + 0.5) player.current.currentTime = watched; }}
      onTimeUpdate={() => push()} onEnded={() => push(true)} />
    <p className="text-sm text-slate-600">Silent demo video · {lesson.seconds} seconds · Seeking ahead does not count toward completion.</p>
    <details><summary className="cursor-pointer text-sm font-semibold">Read lesson transcript</summary><p className="mt-2 text-sm leading-7 text-slate-600">{lesson.transcript}</p></details>
    {error && <p role="alert" className="text-sm text-rose-700">{error} Pause and play to resume from your saved position.</p>}
  </article>;
}

function FinalExam({ course, refresh }: { course: LearningCourseState; refresh: () => Promise<LearningAccount | null> }) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(false);
  const requestId = useRef<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    requestId.current ??= crypto.randomUUID();
    try {
      const data = await send({ action: 'exam', courseId: course.id, requestId: requestId.current, answers: course.questions.map((_, index) => answers[index]) });
      setResult(`${data.score}% — ${data.score >= 90 ? 'Passed. Your demo certificate is ready.' : 'Below the 90% passing score. This attempt has been recorded.'}`);
      requestId.current = null; setAnswers({}); await refresh();
    } catch (error) { setResult(message(error)); }
    finally { setBusy(false); }
  }
  const complete = course.lessons.every((lesson) => course.watched[lesson.id] >= lesson.seconds);
  return <section className={panel}>
    <h2 className="text-2xl font-semibold">Final course exam</h2>
    <p className="mt-2 text-sm leading-7">Passing score: 90% · {Math.max(0, 3 - course.attemptsUsed)} attempts left in this block.</p>
    {!complete ? <p className="mt-4 text-slate-600">Watch 100% of both required videos to unlock the exam.</p> :
      <form onSubmit={submit} className="mt-6 space-y-6">
        {course.questions.map((question, index) => <fieldset key={index} className="space-y-2"><legend className="mb-2 font-medium">{index + 1}. {question.prompt}</legend>
          {question.options.map((option, choice) => <label key={choice} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2"><input type="radio" name={`question-${index}`} required checked={answers[index] === choice} onChange={() => { if (!requestId.current) setAnswers((previous) => ({ ...previous, [index]: choice })); }} /><span>{option}</span></label>)}
        </fieldset>)}
        <button className={button} disabled={busy || Object.keys(answers).length !== course.questions.length}>{busy ? 'Grading…' : 'Submit final exam'}</button>
      </form>}
    {result && <p className="mt-4 rounded-xl bg-[#eef1fb] p-4" role="status">{result}</p>}
  </section>;
}

export default function LearningWorkspace() {
  const [account, setAccount] = useState<LearningAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [checkout, setCheckout] = useState(false);
  const detail = useRef<HTMLElement>(null);
  const refresh = useCallback(async () => {
    const response = await fetch('/api/learning', { cache: 'no-store' });
    const data = await response.json();
    if (response.ok) { setAccount(data); setError(''); return data as LearningAccount; }
    setAccount(null); if (response.status !== 401) setError(data.error ?? 'Learning is unavailable.');
    return null;
  }, []);
  useEffect(() => { void refresh().catch(() => setError('Learning is temporarily unavailable.')).finally(() => setLoading(false)); }, [refresh]);
  useEffect(() => {
    if (selected) {
      detail.current?.focus({ preventScroll: true });
      detail.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [selected]);
  const course = account?.courses.find((item) => item.id === selected);
  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const form = new FormData(event.currentTarget);
    try { await send({ action: register ? 'register' : 'signin', name: form.get('name'), email: form.get('email'), password: form.get('password') }); await refresh(); }
    catch (reason) { setError(message(reason)); }
    finally { setBusy(false); }
  }
  return <main className="min-h-screen bg-[#f6f5f1] text-[#192738]">
    <header className="border-b border-[#dce1e8] bg-white px-5 py-5 sm:px-8"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
      <Link href="/" className="text-sm font-semibold text-[#3158d8]">← Aven Clinic</Link><span className="text-sm font-medium">{learningOrganizer}</span>
      {account && <button className="min-h-11 text-sm font-semibold" onClick={async () => { try { await send({ action: 'signout' }); setAccount(null); setSelected(null); setRegister(false); } catch (reason) { setError(message(reason)); } }}>Sign out</button>}
    </div></header>
    <div className="mx-auto max-w-6xl space-y-8 px-5 py-10 sm:px-8 sm:py-16">
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-950"><strong>Development demo.</strong> Fictional courses, sandbox payments and sample completion documents. No approved CAB/NCBAHM credit is offered.</div>
      <div><p className="eyebrow">Your learning, in one place</p><h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">A little curiosity. A new perspective.</h1><p className="mt-5 max-w-2xl leading-8 text-slate-600">{account ? `Welcome, ${account.user.name}. Continue a course or explore your learning records.` : 'Create an account or sign in to view the demo course catalogue.'}</p></div>
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-rose-800">{error}</p>}
      {loading ? <p role="status">Loading your workspace…</p> : !account ? <section className={`${panel} max-w-xl`}>
        <h2 className="text-2xl font-semibold">{register ? 'Create your learner account' : 'Welcome back'}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">Use fictional details and a unique test password. Email verification and password recovery are pending production setup.</p>
        <form onSubmit={authenticate} className="mt-6 space-y-4">
          {register && <label className="block space-y-2"><span>Full name</span><input className={field} name="name" autoComplete="name" required maxLength={100} /></label>}
          <label className="block space-y-2"><span>Email</span><input className={field} name="email" type="email" autoComplete="email" required maxLength={254} /></label>
          <label className="block space-y-2"><span>Password</span><input className={field} name="password" type="password" autoComplete={register ? 'new-password' : 'current-password'} required minLength={12} maxLength={128} /></label>
          <button className={button} disabled={busy}>{busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}</button>
        </form>
        <button className="mt-5 min-h-11 text-sm font-semibold text-[#3158d8]" onClick={() => { setRegister(!register); setError(''); }}>{register ? 'Already registered? Sign in' : 'New here? Create an account'}</button>
      </section> : <>
        <div className="flex flex-wrap items-center justify-between gap-4"><h2 className="text-2xl font-semibold">Your courses</h2><button className="min-h-11 text-sm font-semibold text-[#3158d8]" onClick={() => void refresh().catch(() => setError('Could not refresh your account.'))}>Refresh account</button></div>
        <div className="grid gap-5 md:grid-cols-3">{account.courses.map((item, index) => <article key={item.id} className={`${panel} flex flex-col`}>
          <span className="text-sm text-[#3158d8]">DEMO / 0{index + 1}</span><h3 className="mt-4 text-xl font-semibold">{item.title}</h3><p className="my-4 text-sm leading-7 text-slate-600">{item.description}</p>
          <p className="mt-auto text-sm">Original sandbox price: {money(item.price)} · No CE credit</p>
          <button className={`${button} mt-5`} onClick={() => { setSelected(item.id); setCheckout(false); if (selected === item.id) detail.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>{item.certificateId ? 'View completion' : item.paid && item.attemptsUsed < 3 ? 'Continue course' : 'View course'}</button>
        </article>)}</div>
        {course && <section ref={detail} tabIndex={-1} className="scroll-mt-6 space-y-6" aria-label="Selected course">
          <div className={panel}><p className="eyebrow">Demo course / Attempt block {course.block}</p><h2 className="mt-3 text-3xl font-semibold">{course.title}</h2>
            <p className="mt-4 text-sm leading-7 text-slate-600">Watch every required video. Pass one final exam at 90% or above, with three attempts per paid block. After all three fail, wait seven days. The second block costs 50% of your original price; each later block costs 100%. Every repurchase resets video progress.</p>
            {course.fixture && <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm">Generated fixture records: no Stripe payment or human video attendance is claimed. This account is for fictional demo data only.</p>}
            {course.lastScore !== null && <p className="mt-4 text-sm">Most recent final-exam score: <strong>{course.lastScore}%</strong> · {course.attemptsUsed} of 3 attempts used in this block.</p>}
            {course.certificateId ? <div className="mt-5 space-y-3"><p className="font-semibold">Completed — your demo certificate is ready.</p><a className="inline-flex min-h-12 items-center rounded-xl bg-[#3158d8] px-5 py-3 font-semibold text-white" href={`/api/learning/document?kind=certificate&id=${course.certificateId}`}>Download demo certificate</a><p className="text-sm text-slate-600">Opens as an HTML document you can print or save as PDF. No approved CE credit.</p></div> : course.retryAt ?
              <p className="mt-5 rounded-xl bg-amber-50 p-4" role="status">Three attempts used. Repurchasing becomes available on {new Date(course.retryAt).toLocaleString()}. Your next block costs {money(course.nextPrice)}.</p> : (!course.paid || course.attemptsUsed >= 3) ? <>
                <p className="mt-5">{course.attemptsUsed >= 3 ? 'Next attempt block' : 'Course access'}: <strong>{money(course.nextPrice)} USD sandbox</strong></p>
                <button className={`${button} mt-4`} onClick={() => setCheckout(true)}>Open sandbox checkout</button>
                {checkout && (stripePromise ? <Elements stripe={stripePromise}><SandboxPayment course={course} refresh={refresh} /></Elements> : <p className="mt-4" role="status">Configure matching Stripe sandbox keys to test course purchases.</p>)}
              </> : <p className="mt-5 font-semibold text-[#3158d8]">{course.fixture ? 'Fictional purchase fixture · Course unlocked' : 'Sandbox purchase verified · Course unlocked'}</p>}
          </div>
          {course.paid && (course.attemptsUsed < 3 || course.certificateId) && <>
            <div className={`${panel} grid gap-6 lg:grid-cols-2`}>{course.lessons.map((lesson) => <Lesson key={`${course.purchaseId}-${lesson.id}`} course={course} lesson={lesson} refresh={refresh} />)}</div>
            {!course.certificateId && <FinalExam key={course.purchaseId} course={course} refresh={refresh} />}
          </>}
        </section>}
        <section className={panel}><h2 className="text-2xl font-semibold">Payment history &amp; billing details</h2><p className="mt-3 text-sm leading-7 text-slate-600">Account: {account.user.name} · {account.user.email}<br />Organizer: {learningOrganizer}<br />USD sandbox and fictional fixture receipts. Tax invoices and automatic refunds await the approved billing policy. Card details stay with Stripe.</p>
          {account.payments.length ? <ul className="mt-6 divide-y divide-slate-200">{account.payments.map((payment) => <li key={payment.id} className="flex flex-wrap items-center justify-between gap-4 py-5"><div><p className="font-medium">{payment.courseTitle}</p><p className="mt-1 text-sm text-slate-600">Block {payment.block} · {money(payment.amount)} · {payment.fixture ? 'Fictional purchase fixture' : payment.paidAt ? 'Verified sandbox payment' : 'Pending signed payment verification'}</p></div>{payment.paidAt && <a className="min-h-11 py-3 text-sm font-semibold text-[#3158d8]" href={`/api/learning/document?kind=receipt&id=${payment.id}`}>{payment.fixture ? 'Download fictional receipt' : 'Download sandbox receipt'}</a>}</li>)}</ul> : <p className="mt-6 text-slate-600">No course purchases yet.</p>}
        </section>
      </>}
    </div>
  </main>;
}
