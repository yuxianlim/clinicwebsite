import { learningDemoEnabled, learningEvidence } from './learningStore.server';

export const learningStatusItems = (auditChainValid: boolean) => {
  if (!learningDemoEnabled()) return [];
  let evidence: ReturnType<typeof learningEvidence> | null = null;
  try { evidence = learningEvidence(); } catch { /* Report unavailable storage, never manufacture success. */ }
  const definitions = [
    { name: 'registration -> stored account', count: evidence?.accounts ?? 0, at: null,
      components: ['Learner sign-up', '/api/learning', 'SQLite learning_users'],
      detail: 'Learner accounts are stored with salted password hashes. This row reports registration records; it does not claim email verification or a separate browser test.',
      next: 'Create a fictional learner account at /learn.' },
    { name: 'purchase -> course access', count: evidence?.paidPurchases ?? 0, at: evidence?.lastPaymentAt ?? null,
      components: ['Learner checkout', '/api/stripe/webhook', 'SQLite learning_purchases and learning_stripe_events'],
      detail: 'Course access counts a signature-verified sandbox purchase or an explicitly marked development purchase fixture. Fixtures do not claim a Stripe payment or approved CEU enrollment.',
      next: 'Use Run demo setup for fictional records, or complete a genuine Stripe sandbox purchase.' },
    { name: 'required videos -> saved completion', count: evidence?.completedVideoBlocks ?? 0, at: evidence?.lastVideoAt ?? null,
      components: ['Demo video player', '/api/learning', 'SQLite learning_watch'],
      detail: 'All required videos must have full saved progress within a sandbox-paid or marked fixture block. Fixture progress is generated data; browser playback records do not prove attention or approved CE attendance.',
      next: 'Watch 100% of every required video in a purchased demo course.' },
    { name: 'final exam -> stored grading', count: evidence?.examAttempts ?? 0, at: evidence?.lastExamAt ?? null,
      components: ['Demo final exam', '/api/learning', 'SQLite learning_attempts'],
      detail: 'Server-graded results require a verified sandbox purchase or a marked fictional purchase fixture. Scores and answers are not included in this dashboard.',
      next: 'After completing the demo videos, submit the final course exam.' },
    { name: 'passing exam -> non-credit certificate', count: evidence?.certificates ?? 0, at: evidence?.lastCertificateAt ?? null,
      components: ['Server grading', 'SQLite learning_certificates', 'Owner-protected demo document route'],
      detail: 'A demo certificate counts only with full saved video progress and a score of at least 90% in the same sandbox-paid or fixture block. Fixture certificates are labeled generated samples. No approved CAB/NCBAHM CE credit is awarded.',
      next: 'Pass the demo final exam with at least 90% to create a non-credit demo certificate.' },
  ];
  return definitions.map((item) => {
    const available = Boolean(evidence && auditChainValid);
    const connected = available && item.count > 0;
    return {
      kind: 'Connection', name: `Demo learning: ${item.name}`,
      status: !available ? 'Failed' : connected ? 'Connected' : 'Partly Connected',
      description: item.detail, connectedComponents: item.components,
      informationExchanged: 'Development-only course/account records and server-confirmed outcomes. This status response contains counts and timestamps only.',
      evidence: [`${item.count} matching development record(s) found.`, item.detail,
        `${evidence?.fixturePurchases ?? 0} fictional purchase fixture(s); ${(evidence?.paidPurchases ?? 0) - (evidence?.fixturePurchases ?? 0)} signed Stripe sandbox purchase(s). Fixture video/exam/certificate records are generated test data, not observed human attendance.`],
      lastTestedAt: item.at,
      missingRequirement: !available ? 'Restore readable learning storage and a valid audit chain.' : connected ? null : item.next,
      safeErrorMessage: available ? null : 'Demo learning evidence could not be verified.',
    };
  });
};
