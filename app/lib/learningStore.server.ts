import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { learningDatabase, appendLearningAudit } from './auditStore.server';
import { demoCourses, demoAnswerKey } from './demoCourses.server';
import { attemptsPerBlock, learningBlockPrice, passingPercent, retryWaitMs, type LearningAccount } from './learningPolicy';
import { fictionalWorkflowEnabled } from './deploymentMode';

export const learningDemoEnabled = () => fictionalWorkflowEnabled(process.env.ENABLE_DEVELOPMENT_CEU_DEMO);
export class LearningError extends Error {}
const fail = (message: string): never => { throw new LearningError(message); };
type User = { id: string; name: string; email: string; password: string };
type Purchase = { id: string; user_id: string; course_id: string; block: number; original_price: number; amount: number; intent_id: string | null; paid_at: string | null };
type Attempt = { score: number; occurred_at: number };
const sessionGlobal = globalThis as typeof globalThis & { learningSessionSecret?: string };
const sessionDigest = (token: string) => createHash('sha256').update(`${token}:${process.env.CLINIC_SESSION_SECRET || (sessionGlobal.learningSessionSecret ??= randomBytes(32).toString('hex'))}`).digest('hex');
export const learnerCookie = 'ceu_learner_session';

const db = () => {
  const database = learningDatabase();
  database.exec(`
    CREATE TABLE IF NOT EXISTS learning_users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS learning_sessions (digest TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES learning_users(id), expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS learning_purchases (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES learning_users(id), course_id TEXT NOT NULL,
      block INTEGER NOT NULL, original_price INTEGER NOT NULL, amount INTEGER NOT NULL,
      intent_id TEXT UNIQUE, paid_at TEXT, UNIQUE(user_id, course_id, block));
    CREATE TABLE IF NOT EXISTS learning_watch (
      purchase_id TEXT NOT NULL REFERENCES learning_purchases(id), lesson_id TEXT NOT NULL,
      watched REAL NOT NULL DEFAULT 0, heartbeat INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(purchase_id, lesson_id));
    CREATE TABLE IF NOT EXISTS learning_attempts (
      request_id TEXT PRIMARY KEY, purchase_id TEXT NOT NULL REFERENCES learning_purchases(id),
      score INTEGER NOT NULL, occurred_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS learning_certificates (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES learning_users(id), course_id TEXT NOT NULL,
      purchase_id TEXT NOT NULL REFERENCES learning_purchases(id), issued_at TEXT NOT NULL, learner_name TEXT NOT NULL,
      UNIQUE(user_id, course_id));
    CREATE TABLE IF NOT EXISTS learning_stripe_events (id TEXT PRIMARY KEY, purchase_id TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS learning_fixture_purchases (purchase_id TEXT PRIMARY KEY REFERENCES learning_purchases(id));
    CREATE TABLE IF NOT EXISTS learning_fixture_runs (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES learning_users(id));
  `);
  return database;
};
const atomic = <T>(work: () => T): T => {
  const database = db();
  database.exec('BEGIN IMMEDIATE');
  try { const result = work(); database.exec('COMMIT'); return result; }
  catch (error) { database.exec('ROLLBACK'); throw error; }
};
const courseById = (id: string) => demoCourses.find((course) => course.id === id) ?? fail('Choose a demo course.');
const latest = (userId: string, courseId: string) => db().prepare('SELECT * FROM learning_purchases WHERE user_id = ? AND course_id = ? ORDER BY block DESC LIMIT 1').get(userId, courseId) as Purchase | undefined;
const attempts = (purchaseId: string) => db().prepare('SELECT score, occurred_at FROM learning_attempts WHERE purchase_id = ? ORDER BY occurred_at').all(purchaseId) as Attempt[];
const certificate = (userId: string, courseId: string) => db().prepare('SELECT id FROM learning_certificates WHERE user_id = ? AND course_id = ?').get(userId, courseId) as { id: string } | undefined;
const watch = (purchaseId: string) => Object.fromEntries((db().prepare('SELECT lesson_id, watched FROM learning_watch WHERE purchase_id = ?').all(purchaseId) as { lesson_id: string; watched: number }[]).map((row) => [row.lesson_id, row.watched]));
const fixturePurchase = (id: string) => Boolean(db().prepare('SELECT 1 FROM learning_fixture_purchases WHERE purchase_id = ?').get(id));
const paidPurchase = (userId: string, courseId: string) => {
  const purchase = latest(userId, courseId);
  if (!purchase?.paid_at) return fail('A verified sandbox purchase is required before starting this course.');
  return purchase;
};

export const createLearner = (name: string, email: string, password: string) => {
  if (!name.trim() || name.length > 100 || /[\u0000-\u001f]/.test(name) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length < 12 || password.length > 128)
    return fail('Enter your name, a valid email and a password of 12–128 characters.');
  const salt = randomBytes(16).toString('hex');
  const user = { id: randomUUID(), name: name.trim(), email: email.trim().toLowerCase(), password: `${salt}:${scryptSync(password, salt, 64).toString('hex')}` };
  try { db().prepare('INSERT INTO learning_users VALUES (?, ?, ?, ?)').run(user.id, user.name, user.email, user.password); }
  catch { return fail('Account could not be created. If you already registered, sign in.'); }
  return user;
};
export const authenticateLearner = (email: string, password: string) => {
  if (password.length > 128) return fail('Email or password could not be verified.');
  const user = db().prepare('SELECT * FROM learning_users WHERE email = ?').get(email.trim().toLowerCase()) as User | undefined;
  const [salt, expected] = (user?.password ?? `${'0'.repeat(32)}:${'0'.repeat(128)}`).split(':');
  const supplied = scryptSync(password, salt, 64);
  if (!user || !timingSafeEqual(Buffer.from(expected, 'hex'), supplied)) return fail('Email or password could not be verified.');
  return user;
};
export const startLearnerSession = (userId: string, now = Date.now()) => {
  const token = randomBytes(32).toString('hex');
  db().prepare('DELETE FROM learning_sessions WHERE expires_at <= ?').run(now);
  db().prepare('INSERT INTO learning_sessions VALUES (?, ?, ?)').run(sessionDigest(token), userId, now + 8 * 60 * 60 * 1000);
  return token;
};
export const learnerFromToken = (token: string | undefined, now = Date.now()) => {
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const row = db().prepare(`SELECT u.id, u.name, u.email FROM learning_sessions s JOIN learning_users u ON u.id = s.user_id WHERE s.digest = ? AND s.expires_at > ?`).get(sessionDigest(token), now) as Pick<User, 'id' | 'name' | 'email'> | undefined;
  return row ?? null;
};
export const endLearnerSession = (token: string) => { db().prepare('DELETE FROM learning_sessions WHERE digest = ?').run(sessionDigest(token)); };

export const learningAccount = (user: Pick<User, 'id' | 'name' | 'email'>, now = Date.now()): LearningAccount => ({
  user: { id: user.id, name: user.name, email: user.email },
  courses: demoCourses.map((course) => {
    const purchase = latest(user.id, course.id);
    const results = purchase ? attempts(purchase.id) : [];
    const exhausted = results.length >= attemptsPerBlock && !results.some((result) => result.score >= passingPercent);
    const block = purchase?.block ?? 1;
    const retryAt = exhausted ? Math.max(...results.map((result) => result.occurred_at)) + retryWaitMs : null;
    return { ...course, lessons: course.lessons.map((lesson) => ({ ...lesson, transcript: purchase?.paid_at ? lesson.transcript : '' })),
      questions: purchase?.paid_at ? course.questions : [], block, nextPrice: purchase && exhausted ? learningBlockPrice(purchase.original_price, block + 1) : purchase?.amount ?? course.price,
      attemptsUsed: results.length, lastScore: results.at(-1)?.score ?? null, purchaseId: purchase?.id ?? null, paid: Boolean(purchase?.paid_at),
      watched: purchase ? watch(purchase.id) : {}, retryAt: retryAt && retryAt > now ? new Date(retryAt).toISOString() : null,
      certificateId: certificate(user.id, course.id)?.id ?? null, fixture: purchase ? fixturePurchase(purchase.id) : false };
  }),
  payments: (db().prepare('SELECT * FROM learning_purchases WHERE user_id = ? ORDER BY rowid DESC').all(user.id) as Purchase[]).map((row) => ({ id: row.id, courseTitle: courseById(row.course_id).title, block: row.block, amount: row.amount, paidAt: row.paid_at, fixture: fixturePurchase(row.id) })),
});

/** Reserve once, then use this ID as Stripe's idempotency key across network retries. */
export const reserveLearningPurchase = (userId: string, courseId: string, now = Date.now()) => atomic(() => {
  const course = courseById(courseId);
  if (certificate(userId, courseId)) return fail('You already completed this demo course.');
  const previous = latest(userId, courseId);
  if (previous && !previous.paid_at) return previous;
  if (previous) {
    const results = attempts(previous.id);
    if (results.length < attemptsPerBlock || results.some((result) => result.score >= passingPercent)) return fail('Your current attempt block is still available.');
    if (now < Math.max(...results.map((result) => result.occurred_at)) + retryWaitMs) return fail('Wait seven days after the third failed attempt before repurchasing.');
  }
  const block = (previous?.block ?? 0) + 1;
  const original = previous?.original_price ?? course.price;
  const id = randomUUID();
  db().prepare('INSERT INTO learning_purchases (id, user_id, course_id, block, original_price, amount) VALUES (?, ?, ?, ?, ?, ?)').run(id, userId, courseId, block, original, learningBlockPrice(original, block));
  return latest(userId, courseId)!;
});
export const linkLearningIntent = (purchaseId: string, intentId: string) => {
  const updated = db().prepare('UPDATE learning_purchases SET intent_id = ? WHERE id = ? AND (intent_id IS NULL OR intent_id = ?)').run(intentId, purchaseId, intentId);
  if (!updated.changes) return fail('The sandbox intent could not be linked to its purchase.');
};

/** Called only after Stripe signature verification; fixtures use disposable databases. */
export const acceptLearningPayment = (input: { purchaseId: string; intentId: string; eventId: string; amount: number; currency: string; livemode: boolean }, now = Date.now()) => atomic(() => {
  const purchase = db().prepare('SELECT * FROM learning_purchases WHERE id = ?').get(input.purchaseId) as Purchase | undefined;
  if (!purchase || fixturePurchase(purchase.id) || input.livemode || input.currency !== 'usd' || purchase.amount !== input.amount || purchase.intent_id !== input.intentId)
    return fail('The sandbox payment does not match its learning purchase.');
  if (db().prepare('SELECT 1 FROM learning_stripe_events WHERE id = ?').get(input.eventId)) return false;
  db().prepare('INSERT INTO learning_stripe_events VALUES (?, ?)').run(input.eventId, purchase.id);
  db().prepare('UPDATE learning_purchases SET paid_at = COALESCE(paid_at, ?) WHERE id = ?').run(new Date(now).toISOString(), purchase.id);
  appendLearningAudit('Demo course payment verified', purchase.id);
  return true;
});

export const recordLearningWatch = (userId: string, courseId: string, lessonId: string, position: number | null, now = Date.now()) => atomic(() => {
  const purchase = paidPurchase(userId, courseId);
  if (attempts(purchase.id).length >= attemptsPerBlock) return fail('This attempt block is closed.');
  const lesson = courseById(courseId).lessons.find((item) => item.id === lessonId) ?? fail('Unknown lesson.');
  db().prepare('INSERT OR IGNORE INTO learning_watch (purchase_id, lesson_id) VALUES (?, ?)').run(purchase.id, lesson.id);
  const previous = db().prepare('SELECT watched, heartbeat FROM learning_watch WHERE purchase_id = ? AND lesson_id = ?').get(purchase.id, lesson.id) as { watched: number; heartbeat: number };
  let watched = previous.watched;
  if (position !== null) {
    const elapsed = (now - previous.heartbeat) / 1000;
    if (!Number.isFinite(position) || position < 0 || position > lesson.seconds + 0.25 || !previous.heartbeat || elapsed < 0 || elapsed > 7 || position - watched > Math.min(5, elapsed + 0.35))
      return fail('Play the video normally to record continuous progress. Seeking ahead does not count.');
    watched = Math.min(lesson.seconds, Math.max(watched, position));
  }
  db().prepare('UPDATE learning_watch SET watched = ?, heartbeat = ? WHERE purchase_id = ? AND lesson_id = ?').run(watched, now, purchase.id, lesson.id);
  return watched;
});

export const submitLearningExam = (userId: string, courseId: string, answers: unknown, requestId: string, now = Date.now()) => atomic(() => {
  const course = courseById(courseId);
  const purchase = paidPurchase(userId, courseId);
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) return fail('An exam submission reference is required.');
  const existing = db().prepare('SELECT score FROM learning_attempts WHERE request_id = ? AND purchase_id = ?').get(requestId, purchase.id) as { score: number } | undefined;
  if (existing) return existing;
  if (certificate(userId, courseId)) return fail('This course has already been completed.');
  if (attempts(purchase.id).length >= attemptsPerBlock) return fail('All three attempts have been used. Wait seven days before repurchasing.');
  const progress = watch(purchase.id);
  if (!course.lessons.every((lesson) => progress[lesson.id] >= lesson.seconds)) return fail('Watch 100% of every required video before taking the exam.');
  if (!Array.isArray(answers) || answers.length !== demoAnswerKey.length || answers.some((answer, index) => !Number.isInteger(answer) || answer < 0 || answer >= course.questions[index].options.length))
    return fail('Answer every exam question before submitting.');
  const score = answers.reduce((total, answer, index) => total + (answer === demoAnswerKey[index] ? 10 : 0), 0);
  db().prepare('INSERT INTO learning_attempts VALUES (?, ?, ?, ?)').run(requestId, purchase.id, score, now);
  appendLearningAudit('Demo final exam submitted', purchase.id);
  if (score >= passingPercent) {
    const user = db().prepare('SELECT name FROM learning_users WHERE id = ?').get(userId) as { name: string };
    const id = randomUUID();
    db().prepare('INSERT INTO learning_certificates VALUES (?, ?, ?, ?, ?, ?)').run(id, userId, courseId, purchase.id, new Date(now).toISOString(), user.name);
    appendLearningAudit('Demo certificate issued', id);
  }
  return { score };
});

export const learningDocument = (userId: string, kind: string, id: string) => {
  if (kind === 'certificate') {
    const row = db().prepare('SELECT * FROM learning_certificates WHERE id = ? AND user_id = ?').get(id, userId) as { id: string; learner_name: string; course_id: string; issued_at: string } | undefined;
    if (!row) return fail('Certificate not found.');
    const fixture = fixturePurchase((db().prepare('SELECT purchase_id FROM learning_certificates WHERE id = ?').get(id) as { purchase_id: string }).purchase_id);
    return { title: fixture ? 'Fixture completion sample' : 'Demo completion certificate', name: row.learner_name, course: courseById(row.course_id).title, date: row.issued_at, reference: row.id, amount: null, fixture };
  }
  const row = db().prepare('SELECT p.*, u.name FROM learning_purchases p JOIN learning_users u ON u.id = p.user_id WHERE p.id = ? AND p.user_id = ? AND p.paid_at IS NOT NULL').get(id, userId) as (Purchase & { name: string }) | undefined;
  if (!row) return fail('Payment receipt not found.');
  const fixture = fixturePurchase(row.id);
  return { title: fixture ? 'Fictional purchase receipt' : 'Sandbox payment receipt', name: row.name, course: courseById(row.course_id).title, date: row.paid_at!, reference: row.id, amount: row.amount, fixture };
};

/** Admin status evidence only: counts/timestamps, never learner identifiers or answers. */
export const learningEvidence = () => {
  const database = db();
  const accounts = (database.prepare('SELECT count(*) AS count FROM learning_users').get() as { count: number }).count;
  const purchases = database.prepare(`SELECT p.* FROM learning_purchases p WHERE p.paid_at IS NOT NULL
    AND (EXISTS (SELECT 1 FROM learning_stripe_events e WHERE e.purchase_id = p.id)
      OR EXISTS (SELECT 1 FROM learning_fixture_purchases f WHERE f.purchase_id = p.id))`).all() as Purchase[];
  const paidIds = new Set(purchases.map((purchase) => purchase.id));
  const completedIds = new Set(purchases.filter((purchase) => {
    const course = demoCourses.find((item) => item.id === purchase.course_id);
    const progress = watch(purchase.id);
    return course?.lessons.every((lesson) => progress[lesson.id] >= lesson.seconds);
  }).map((purchase) => purchase.id));
  const exams = (database.prepare('SELECT purchase_id, score, occurred_at FROM learning_attempts').all() as (Attempt & { purchase_id: string })[])
    .filter((exam) => paidIds.has(exam.purchase_id));
  const certificates = (database.prepare('SELECT purchase_id, issued_at FROM learning_certificates').all() as { purchase_id: string; issued_at: string }[])
    .filter((item) => completedIds.has(item.purchase_id) && exams.some((exam) => exam.purchase_id === item.purchase_id && exam.score >= passingPercent));
  const videoTimes = (database.prepare('SELECT purchase_id, heartbeat FROM learning_watch WHERE watched > 0').all() as { purchase_id: string; heartbeat: number }[])
    .filter((item) => completedIds.has(item.purchase_id)).map((item) => item.heartbeat);
  return {
    accounts, paidPurchases: purchases.length, fixturePurchases: purchases.filter((item) => fixturePurchase(item.id)).length, completedVideoBlocks: completedIds.size,
    examAttempts: exams.length, certificates: certificates.length,
    lastPaymentAt: purchases.map((item) => item.paid_at!).sort().at(-1) ?? null,
    lastVideoAt: videoTimes.length ? new Date(Math.max(...videoTimes)).toISOString() : null,
    lastExamAt: exams.length ? new Date(Math.max(...exams.map((exam) => exam.occurred_at))).toISOString() : null,
    lastCertificateAt: certificates.map((item) => item.issued_at).sort().at(-1) ?? null,
  };
};

/** Explicit admin-triggered fictional data. Never creates a Stripe event or
 * represents generated progress as observed human attendance. */
export const seedLearningFixtures = () => {
  if (!learningDemoEnabled() || !fictionalWorkflowEnabled(process.env.ENABLE_DEVELOPMENT_INTEGRATION_SIMULATORS)) return fail('Fictional fixture setup is disabled.');
  const result = atomic(() => {
    const marker = db().prepare('SELECT user_id FROM learning_fixture_runs WHERE id = ?').get('learning-v1') as { user_id: string } | undefined;
    const password = 'DemoLearning!2026';
    const user = marker
      ? db().prepare('SELECT * FROM learning_users WHERE id = ?').get(marker.user_id) as User
      : createLearner('Fictional Demo Learner', `demo-${randomUUID()}@example.invalid`, password);
    if (!marker) db().prepare('INSERT INTO learning_fixture_runs VALUES (?, ?)').run('learning-v1', user.id);
    const course = demoCourses[0];
    let purchase = latest(user.id, course.id);
    if (!purchase) {
      const id = randomUUID();
      db().prepare('INSERT INTO learning_purchases (id, user_id, course_id, block, original_price, amount) VALUES (?, ?, ?, 1, ?, ?)').run(id, user.id, course.id, course.price, course.price);
      purchase = latest(user.id, course.id)!;
    }
    if (purchase.intent_id) return fail('Fixture setup refuses to change a Stripe-linked purchase.');
    if (!fixturePurchase(purchase.id)) {
      db().prepare('INSERT INTO learning_fixture_purchases VALUES (?)').run(purchase.id);
      db().prepare('UPDATE learning_purchases SET paid_at = ? WHERE id = ?').run(new Date().toISOString(), purchase.id);
      appendLearningAudit('Demo fixture purchase recorded', purchase.id);
    }
    for (const lesson of course.lessons) db().prepare(`INSERT INTO learning_watch (purchase_id, lesson_id, watched, heartbeat) VALUES (?, ?, ?, ?)
      ON CONFLICT(purchase_id, lesson_id) DO UPDATE SET watched = excluded.watched, heartbeat = excluded.heartbeat`).run(purchase.id, lesson.id, lesson.seconds, Date.now());
    return { user, password, purchase, course };
  });
  submitLearningExam(result.user.id, result.course.id, demoAnswerKey, result.purchase.id);
  return { email: result.user.email, password: result.password, courseId: result.course.id };
};
