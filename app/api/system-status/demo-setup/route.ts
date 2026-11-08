import { cookies } from 'next/headers';
import { clinicSessionCookieName, verifyAdminSession } from '@/app/lib/serverClinicSession';
import { learningDemoEnabled, seedLearningFixtures } from '@/app/lib/learningStore.server';
import { demoKioskEnabled, seedDemoKiosk, simulateNfcTap } from '@/app/lib/demoKiosk.server';
import { getLatestAuditEvent, getLatestIntegrationSimulationChecks, recordIntegrationSimulationCheck } from '@/app/lib/auditStore.server';
import { runIntegrationSimulation } from '@/app/lib/externalIntegrations.server';
import { seedDemoAlert } from '@/app/lib/demoAlerts.server';
import { seedDemoBilling } from '@/app/lib/demoBilling.server';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!learningDemoEnabled() || !demoKioskEnabled()) return Response.json({ error: 'Enable development learning and integration demos first.' }, { status: 404, headers });
  if (!verifyAdminSession((await cookies()).get(clinicSessionCookieName)?.value)) return Response.json({ error: 'Administrator access required.' }, { status: 403, headers });
  if (request.headers.get('origin')) {
    try { if (new URL(request.headers.get('origin')!).host !== request.headers.get('host')) throw new Error('Origin mismatch.'); }
    catch { return Response.json({ error: 'Request origin rejected.' }, { status: 403, headers }); }
  }
  try {
    const learner = seedLearningFixtures();
    const kiosk = seedDemoKiosk();
    const card = seedDemoKiosk('card');
    if (!getLatestAuditEvent('check-in', ['Simulated NFC tap received'])) simulateNfcTap();
    seedDemoAlert();
    const billing = seedDemoBilling();
    const timestamp = new Date().toISOString();
    const epoch = Math.floor(Date.now() / 1000);
    const eventId = 'demo-setup-monitoring-event';
    const previous = getLatestIntegrationSimulationChecks();
    for (const target of ['identity-provider', 'membership-scanner', 'ubuntu-host', 'database-server', 'monitoring-alerts'] as const) {
      if (previous.get(target)?.result === 'success') continue;
      const payload = target === 'identity-provider' ? { iss: 'https://identity.example.invalid', sub: 'demo-setup-subject', aud: 'clinic-kiosk-development', iat: epoch, exp: epoch + 300, nonce: 'demo-setup-nonce', email_verified: true }
        : target === 'membership-scanner' ? { deviceId: 'SIMULATED-SCANNER-01', scanId: 'demo-setup-scan', membershipToken: 'demo-setup-fictional-token', scannedAt: timestamp }
          : target === 'monitoring-alerts' ? { event: { eventId, occurredAt: timestamp, environment: 'development', service: 'clinic-application', severity: 'warning', code: 'SIMULATED_HEALTH_WARNING' }, receipt: { accepted: true, eventId, incidentId: 'demo-setup-incident', receivedAt: timestamp } }
            : { status: 'ok', component: target };
      const simulation = runIntegrationSimulation(target, payload);
      if (!simulation.contractProcessed) throw new Error('Demo format validation failed.');
      recordIntegrationSimulationCheck({ target, checkedAt: simulation.generatedAt, result: 'success', label: simulation.label, source: simulation.source });
    }
    return Response.json({ learner, billing, kiosk: { ...kiosk, cardToken: card.cardToken }, source: 'development-fixture', message: 'Fictional learner, phone/card kiosk, simulated NFC reader, billing and local alert records are ready. No real payment/refund, SMS delivery, physical NFC scan, human attendance or approved CE credit is claimed.' }, { headers });
  } catch { return Response.json({ error: 'Demo setup could not finish. Check local storage and available appointment slots, then retry; existing learner fixtures are reused.' }, { status: 503, headers }); }
}
