import { cookies } from 'next/headers';
import { clinicSessionCookieName, verifyAdminSession } from '@/app/lib/serverClinicSession';
import {
  developmentIntegrationSimulatorsEnabled,
  runIntegrationSimulation,
  type IntegrationSimulationTarget,
} from '@/app/lib/externalIntegrations.server';
import { recordIntegrationSimulationCheck } from '@/app/lib/auditStore.server';

export const runtime = 'nodejs';

const targets: IntegrationSimulationTarget[] = [
  'identity-provider',
  'membership-scanner',
  'ubuntu-host',
  'database-server',
  'monitoring-alerts',
];

const isIntegrationSimulationTarget = (value: unknown): value is IntegrationSimulationTarget => (
  typeof value === 'string' && targets.some((target) => target === value)
);

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const session = verifyAdminSession(cookieStore.get(clinicSessionCookieName)?.value);
  if (!session) {
    return Response.json({ error: 'Administrator access required.' }, { status: 403 });
  }
  if (!developmentIntegrationSimulatorsEnabled()) {
    return Response.json({ error: 'Development integration simulations are disabled.' }, { status: 404 });
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: 'A valid JSON target is required.' }, { status: 400 });
  }

  if (
    input === null
    || typeof input !== 'object'
    || Array.isArray(input)
    || !('target' in input)
    || !isIntegrationSimulationTarget(input.target)
    || !('payload' in input)
    || input.payload === null
    || typeof input.payload !== 'object'
    || Array.isArray(input.payload)
  ) {
    return Response.json({ error: 'Select a supported integration simulation.' }, { status: 400 });
  }

  const simulation = runIntegrationSimulation(input.target, input.payload);
  try {
    recordIntegrationSimulationCheck({
      target: simulation.target,
      checkedAt: simulation.generatedAt,
      result: simulation.contractProcessed ? 'success' : 'failed',
      label: simulation.label,
      source: simulation.source,
      sessionId: session.sessionId,
    });
  } catch {
    console.error('Development integration simulation evidence could not be persisted.');
    return Response.json({ error: 'The simulation result could not be recorded safely.' }, { status: 503 });
  }

  return Response.json({ simulation }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
