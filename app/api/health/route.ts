import { accessSync, closeSync, constants, mkdirSync, openSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { administratorAuthenticationConfigured } from '@/app/lib/adminAuthentication.server';
import { restrictedFictionalStagingEnabled, restrictedStagingProxyConfigured } from '@/app/lib/deploymentMode';
import { stagingStripeSandboxConfigured } from '@/app/lib/stripeConfiguration.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const dataDirectory = process.env.CLINIC_DATA_DIR ?? path.join(process.cwd(), '.data');
  try {
    mkdirSync(dataDirectory, { recursive: true, mode: 0o700 });
    accessSync(dataDirectory, constants.R_OK | constants.W_OK);
    const probe = path.join(dataDirectory, `.health-${randomUUID()}`);
    closeSync(openSync(probe, 'wx', 0o600));
    unlinkSync(probe);
    if (!restrictedFictionalStagingEnabled() || !restrictedStagingProxyConfigured()
      || !administratorAuthenticationConfigured() || !stagingStripeSandboxConfigured()) throw new Error('staging configuration incomplete');
    return Response.json({ status: 'ok', service: 'clinic-website', mode: 'restricted-fictional-staging' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ status: 'unhealthy' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
