import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { learningBlockPrice, retryWaitMs } from '../app/lib/learningPolicy';

test('demo learning enforces payment, full video progress, three attempts, seven days and repeat pricing', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'learning-test-'));
  process.env.AUDIT_LOG_DB_PATH = path.join(root, 'audit.sqlite');
  process.env.ENABLE_DEVELOPMENT_CEU_DEMO = 'true';
  const store = await import('../app/lib/learningStore.server');
  const { demoAnswerKey } = await import('../app/lib/demoCourses.server');
  const { getAuditStoreStatus } = await import('../app/lib/auditStore.server');
  const courseId = 'demo-course-orientation';
  let now = Date.now();
  const user = store.createLearner('Fictional Learner', 'learner@example.invalid', 'unique-test-password');
  const other = store.createLearner('Another Learner', 'other@example.invalid', 'another-test-password');
  const course = () => store.learningAccount(user, now).courses.find((item) => item.id === courseId)!;
  const pay = (purchase: ReturnType<typeof store.reserveLearningPurchase>) => {
    store.linkLearningIntent(purchase.id, `pi_${purchase.id}`);
    const event = { purchaseId: purchase.id, intentId: `pi_${purchase.id}`, eventId: `evt_${purchase.id}`, amount: purchase.amount, currency: 'usd', livemode: false };
    assert.throws(() => store.acceptLearningPayment({ ...event, amount: purchase.amount + 1 }, now));
    assert.throws(() => store.acceptLearningPayment({ ...event, livemode: true }, now));
    assert.equal(store.acceptLearningPayment(event, now), true);
    assert.equal(store.acceptLearningPayment(event, now), false);
  };
  const watch = () => {
    for (const lesson of course().lessons) {
      store.recordLearningWatch(user.id, courseId, lesson.id, null, now);
      assert.throws(() => store.recordLearningWatch(user.id, courseId, lesson.id, lesson.seconds, now), /continuous progress/);
      for (let position = 1; position <= lesson.seconds; position++) {
        now += 1000;
        store.recordLearningWatch(user.id, courseId, lesson.id, position, now);
      }
    }
  };
  const failBlock = () => {
    for (let index = 0; index < 3; index++) {
      const id = randomUUID();
      const result = store.submitLearningExam(user.id, courseId, Array(10).fill(0), id, now++);
      assert.ok(result.score < 90);
      assert.equal(store.submitLearningExam(user.id, courseId, Array(10).fill(0), id, now++).score, result.score, 'retrying the same request does not use another attempt');
    }
    assert.equal(course().attemptsUsed, 3);
    assert.throws(() => store.submitLearningExam(user.id, courseId, demoAnswerKey, randomUUID(), now), /three attempts/);
    assert.throws(() => store.reserveLearningPurchase(user.id, courseId, now), /seven days/);
    const readyAt = Date.parse(course().retryAt!);
    assert.throws(() => store.reserveLearningPurchase(user.id, courseId, readyAt - 1), /seven days/);
    assert.ok(readyAt >= now + retryWaitMs - 10);
    now = readyAt;
  };
  try {
    assert.equal(store.learningDemoEnabled(), true);
    assert.throws(() => store.authenticateLearner(user.email, 'incorrect password'));
    assert.equal(store.authenticateLearner(user.email, 'unique-test-password').id, user.id);
    const session = store.startLearnerSession(user.id, now);
    assert.equal(store.learnerFromToken(session, now)?.id, user.id);
    assert.equal(store.learnerFromToken(session, now + 8 * 60 * 60 * 1000), null);
    store.endLearnerSession(session);
    assert.equal(store.learnerFromToken(session, now), null);
    assert.equal(course().questions.length, 0, 'unpaid course content is withheld');
    assert.throws(() => store.recordLearningWatch(user.id, courseId, 'orientation', null, now), /purchase/);
    let purchase = store.reserveLearningPurchase(user.id, courseId, now);
    assert.equal(purchase.amount, 9500);
    assert.equal(store.reserveLearningPurchase(user.id, courseId, now).id, purchase.id, 'pending purchases are reused');
    pay(purchase);
    assert.throws(() => store.submitLearningExam(user.id, courseId, demoAnswerKey, randomUUID(), now), /100%/);
    watch(); failBlock();
    purchase = store.reserveLearningPurchase(user.id, courseId, now);
    assert.equal(purchase.amount, 4750);
    pay(purchase);
    assert.deepEqual(course().watched, {}, 'repurchasing resets all video progress');
    assert.throws(() => store.submitLearningExam(user.id, courseId, demoAnswerKey, randomUUID(), now), /100%/);
    watch(); failBlock();
    purchase = store.reserveLearningPurchase(user.id, courseId, now);
    assert.equal(purchase.amount, 9500);
    pay(purchase); watch(); failBlock();
    purchase = store.reserveLearningPurchase(user.id, courseId, now);
    assert.equal(purchase.amount, 9500, 'all subsequent blocks remain full price');
    pay(purchase); watch();
    const answers = [...demoAnswerKey]; answers[0] = 0;
    assert.equal(store.submitLearningExam(user.id, courseId, answers, randomUUID(), now).score, 90);
    assert.ok(course().certificateId);
    const document = store.learningDocument(user.id, 'certificate', course().certificateId!);
    assert.equal(document.name, user.name);
    assert.throws(() => store.learningDocument(other.id, 'certificate', course().certificateId!));
    assert.throws(() => store.learningDocument(other.id, 'receipt', purchase.id));
    assert.throws(() => store.reserveLearningPurchase(user.id, courseId, now), /already completed/);
    assert.equal(getAuditStoreStatus().chainValid, true);
    assert.equal(learningBlockPrice(10500, 2), 5250);
    assert.equal(learningBlockPrice(9500, 10), 9500);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
