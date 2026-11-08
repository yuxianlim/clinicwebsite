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
    { name: 'signed sandbox payment -> course access', count: evidence?.paidPurchases ?? 0, at: evidence?.lastPaymentAt ?? null,
      components: ['Learner checkout', '/api/stripe/webhook', 'SQLite learning_purchases and learning_stripe_events'],
      detail: 'Only purchases with paid state and a matching stored signature-verified sandbox event count. Demo purchases do not establish approved CEU enrollment.',
      next: 'Complete a demo course sandbox purchase and receive its matching signed Stripe webhook.' },
    { name: 'required videos -> saved completion', count: evidence?.completedVideoBlocks ?? 0, at: evidence?.lastVideoAt ?? null,
      components: ['Demo video player', '/api/learning', 'SQLite learning_watch'],
      detail: 'All required videos must have full saved progress within a verified paid attempt block. Browser playback records do not prove attention or approved CE attendance.',
      next: 'Watch 100% of every required video in a purchased demo course.' },
    { name: 'final exam -> stored grading', count: evidence?.examAttempts ?? 0, at: evidence?.lastExamAt ?? null,
      components: ['Demo final exam', '/api/learning', 'SQLite learning_attempts'],
      detail: 'Server-graded exam results are counted only for signature-verified sandbox purchases. Scores and answers are not included in this dashboard.',
      next: 'After completing the demo videos, submit the final course exam.' },
    { name: 'passing exam -> non-credit certificate', count: evidence?.certificates ?? 0, at: evidence?.lastCertificateAt ?? null,
      components: ['Server grading', 'SQLite learning_certificates', 'Owner-protected demo document route'],
      detail: 'A demo certificate counts only with full video progress and a score of at least 90% in the same verified paid block. It awards no approved CAB/NCBAHM CE credit.',
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
      evidence: [`${item.count} matching development record(s) found.`, item.detail],
      lastTestedAt: item.at,
      missingRequirement: !available ? 'Restore readable learning storage and a valid audit chain.' : connected ? null : item.next,
      safeErrorMessage: available ? null : 'Demo learning evidence could not be verified.',
    };
  });
};
