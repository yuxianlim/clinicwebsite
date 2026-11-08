import { stripeConfiguration } from '@/app/lib/stripeConfiguration.server';
import { learningStatusItems } from '@/app/lib/learningStatus.server';
import { demoKioskEnabled } from '@/app/lib/demoKiosk.server';
import { learningDemoEnabled } from '@/app/lib/learningStore.server';
import { getKioskRateLimitStatus } from '@/app/lib/kioskRateLimit.server';
import { latestVerifiedBackup } from '@/app/lib/backupStatus.server';
import { administratorAuthenticationConfigured, administratorDemoEnabled } from '@/app/lib/adminAuthentication.server';
import { cookies } from 'next/headers';
import { clinicSessionCookieName, verifyAdminSession } from '@/app/lib/serverClinicSession';
import { getAppointmentStoreStatus } from '@/app/lib/appointmentStore.server';
import {
  getAuditStoreStatus,
  getLatestAuditEvent,
  getLatestAdministratorLoginEvent,
  getLatestVerifiedStripeEvent,
  getLatestCeuEnrollment,
  getLatestCeuPaymentSetup,
  getLatestStripeApiConnectivityCheck,
  getLatestIntegrationSimulationChecks,
  getClinicRecordCounts,
  type IntegrationSimulationCheck,
} from '@/app/lib/auditStore.server';
import {
  developmentIntegrationSimulatorsEnabled,
  normalizeHealthProbe,
  type IntegrationSimulationTarget,
} from '@/app/lib/externalIntegrations.server';

export const runtime = 'nodejs';

type ProbeComponent = 'ubuntu-host' | 'database-server';
type BlockerCategory =
  | 'Code issue'
  | 'Configuration issue'
  | 'Missing test evidence'
  | 'Unavailable hardware'
  | 'Unavailable external service'
  | 'Future requirement';

const dependencyGroups: Record<string, {
  dependencyGroup: string;
  blockerCategory: BlockerCategory | null;
}> = {
  'Application -> Ubuntu host health endpoint': { dependencyGroup: 'Production operations', blockerCategory: 'Configuration issue' },
  'Application -> Database server health endpoint': { dependencyGroup: 'Production operations', blockerCategory: 'Configuration issue' },
  'Admin sign-in -> server session': { dependencyGroup: 'Administrator access', blockerCategory: 'Future requirement' },
  'Kiosk -> patient list and appointment state': { dependencyGroup: 'Kiosk check-in', blockerCategory: 'Missing test evidence' },
  'Kiosk -> patient identity verification': { dependencyGroup: 'Kiosk check-in', blockerCategory: 'Unavailable external service' },
  'Application -> OIDC claim-shape adapter': { dependencyGroup: 'Kiosk check-in', blockerCategory: 'Missing test evidence' },
  'Membership scanner -> kiosk input': { dependencyGroup: 'Kiosk check-in', blockerCategory: 'Unavailable hardware' },
  'Application -> scanner event-format adapter': { dependencyGroup: 'Kiosk check-in', blockerCategory: 'Missing test evidence' },
  'Application -> Ubuntu health-response validator': { dependencyGroup: 'Production operations', blockerCategory: 'Missing test evidence' },
  'Application -> database health-response validator': { dependencyGroup: 'Production operations', blockerCategory: 'Missing test evidence' },
  'Kiosk rate limiting -> shared abuse protection': { dependencyGroup: 'Kiosk check-in', blockerCategory: 'Future requirement' },
  'Booking and kiosk -> audit event API': { dependencyGroup: 'Booking and kiosk audit', blockerCategory: 'Missing test evidence' },
  'CEU form -> Stripe PaymentIntent': { dependencyGroup: 'CEU payment and enrollment', blockerCategory: 'Missing test evidence' },
  'Stripe test-mode API connectivity': { dependencyGroup: 'CEU payment and enrollment', blockerCategory: 'Missing test evidence' },
  'Stripe.js outcome -> audit log': { dependencyGroup: 'CEU payment and enrollment', blockerCategory: 'Configuration issue' },
  'Verified payment -> CEU enrollment': { dependencyGroup: 'CEU payment and enrollment', blockerCategory: 'Configuration issue' },
  'CEU completion/attendance -> certificate issuance': { dependencyGroup: 'CEU payment and enrollment', blockerCategory: 'Future requirement' },
  'Appointment changes -> shared storage and audit': { dependencyGroup: 'Clinic operations records', blockerCategory: 'Code issue' },
  'Patient identity provider -> kiosk verification': { dependencyGroup: 'Kiosk check-in', blockerCategory: 'Unavailable external service' },
  'Application -> monitoring event/receipt adapter': { dependencyGroup: 'Production operations', blockerCategory: 'Missing test evidence' },
  'Patient management -> durable records and audit': { dependencyGroup: 'Clinic operations records', blockerCategory: 'Code issue' },
  'Staff management -> durable records and audit': { dependencyGroup: 'Clinic operations records', blockerCategory: 'Code issue' },
  'Billing -> durable financial records and audit': { dependencyGroup: 'Clinic operations records', blockerCategory: 'Code issue' },
  'Application -> monitoring and alerting': { dependencyGroup: 'Production operations', blockerCategory: 'Unavailable external service' },
  'Database -> backups and recovery': { dependencyGroup: 'Production operations', blockerCategory: 'Future requirement' },
};

const withDependencyGroups = <T extends { name: string; status: string; evidence?: string[] }>(
  items: T[],
  stripeWebhookConfigured: boolean,
) => items.map((item) => {
  const dependency = dependencyGroups[item.name] ?? (item.name.startsWith('Demo kiosk:')
    ? { dependencyGroup: 'Kiosk check-in', blockerCategory: 'Missing test evidence' as const }
    : item.name.startsWith('Demo learning:')
    ? { dependencyGroup: 'Demo learner workspace', blockerCategory: 'Missing test evidence' as const }
    : { dependencyGroup: 'Core application', blockerCategory: null });
  let blockerCategory = item.status === 'Connected' ? null : dependency.blockerCategory;
  if (
    (item.name === 'Application -> Ubuntu host health endpoint' || item.name === 'Application -> Database server health endpoint')
    && item.status === 'Failed'
  ) blockerCategory = 'Unavailable external service';
  if (
    (item.name === 'Stripe.js outcome -> audit log' || item.name === 'Verified payment -> CEU enrollment')
    && item.status !== 'Connected'
    && stripeWebhookConfigured
  ) blockerCategory = 'Missing test evidence';
  if (
    item.status === 'Partly Connected'
    && [
      'Patient management -> durable records and audit',
      'Staff management -> durable records and audit',
      'Appointment changes -> shared storage and audit',
    ].includes(item.name)
  ) blockerCategory = 'Missing test evidence';
  if (
    (item.name === 'CEU form -> Stripe PaymentIntent' || item.name === 'Stripe test-mode API connectivity')
    && item.status === 'Failed'
  ) {
    blockerCategory = 'Configuration issue';
  }
  const isFormatAdapter = item.name.startsWith('Application -> ')
    && item.evidence?.some((entry) => entry.startsWith('Development Simulation:'));
  let testSource = 'Application/runtime evidence; no separate end-to-end test recorded.';
  if (item.name.startsWith('Demo kiosk:')) {
    testSource = 'Development-only code verification for allowlisted fictional patients. No SMS delivery or real patient identity was verified.';
  } else if (item.name.startsWith('Demo learning:')) {
    testSource = 'Development learner-store records and audit-chain health; no separate browser test is recorded by this request. No approved CE credit is claimed.';
  } else if (isFormatAdapter) {
    testSource = 'Development Simulation';
  } else if (item.name === 'Kiosk rate limiting -> shared abuse protection') {
    testSource = 'Current shared-store health check; cross-process contention is covered by the test suite.';
  } else if (item.name === 'Database -> backups and recovery') {
    testSource = 'Local backup receipt and snapshot checksum verification; managed recovery remains incomplete.';
  } else if ([
    'Application -> Ubuntu host health endpoint',
    'Application -> Database server health endpoint',
    'Patient identity provider -> kiosk verification',
    'Membership scanner -> kiosk input',
    'Application -> monitoring and alerting',
    'CEU completion/attendance -> certificate issuance',
    'Database -> backups and recovery',
    'Billing -> durable financial records and audit',
  ].includes(item.name)) {
    testSource = 'Not tested: external service, hardware, or workflow is unavailable.';
  } else if ([
    'Patient management -> durable records and audit',
    'Staff management -> durable records and audit',
    'Appointment changes -> shared storage and audit',
  ].includes(item.name) && item.status === 'Connected') {
    testSource = 'Persisted administrative records and audit evidence; no browser test is recorded by this request.';
  } else if (item.name === 'Kiosk -> patient list and appointment state' && item.status === 'Connected') {
    testSource = 'Persisted kiosk check-in and audit evidence.';
  } else if (item.name === 'Public booking -> appointment state' && item.status === 'Connected') {
    testSource = 'Persisted server-side appointment evidence.';
  } else if (item.name === 'Booking and kiosk -> audit event API' && item.status === 'Connected') {
    testSource = 'Persisted server-side booking and kiosk audit events; chain verified during this request.';
  } else if (item.name === 'Admin portal -> audit read API' || item.name === 'Administrator session -> protected status API') {
    testSource = 'Current authenticated request; authorization is enforced by the shared session guard.';
  } else if (item.name === 'Admin portal -> System Status API') {
    testSource = 'Authenticated Architecture Test Center request and response.';
  } else if (item.status === 'Unknown' || item.status === 'Partly Connected') {
    testSource = 'Partial application evidence; end-to-end test is incomplete or unavailable.';
  } else if (item.status === 'Planned') {
    testSource = 'Not tested: planned work has no runtime implementation or evidence.';
  }
  return { ...item, ...dependency, blockerCategory, testSource };
});

const probeHealthEndpoint = async (
  name: string,
  component: ProbeComponent,
  endpoint: string | undefined,
  token: string | undefined,
  checkedAt: string,
) => {
  const connectedComponents = [name, 'System Status API'];
  const informationExchanged = `Server sends GET with optional server-only bearer authorization; endpoint returns HTTP status and JSON status "ok"/component "${component}". Only status and component are evaluated.`;
  if (!endpoint) {
    return {
      kind: 'Connection',
      name: `Application -> ${name} health endpoint`,
      status: 'Planned',
      description: `No ${name} health endpoint is configured, so no connection is claimed.`,
      connectedComponents,
      informationExchanged,
      evidence: [`${name} health endpoint is not configured; no network probe was attempted.`],
      lastTestedAt: null,
      missingRequirement: `Provide a server-side health endpoint returning JSON with status "ok" and component "${component}", then configure its URL. An optional server-side bearer token is supported.`,
      safeErrorMessage: `${name} status could not be verified because the health endpoint is not configured.`,
    };
  }

  let healthUrl: URL;
  try {
    healthUrl = new URL(endpoint);
    const protocolAllowed = healthUrl.protocol === 'https:'
      || (process.env.NODE_ENV !== 'production' && healthUrl.protocol === 'http:');
    if (!protocolAllowed || healthUrl.username || healthUrl.password || healthUrl.search || healthUrl.hash) {
      throw new Error('Invalid health endpoint URL.');
    }
  } catch {
    return {
      kind: 'Connection',
      name: `Application -> ${name} health endpoint`,
      status: 'Failed',
      description: 'The configured health endpoint is invalid.',
      connectedComponents,
      informationExchanged,
      evidence: ['Configured endpoint failed URL validation; no request was sent.'],
      lastTestedAt: checkedAt,
      missingRequirement: 'Use an HTTPS health URL in production (HTTP is allowed in development), without embedded credentials, query parameters, or fragments.',
      safeErrorMessage: `${name} status could not be checked. Verify the server-side health endpoint configuration.`,
    };
  }

  try {
    const response = await fetch(healthUrl, {
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(3000),
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!response.ok) {
      return {
        kind: 'Connection',
        name: `Application -> ${name} health endpoint`,
        status: 'Failed',
        description: 'The configured health endpoint did not return a successful response.',
        connectedComponents,
        informationExchanged,
        evidence: [`Health probe returned HTTP ${response.status}; response body was discarded.`],
        lastTestedAt: checkedAt,
        missingRequirement: 'Restore the health endpoint and make it return the expected component marker.',
        safeErrorMessage: `${name} is not reporting healthy. Contact the system administrator.`,
      };
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    const isHealthy = normalizeHealthProbe(body, component) !== null;
    return {
      kind: 'Connection',
      name: `Application -> ${name} health endpoint`,
      status: isHealthy ? 'Connected' : 'Failed',
      description: isHealthy
        ? 'The configured endpoint returned the expected health marker.'
        : 'The configured endpoint did not return the expected component-specific health marker.',
      connectedComponents,
      informationExchanged,
      evidence: [isHealthy
        ? `Health probe returned HTTP ${response.status} with the expected ${component} marker; response body was discarded.`
        : `Health probe returned HTTP ${response.status}, but its health marker was missing or did not match; response body was discarded.`],
      lastTestedAt: checkedAt,
      missingRequirement: isHealthy ? null : `Return JSON containing status "ok" and component "${component}" from the configured health endpoint.`,
      safeErrorMessage: isHealthy ? null : `${name} health could not be verified. Contact the system administrator.`,
    };
  } catch {
    return {
      kind: 'Connection',
      name: `Application -> ${name} health endpoint`,
      status: 'Failed',
      description: 'The configured health endpoint could not be reached or timed out.',
      connectedComponents,
      informationExchanged,
      evidence: ['Health probe failed or timed out; network error details were discarded.'],
      lastTestedAt: checkedAt,
      missingRequirement: 'Restore network reachability and a healthy component-specific health endpoint.',
      safeErrorMessage: `${name} could not be reached. Contact the system administrator.`,
    };
  }
};

export async function GET() {
  const cookieStore = await cookies();
  const session = verifyAdminSession(cookieStore.get(clinicSessionCookieName)?.value);
  if (!session) return Response.json({ error: 'Administrator access required.' }, { status: 403 });

  const checkedAt = new Date().toISOString();
  const paymentConfiguration = stripeConfiguration();
  let auditStatus: { eventCount: number; chainValid: boolean } | null = null;
  let latestAdministratorLogin: ReturnType<typeof getLatestAdministratorLoginEvent> = null;
  let latestBookingAudit: ReturnType<typeof getLatestAuditEvent> = null;
  let latestKioskAudit: ReturnType<typeof getLatestAuditEvent> = null;
  let latestDemoKioskAudit: ReturnType<typeof getLatestAuditEvent> = null;
  let latestPatientRecordAudit: ReturnType<typeof getLatestAuditEvent> = null;
  let latestStaffRecordAudit: ReturnType<typeof getLatestAuditEvent> = null;
  let latestAdminAppointmentAudit: ReturnType<typeof getLatestAuditEvent> = null;
  let latestSuccessfulKioskCheckIn: ReturnType<typeof getLatestAuditEvent> = null;
  let latestVerifiedStripeEvent: ReturnType<typeof getLatestVerifiedStripeEvent> = null;
  let latestCeuPaymentSetup: ReturnType<typeof getLatestCeuPaymentSetup> = null;
  let latestCeuEnrollment: ReturnType<typeof getLatestCeuEnrollment> = null;
  let latestStripeApiConnectivityCheck: ReturnType<typeof getLatestStripeApiConnectivityCheck> = null;
  let latestIntegrationSimulationChecks = new Map<IntegrationSimulationTarget, IntegrationSimulationCheck>();
  try {
    auditStatus = getAuditStoreStatus();
    latestAdministratorLogin = getLatestAdministratorLoginEvent();
    latestBookingAudit = getLatestAuditEvent('appointments', ['Appointment created']);
    latestKioskAudit = getLatestAuditEvent('check-in', ['Patient verification succeeded', 'Appointment lookup failed', 'Patient verification failed', 'Patient checked in', 'Check-in rejected', 'Duplicate check-in prevented']);
    latestDemoKioskAudit = getLatestAuditEvent('check-in', ['Demo kiosk code verified']);
    latestPatientRecordAudit = getLatestAuditEvent('administration', ['Patient record created']);
    latestStaffRecordAudit = getLatestAuditEvent('administration', ['Staff record created']);
    latestAdminAppointmentAudit = getLatestAuditEvent('appointments', ['Admin appointment rescheduled', 'Admin appointment canceled']);
    latestSuccessfulKioskCheckIn = getLatestAuditEvent('check-in', ['Patient checked in']);
    latestVerifiedStripeEvent = getLatestVerifiedStripeEvent();
    latestCeuEnrollment = getLatestCeuEnrollment();
    latestCeuPaymentSetup = getLatestCeuPaymentSetup(paymentConfiguration.scope);
    latestStripeApiConnectivityCheck = getLatestStripeApiConnectivityCheck();
    latestIntegrationSimulationChecks = getLatestIntegrationSimulationChecks();
  } catch {
    auditStatus = null;
  }

  const administratorLoginEvidenceTrusted = auditStatus?.chainValid === true;
  const administratorSignInStatus = administratorAuthenticationConfigured() && !administratorDemoEnabled()
    && session.authenticationMethod === 'password-totp'
    && administratorLoginEvidenceTrusted
    ? 'Connected' : 'Partly Connected';
  let kioskLimiterStatus: ReturnType<typeof getKioskRateLimitStatus> | null = null;
  try { kioskLimiterStatus = getKioskRateLimitStatus(); } catch { /* Fail closed in kiosk routes. */ }
  const backupReceipt = await latestVerifiedBackup();
  let appointmentStoreStatus: ReturnType<typeof getAppointmentStoreStatus> | null = null;
  try {
    appointmentStoreStatus = getAppointmentStoreStatus();
  } catch {
    appointmentStoreStatus = null;
  }
  let clinicRecordCounts: ReturnType<typeof getClinicRecordCounts> | null = null;
  try {
    clinicRecordCounts = getClinicRecordCounts();
  } catch {
    clinicRecordCounts = null;
  }
  const patientWorkflowVerified = auditStatus?.chainValid === true
    && Boolean(latestPatientRecordAudit?.result === 'success' && clinicRecordCounts);
  const staffWorkflowVerified = auditStatus?.chainValid === true
    && Boolean(latestStaffRecordAudit?.result === 'success' && clinicRecordCounts);
  const appointmentWorkflowVerified = auditStatus?.chainValid === true
    && Boolean(latestAdminAppointmentAudit?.result === 'success' && appointmentStoreStatus);
  const paymentsConfigured = Boolean(
    process.env.STRIPE_SECRET_KEY
    && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  );
  const ceuSetupVerified = Boolean(auditStatus?.chainValid && latestCeuPaymentSetup && paymentConfiguration.mode);
  const stripeWebhookConfigured = Boolean(process.env.STRIPE_WEBHOOK_SECRET);
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY ?? '';
  const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';
  const stripeModesMatch = stripeSecretKey.startsWith('sk_test_')
    && stripePublishableKey.startsWith('pk_test_')
    || stripeSecretKey.startsWith('sk_live_')
    && stripePublishableKey.startsWith('pk_live_');
  const stripeConnectivityFresh = Boolean(
    latestStripeApiConnectivityCheck
    && latestStripeApiConnectivityCheck.mode === 'test'
    && Date.now() - new Date(latestStripeApiConnectivityCheck.checkedAt).getTime() <= 15 * 60 * 1000,
  );
  const stripeTestKeysConfigured = stripeSecretKey.startsWith('sk_test_')
    && stripePublishableKey.startsWith('pk_test_');
  const stripeSetupStatus = !paymentsConfigured || !stripeModesMatch
    ? 'Failed'
    : !stripeTestKeysConfigured || !stripeConnectivityFresh
      ? 'Unknown'
      : latestStripeApiConnectivityCheck?.result === 'success' ? 'Connected' : 'Failed';
  const stripeTestAvailable = process.env.NODE_ENV !== 'production'
    && stripeTestKeysConfigured;
  const integrationSimulation = (target: IntegrationSimulationTarget) => latestIntegrationSimulationChecks.get(target) ?? null;
  const simulationEvidence = (target: IntegrationSimulationTarget) => {
    const check = integrationSimulation(target);
    if (!check) return ['No simulated format test has been recorded.'];
    return [`${check.source}: documented application-side payload format ${check.result === 'success' ? 'passed' : 'failed'} at ${check.checkedAt}. This is not a physical/provider connection test.`];
  };
  const simulationStatus = (target: IntegrationSimulationTarget) => (
    integrationSimulation(target)?.result === 'success'
      ? 'Connected'
      : integrationSimulation(target)?.result === 'failed' ? 'Failed' : 'Unknown'
  );
  const [ubuntuHostProbe, databaseServerProbe] = await Promise.all([
    probeHealthEndpoint(
      'Ubuntu host',
      'ubuntu-host',
      process.env.UBUNTU_HOST_HEALTH_URL,
      process.env.UBUNTU_HOST_HEALTH_TOKEN,
      checkedAt,
    ),
    probeHealthEndpoint(
      'Database server',
      'database-server',
      process.env.DATABASE_SERVER_HEALTH_URL,
      process.env.DATABASE_SERVER_HEALTH_TOKEN,
      checkedAt,
    ),
  ]);

  return Response.json({
    checkedAt,
    environment: process.env.NODE_ENV === 'production' ? 'Production' : 'Development',
    stripeMode: paymentConfiguration.mode ?? 'unconfigured',
    developmentIntegrationSimulatorsEnabled: developmentIntegrationSimulatorsEnabled(),
    developmentWorkflowFixturesEnabled: learningDemoEnabled() && demoKioskEnabled(),
    items: withDependencyGroups([
      ubuntuHostProbe,
      databaseServerProbe,
      {
        kind: 'Connection',
        name: 'Application -> Ubuntu health-response validator',
        status: simulationStatus('ubuntu-host'),
        description: 'Application-side validation of the documented Ubuntu host health response; does not contact the host.',
        connectedComponents: ['normalizeHealthProbe', 'Ubuntu health-response contract'],
        informationExchanged: 'Expected JSON {status:"ok",component:"ubuntu-host"}; validator accepts only the exact status and component markers.',
        evidence: simulationEvidence('ubuntu-host'),
        lastTestedAt: integrationSimulation('ubuntu-host')?.checkedAt ?? null,
        missingRequirement: simulationStatus('ubuntu-host') === 'Connected' ? null : 'Run the protected development-only Ubuntu health-response format simulation.',
        safeErrorMessage: simulationStatus('ubuntu-host') === 'Connected' ? null : 'The application could not validate the expected Ubuntu health response format.',
      },
      {
        kind: 'Connection',
        name: 'Application -> database health-response validator',
        status: simulationStatus('database-server'),
        description: 'Application-side validation of the documented database server health response; does not contact the database server.',
        connectedComponents: ['normalizeHealthProbe', 'Database health-response contract'],
        informationExchanged: 'Expected JSON {status:"ok",component:"database-server"}; validator accepts only the exact status and component markers.',
        evidence: simulationEvidence('database-server'),
        lastTestedAt: integrationSimulation('database-server')?.checkedAt ?? null,
        missingRequirement: simulationStatus('database-server') === 'Connected' ? null : 'Run the protected development-only database health-response format simulation.',
        safeErrorMessage: simulationStatus('database-server') === 'Connected' ? null : 'The application could not validate the expected database health response format.',
      },
      {
        kind: 'Connection',
        name: 'Application -> OIDC claim-shape adapter',
        status: simulationStatus('identity-provider'),
        description: 'Application-side validation of required OIDC claim shape and basic bounds; this adapter does not validate signatures or authenticate an identity.',
        connectedComponents: ['normalizeIdentityAssertion', 'OIDC ID-token claim contract'],
        informationExchanged: 'Expected claims: HTTPS iss, sub, aud, Unix-second iat/exp, nonce, and boolean email_verified. A real provider token must also pass signature/key, issuer, audience, expiry, nonce, and replay checks before identity can be trusted.',
        evidence: simulationEvidence('identity-provider'),
        lastTestedAt: integrationSimulation('identity-provider')?.checkedAt ?? null,
        missingRequirement: simulationStatus('identity-provider') === 'Connected'
          ? null
          : 'Run the protected development-only OIDC claim-format simulation.',
        safeErrorMessage: simulationStatus('identity-provider') === 'Connected' ? null : 'Identity could not be verified. Please see the front desk.',
      },
      {
        kind: 'Connection',
        name: 'Application -> scanner event-format adapter',
        status: simulationStatus('membership-scanner'),
        description: 'Application-side validation of the documented scanner payload shape; no scanner is connected and no membership is verified.',
        connectedComponents: ['normalizeMembershipScan', 'Membership scanner event contract'],
        informationExchanged: 'Expected {deviceId,scanId,membershipToken,scannedAt}; raw membership token is accepted only in the adapter request and must not be echoed or logged.',
        evidence: simulationEvidence('membership-scanner'),
        lastTestedAt: integrationSimulation('membership-scanner')?.checkedAt ?? null,
        missingRequirement: simulationStatus('membership-scanner') === 'Connected'
          ? null
          : integrationSimulation('membership-scanner')?.result === 'failed'
            ? 'Send a valid fictional scanner event matching the documented payload format; the latest simulation did not match it.'
            : 'Run the protected development-only scanner payload-format simulation.',
        safeErrorMessage: simulationStatus('membership-scanner') === 'Connected' ? null : 'The scanner is unavailable. Please see the front desk.',
      },
      {
        kind: 'Connection',
        name: 'Application -> monitoring event/receipt adapter',
        status: simulationStatus('monitoring-alerts'),
        description: 'Application-side validation of the allowlisted monitoring event and provider receipt formats; no external alert is sent by this adapter test.',
        connectedComponents: ['isMonitoringEvent', 'normalizeMonitoringReceipt', 'publishMonitoringEvent'],
        informationExchanged: 'Event {eventId,occurredAt,environment,service,severity,code}; receipt {accepted,eventId,incidentId,receivedAt}.',
        evidence: simulationEvidence('monitoring-alerts'),
        lastTestedAt: integrationSimulation('monitoring-alerts')?.checkedAt ?? null,
        missingRequirement: simulationStatus('monitoring-alerts') === 'Connected'
          ? null
          : 'Run the protected development-only monitoring format simulation.',
        safeErrorMessage: simulationStatus('monitoring-alerts') === 'Connected' ? null : 'Monitoring delivery could not be verified. Contact the system administrator.',
      },
      {
        kind: 'Component',
        name: 'Next.js application',
        status: 'Connected',
        description: 'The application served this authenticated status request.',
        connectedComponents: ['Browser portal', 'Next.js server'],
        informationExchanged: 'HTTPS request and status response.',
        evidence: ['This GET /api/system-status request reached the handler and produced a successful response.'],
        lastTestedAt: checkedAt,
        missingRequirement: null,
        safeErrorMessage: null,
      },
      {
        kind: 'Connection',
        name: 'Administrator session -> protected status API',
        status: 'Connected',
        description: 'The signed admin session was accepted for this request.',
        connectedComponents: ['ClinicAuthModal', 'HttpOnly admin cookie', 'verifyAdminSession', 'System Status API'],
        informationExchanged: 'Signed session claims: administrator role, audit-read permission, and expiry.',
        evidence: ['verifyAdminSession accepted the cookie; this request continued past the 403 guard.'],
        lastTestedAt: checkedAt,
        missingRequirement: null,
        safeErrorMessage: null,
      },
      {
        kind: 'Connection',
        name: 'Admin sign-in -> server session',
        status: administratorSignInStatus,
        description: administratorDemoEnabled() ? 'Explicit development demo sign-in is enabled; it does not verify an identity.' : 'Server-side email/password and authenticator codes are required; codes cannot be reused across workers.',
        connectedComponents: ['ClinicAuthModal', '/api/clinic/session', 'serverClinicSession'],
        informationExchanged: 'Email, password, authenticator code and sign-in method are submitted; a signed HttpOnly cookie is issued on success. Secrets are not returned in status data.',
        evidence: [
          'The session API requires configured credentials and a server-verified TOTP code, except when an explicit development-only demo flag is enabled.',
          'The authenticator code is verified server-side and consumed atomically before issuing an HttpOnly cookie.',
          !administratorLoginEvidenceTrusted
            ? 'Administrator sign-in events are not trusted because the audit chain could not be verified.'
            : latestAdministratorLogin
              ? `Latest administrator sign-in result: ${latestAdministratorLogin.result}. ${latestAdministratorLogin.safeChangeSummary}`
              : 'No administrator sign-in attempt has been recorded.',
        ],
        lastTestedAt: administratorLoginEvidenceTrusted ? latestAdministratorLogin?.occurredAt ?? null : null,
        missingRequirement: administratorSignInStatus === 'Connected' ? null : 'Configure CLINIC_ADMIN_EMAIL, CLINIC_ADMIN_PASSWORD, CLINIC_SESSION_SECRET (32+ characters), and CLINIC_ADMIN_TOTP_SECRET (32+ Base32 characters); disable the development demo and complete an authenticator sign-in.',
        safeErrorMessage: null,
      },
      {
        kind: 'Component',
        name: 'SQLite audit store and SHA-256 verifier',
        status: auditStatus ? auditStatus.chainValid ? 'Connected' : 'Failed' : 'Failed',
        description: auditStatus
          ? `${auditStatus.eventCount} events; full-chain verification ${auditStatus.chainValid ? 'passed' : 'failed'}.`
          : 'The audit database could not be read.',
        connectedComponents: ['Audit API', 'SQLite audit_log', 'SHA-256 verifier'],
        informationExchanged: 'Audit fields, previous hash, entry hash, event count, and chain result.',
        evidence: auditStatus
          ? ['getAuditStoreStatus read the SQLite table during this request.', `Full-chain verification ${auditStatus.chainValid ? 'passed' : 'failed'} for ${auditStatus.eventCount} stored events.`]
          : ['getAuditStoreStatus failed to read the audit database.'],
        lastTestedAt: checkedAt,
        missingRequirement: auditStatus?.chainValid ? null : 'Restore readable storage and a valid chain from a trusted backup; investigate before writing more events.',
        safeErrorMessage: auditStatus?.chainValid ? null : 'Audit status is unavailable or verification failed. Preserve the database and contact the system administrator.',
      },
      {
        kind: 'Connection',
        name: 'Public booking -> appointment state',
        status: !appointmentStoreStatus
          ? 'Failed'
          : appointmentStoreStatus.latestCreatedAt ? 'Connected' : 'Partly Connected',
        description: appointmentStoreStatus
          ? appointmentStoreStatus.latestCreatedAt
            ? `${appointmentStoreStatus.appointmentCount} appointments are stored by the server-side booking service.`
            : 'The server-side appointment store is available, but no successful public booking has been recorded yet.'
          : 'The server-side appointment store could not be read.',
        connectedComponents: ['BookingModal', '/api/appointments', 'appointmentStore.server', 'SQLite appointments'],
        informationExchanged: 'Name, phone number, date, time, and practitioner are validated server-side. The server returns a confirmation with appointment ID and records only safe audit metadata.',
        evidence: appointmentStoreStatus
          ? [
            'BookingModal submits to POST /api/appointments and only confirms after receiving the persisted appointment.',
            'The route validates fields and practitioner/date/time, then creates the appointment in a SQLite transaction with a unique practitioner/date/time constraint.',
            'GET /api/appointments returns booked time slots only; it does not expose patient details.',
            ...(appointmentStoreStatus.latestCreatedAt
              ? [`Latest confirmed appointment was persisted at ${new Date(appointmentStoreStatus.latestCreatedAt).toISOString()}; appointment count: ${appointmentStoreStatus.appointmentCount}.`]
              : ['The database is reachable, but no successful booking has yet verified the screen-to-storage path.']),
          ]
          : ['Appointment storage health check failed; no connection is claimed.'],
        lastTestedAt: appointmentStoreStatus?.latestCreatedAt
          ? new Date(appointmentStoreStatus.latestCreatedAt).toISOString()
          : appointmentStoreStatus ? checkedAt : null,
        missingRequirement: !appointmentStoreStatus
          ? 'Restore access to the server-side appointment database.'
          : appointmentStoreStatus.latestCreatedAt ? null : 'Complete a successful public booking to verify the screen-to-storage path.',
        safeErrorMessage: appointmentStoreStatus ? null : 'Appointment booking is temporarily unavailable. Please try again later.',
      },
      {
        kind: 'Connection',
        name: 'Kiosk -> patient list and appointment state',
        status: !appointmentStoreStatus
          ? 'Failed'
          : latestSuccessfulKioskCheckIn ? 'Connected' : 'Partly Connected',
        description: appointmentStoreStatus
          ? latestSuccessfulKioskCheckIn
            ? 'The kiosk lookup and check-in reached the server-side patient list and authoritative appointment database; identity-strength requirements are tracked separately.'
            : 'Kiosk endpoints and server-side appointment state are available, but a successful stored check-in has not yet been observed.'
          : 'The server-side appointment store could not be read for kiosk lookup and check-in.',
        connectedComponents: ['KioskClient', '/api/kiosk/lookup', '/api/kiosk/check-in', 'SQLite clinic_patients', 'SQLite appointments'],
        informationExchanged: 'Last four phone digits are sent over POST and checked against the durable clinic patient store; a short-lived single-use token is required to check in. Only patient display name, ID, appointment time, and practitioner return to the screen.',
        evidence: [
          'POST /api/kiosk/lookup validates four digits, applies a shared SQLite attempt limit, finds the patient in SQLite clinic_patients and today’s appointment in SQLite appointments, then issues a short-lived token.',
          'POST /api/kiosk/check-in consumes the single-use token and transactionally records check-in; server-side audit events do not include submitted phone digits.',
          'Public booking links a phone match from the same durable patient store; newly registered admin patients can be looked up by the kiosk.',
          latestSuccessfulKioskCheckIn
            ? `A successful check-in was persisted at ${latestSuccessfulKioskCheckIn.occurredAt}. ${latestSuccessfulKioskCheckIn.safeChangeSummary}`
            : 'No server-side kiosk lookup or check-in test has been recorded yet.',
        ],
        lastTestedAt: latestSuccessfulKioskCheckIn?.occurredAt ?? null,
        missingRequirement: !appointmentStoreStatus
          ? 'Restore access to the server-side appointment database.'
          : !latestSuccessfulKioskCheckIn
            ? 'Run a successful kiosk check-in using an existing eligible development appointment.'
            : null,
        safeErrorMessage: !appointmentStoreStatus
          ? 'Kiosk check-in is temporarily unavailable. Please see the front desk.'
          : latestSuccessfulKioskCheckIn ? null : 'We could not verify your appointment. Please see the front desk.',
      },
      {
        kind: 'Connection',
        name: demoKioskEnabled() ? 'Demo kiosk: code verification -> appointment access' : 'Kiosk -> patient identity verification',
        status: !appointmentStoreStatus || !auditStatus?.chainValid ? 'Failed' : demoKioskEnabled() && latestDemoKioskAudit ? 'Connected' : 'Partly Connected',
        description: demoKioskEnabled()
          ? 'Development-only phone-code verification is implemented for marked fictional patients. Codes are displayed locally; no SMS delivery or real patient identity is claimed.'
          : appointmentStoreStatus
          ? 'The kiosk currently matches patients using only the last four phone digits; no strong identity provider is connected.'
          : 'Patient identity verification cannot reach its appointment store.',
        connectedComponents: ['KioskClient', '/api/kiosk/demo-code', '/api/kiosk/lookup', 'SQLite clinic_patients and demo_kiosk_codes'],
        informationExchanged: 'The demo uses last-four lookup, full-phone fallback for ambiguity, an expiring single-use code and a short-lived check-in token. Only allowlisted fictional patients are accepted. Real SMS verification still requires a selected provider.',
        evidence: [
          'Server-side lookup rejects malformed input and applies a shared SQLite request limit.',
          'Patient matching uses the durable clinic patient store; no provider assertion is accepted.',
          'The development adapter only checks documented OIDC claim shape; provider signature verification is not configured, and simulated claims never authenticate a patient.',
          latestDemoKioskAudit ? `Fictional demo code verification reached appointment access at ${latestDemoKioskAudit.occurredAt}. This is not SMS or real-identity evidence.` : 'No fictional demo code verification has been recorded. Use Run demo setup.',
        ],
        lastTestedAt: demoKioskEnabled() ? latestDemoKioskAudit?.occurredAt ?? null : latestKioskAudit?.occurredAt ?? checkedAt,
        missingRequirement: demoKioskEnabled()
          ? latestDemoKioskAudit && auditStatus?.chainValid ? null : 'Use Run demo setup, then test the marked fictional patient through the demo kiosk code flow.'
          : appointmentStoreStatus
          ? 'Connect a real patient identity provider and verify its assertion server-side; last-four matching is not strong authentication.'
          : 'Restore access to the server-side appointment database.',
        safeErrorMessage: demoKioskEnabled() && latestDemoKioskAudit ? null : 'We could not verify your identity. Please see the front desk.',
      },
      {
        kind: 'Connection',
        name: 'Membership scanner -> kiosk input',
        status: 'Planned',
        description: 'The existing kiosk screen reports the scanner as unavailable; no scanner hardware or SDK is connected.',
        connectedComponents: ['Membership scanner', 'KioskClient'],
        informationExchanged: 'Scanner sends deviceId, unique scanId, opaque membershipToken, and ISO-8601 scannedAt. After device and token verification, kiosk receives only patient {id,name}, appointment {id,date,time,practitioner}, and a short-lived single-use check-in token; raw membership tokens are not echoed or logged.',
        evidence: [
          'KioskClient has no scanner SDK/device event path; no hardware result is claimed.',
          'The server-side adapter validates the documented scan payload shape only; device authentication and membership-token verification are not configured.',
        ],
        lastTestedAt: null,
        missingRequirement: 'Provide the clinic scanner hardware and supported SDK, then implement server-side token verification.',
        safeErrorMessage: 'The scanner is unavailable. Please see the front desk.',
      },
      {
        kind: 'Connection',
        name: 'Kiosk rate limiting -> shared abuse protection',
        status: kioskLimiterStatus ? 'Connected' : 'Failed',
        description: 'Lookup and check-in share an atomic SQLite sliding window across workers on this host. Cross-host deployments require a distributed store.',
        connectedComponents: ['Kiosk lookup API', 'Kiosk check-in API', 'SharedRateLimiter', 'SQLite request_attempts'],
        informationExchanged: 'Hashed proxy-provided client key (or a conservative common bucket), attempt count, and retry window. Patient lookup digits are never keys.',
        evidence: kioskLimiterStatus ? [
          `Shared rate-limit storage was readable at ${kioskLimiterStatus.checkedAt}.`,
          'BEGIN IMMEDIATE serializes concurrent worker updates; both kiosk routes fail closed if the store is unavailable.',
          'The eight-request/60-second window is shared by lookup and check-in. Configure KIOSK_TRUSTED_IP_HEADER only behind a proxy that overwrites it.',
        ] : ['The shared rate-limit store could not be read. Kiosk requests are refused while protection is unavailable.'],
        lastTestedAt: kioskLimiterStatus?.checkedAt ?? checkedAt,
        missingRequirement: kioskLimiterStatus ? null : 'Restore writable persistent KIOSK_RATE_LIMIT_DB_PATH storage shared by every local worker.',
        safeErrorMessage: kioskLimiterStatus ? null : 'Check-in is temporarily unavailable. Please see the front desk.',
      },
      {
        kind: 'Connection',
        name: 'Booking and kiosk -> audit event API',
        status: !auditStatus ? 'Failed' : !auditStatus.chainValid ? 'Failed' : latestBookingAudit?.result === 'success' && latestSuccessfulKioskCheckIn ? 'Connected' : 'Partly Connected',
        description: auditStatus?.chainValid
          ? 'Booking and kiosk events are appended by their server-side handlers; browser clients cannot claim trusted outcomes.'
          : 'The audit database could not be verified.',
        connectedComponents: ['POST /api/appointments', 'POST /api/kiosk/lookup', 'POST /api/kiosk/check-in', 'server-side audit store', 'SQLite audit_log'],
        informationExchanged: 'Server-selected action, result, and constrained appointment reference; patient contact and verification digits are excluded.',
        evidence: [
          'Appointment creation and kiosk outcomes are audited only by server handlers after their authoritative store operation.',
          'POST /api/audit-log requires an administrator session and accepts only administrative events; unauthenticated client-asserted booking, kiosk, and payment outcomes are rejected.',
          latestBookingAudit
            ? `Latest booking audit: ${latestBookingAudit.result} at ${latestBookingAudit.occurredAt}.`
            : 'No successful booking event has been recorded.',
          latestSuccessfulKioskCheckIn
            ? `Latest successful kiosk check-in audit: ${latestSuccessfulKioskCheckIn.occurredAt}.`
            : 'No kiosk event has been recorded.',
          auditStatus?.chainValid ? 'The audit hash chain passed verification during this status request.' : 'Audit chain validation failed or storage is unavailable.',
        ],
        lastTestedAt: latestSuccessfulKioskCheckIn?.occurredAt ?? latestBookingAudit?.occurredAt ?? null,
        missingRequirement: !auditStatus?.chainValid
          ? 'Restore readable audit storage and a valid chain.'
          : latestBookingAudit?.result !== 'success' || !latestSuccessfulKioskCheckIn
            ? 'Complete a successful booking and kiosk check-in to verify both server-side audit producers.'
            : null,
        safeErrorMessage: !auditStatus?.chainValid
          ? 'The activity could not be recorded. Contact the system administrator if it persists.'
          : latestBookingAudit?.result === 'success' && latestSuccessfulKioskCheckIn ? null : 'The activity could not be recorded. Contact the system administrator if it persists.',
      },
      {
        kind: 'Connection',
        name: 'Admin portal -> audit read API',
        status: auditStatus?.chainValid ? 'Connected' : 'Failed',
        description: auditStatus?.chainValid ? 'The administrator cookie is accepted and the audit store is readable with a valid chain; audit reads independently enforce the same guard.' : 'Audit reads cannot establish a healthy readable audit chain.',
        connectedComponents: ['Admin portal', 'HttpOnly admin cookie', '/api/audit-log GET', 'SQLite audit_log'],
        informationExchanged: 'Up to 500 audit events and a full-chain validity result; no-cache response.',
        evidence: ['Both GET /api/system-status and GET /api/audit-log call verifyAdminSession.', 'The audit-read route independently checks the administrator cookie.'],
        lastTestedAt: checkedAt,
        missingRequirement: auditStatus?.chainValid ? null : 'Restore a readable audit store and investigate chain verification failures.',
        safeErrorMessage: auditStatus?.chainValid ? null : 'Audit records could not be verified.',
      },
      {
        kind: 'Connection',
        name: 'Admin portal -> System Status API',
        status: 'Connected',
        description: 'This page obtained the status response using the accepted admin session.',
        connectedComponents: ['SystemStatusViewer', '/api/system-status', 'HttpOnly admin cookie'],
        informationExchanged: 'Component statuses, evidence, configuration presence, last test timestamps, and safe errors; no secret values.',
        evidence: ['SystemStatusViewer requests /api/system-status with cache disabled.', 'This authorized request reached the response-building path.'],
        lastTestedAt: checkedAt,
        missingRequirement: null,
        safeErrorMessage: null,
      },
      {
        kind: 'Connection',
        name: 'CEU form -> Stripe PaymentIntent',
        status: !paymentsConfigured || !stripeModesMatch ? 'Failed' : ceuSetupVerified ? 'Connected' : 'Partly Connected',
        description: ceuSetupVerified ? 'The application handler created a provider PaymentIntent and atomically persisted its pending registration and audit evidence for the current key configuration. Payment settlement is verified separately.' : 'The CEU handler is available, but no successful persisted PaymentIntent setup has been verified for the current key configuration.',
        connectedComponents: ['CEU PaymentForm', '/api/stripe/payment_intent', 'Stripe PaymentIntents API'],
        informationExchanged: 'Validated learner and topic data to the server; server-selected amount/currency and metadata to Stripe; client secret back to browser. Card data remains with Stripe.',
        evidence: [
          'The legacy workflow verifier exercises POST /api/stripe/payment_intent. The separate development learning workspace uses authenticated sandbox purchases; its demo receipts are not counted as approved CEU enrollment.',
          'The handler validates learner details and server-selected price; only a successful provider response plus an atomic registration and audit write creates setup evidence.',
          ...(ceuSetupVerified && latestCeuPaymentSetup ? [`PaymentIntent setup was recorded at ${latestCeuPaymentSetup.createdAt} in ${latestCeuPaymentSetup.livemode ? 'live' : 'test'} mode. This does not confirm payment or enrollment.`] : ['No matching successful setup receipt is available. The separate connectivity probe does not create setup evidence.']),
        ],
        lastTestedAt: ceuSetupVerified ? latestCeuPaymentSetup?.createdAt ?? null : null,
        missingRequirement: ceuSetupVerified ? null : !paymentsConfigured || !stripeModesMatch
          ? 'Configure matching Stripe secret and publishable keys.'
          : 'Complete CEU payment setup through the application form or the development workflow verifier; Stripe connectivity checks alone do not verify this handler.',
        safeErrorMessage: ceuSetupVerified ? null : 'Payment could not be started. Please retry later or contact the clinic.',
      },
      {
        kind: 'Connection',
        name: 'Stripe test-mode API connectivity',
        status: stripeSetupStatus,
        description: stripeSetupStatus === 'Connected'
          ? 'The configured test-mode Stripe API accepted a test intent and the server confirmed its cancellation; no payment was collected.'
          : stripeSetupStatus === 'Failed'
            ? !paymentsConfigured
              ? 'Required Stripe key variables are not both present.'
              : stripeConnectivityFresh
                ? 'Stripe test-mode connectivity or safe cancellation failed.'
                : 'Stripe key configuration is incomplete or inconsistent.'
            : stripeTestKeysConfigured
              ? latestStripeApiConnectivityCheck
                ? `The last recorded Stripe API check ${latestStripeApiConnectivityCheck.result === 'success' ? 'passed' : 'failed'}, but its 15-minute freshness window has expired. Run the check again for current connectivity.`
                : 'Test-mode credentials are configured, but no safe create-and-cancel check has been recorded.'
              : 'A test-mode Stripe key pair is not configured in this environment.',
        connectedComponents: ['SystemStatusViewer', 'POST /api/system-status/stripe-test', 'Stripe PaymentIntents API'],
        informationExchanged: 'A server-created USD 1 test PaymentIntent is immediately canceled; no payment method, learner details, client secret, or payment result is exchanged.',
        evidence: [
          stripeSetupStatus === 'Connected' && latestStripeApiConnectivityCheck
            ? `A test-mode PaymentIntent was created and canceled at ${latestStripeApiConnectivityCheck.checkedAt}; no payment was collected.`
            : stripeSetupStatus === 'Failed' && stripeConnectivityFresh
              ? 'The latest safe test-mode connectivity check failed; provider error details are not exposed.'
              : latestStripeApiConnectivityCheck
                ? `Previous check: ${latestStripeApiConnectivityCheck.result} at ${latestStripeApiConnectivityCheck.checkedAt}. It is outside the 15-minute freshness window; stored payment and enrollment evidence is unchanged.`
                : 'No PaymentIntent create-and-cancel check has been recorded.',
        ],
        lastTestedAt: latestStripeApiConnectivityCheck?.checkedAt ?? null,
        missingRequirement: stripeSetupStatus === 'Connected'
          ? null
          : !stripeTestKeysConfigured
            ? 'Configure matching Stripe test-mode secret and publishable keys in development.'
            : 'Run a safe test-mode PaymentIntent create-and-cancel check from this dashboard.',
        safeErrorMessage: stripeSetupStatus === 'Connected' ? null : 'Current Stripe API connectivity needs verification. This check does not collect payment or remove earlier payment/enrollment records.',
        ...(stripeTestAvailable ? { testAction: 'stripe-test' } : {}),
      },
      {
        kind: 'Connection',
        name: 'Stripe.js outcome -> audit log',
        status: !auditStatus?.chainValid ? 'Failed' : stripeWebhookConfigured && latestVerifiedStripeEvent ? 'Connected' : 'Partly Connected',
        description: latestVerifiedStripeEvent
          ? 'The server has recorded a Stripe outcome after validating its webhook signature.'
          : 'Browser payment results are not trusted for audit; the server records only signature-verified Stripe webhook events.',
        connectedComponents: ['Stripe.js', 'CEU PaymentForm', '/api/stripe/webhook', 'verified_stripe_events', 'SQLite audit_log'],
        informationExchanged: 'Stripe-signed event ID, payment-intent ID, allowlisted topic, and server-mapped outcome; no card data or client-supplied result.',
        evidence: [
          'CEU screen queries server payment status and does not create client-asserted audit events or claim enrollment.',
          'POST /api/stripe/webhook verifies the Stripe signature, checks topic/currency/amount, and records audit plus event deduplication atomically.',
          latestVerifiedStripeEvent
            ? `Latest signature-verified Stripe outcome: ${latestVerifiedStripeEvent.action} (${latestVerifiedStripeEvent.result}) at ${latestVerifiedStripeEvent.occurredAt}; ${latestVerifiedStripeEvent.livemode ? 'live mode' : 'test mode'}.`
            : stripeWebhookConfigured
              ? 'Webhook secret is configured, but no signature-verified payment event has been recorded yet.'
              : 'No Stripe webhook secret is configured; no payment outcome is considered verified.',
        ],
        lastTestedAt: latestVerifiedStripeEvent?.occurredAt ?? null,
        missingRequirement: !auditStatus?.chainValid
          ? 'Restore readable audit storage and a valid chain.'
          : !stripeWebhookConfigured
            ? 'Configure STRIPE_WEBHOOK_SECRET for the Stripe webhook endpoint.'
            : !latestVerifiedStripeEvent
              ? 'Receive and persist a signature-verified Stripe payment event.'
              : null,
        safeErrorMessage: 'Payment status could not be confirmed. Check payment status before retrying.',
      },
      {
        kind: 'Connection',
        name: 'Verified payment -> CEU enrollment',
        status: auditStatus?.chainValid !== true ? 'Failed' : latestCeuEnrollment ? 'Connected' : 'Partly Connected',
        description: latestCeuEnrollment
          ? `A signature-verified payment created a durable enrollment for topic ${latestCeuEnrollment.topicId}.`
          : !stripeWebhookConfigured
            ? 'The enrollment service is implemented, but Stripe webhook verification is not configured in this environment.'
            : 'No successful signed-payment enrollment has been observed in this application database.',
        connectedComponents: ['CEU PaymentForm', '/api/stripe/payment_intent', '/api/stripe/webhook', '/api/stripe/payment_status', 'SQLite ceu_enrollments', 'SQLite audit_log'],
        informationExchanged: 'Validated learner name/email, allowlisted topic, server-generated registration ID, Stripe PaymentIntent ID, and signed settlement outcome. Card details remain with Stripe.',
        evidence: [
          'CEU PaymentForm submits learner name, email, and selected topic to POST /api/stripe/payment_intent; the server validates them and stores a pending registration linked to the Stripe PaymentIntent.',
          'POST /api/stripe/webhook verifies Stripe signatures and matching topic/payment details, then atomically stores the successful payment audit event and finalizes enrollment; webhook retries are idempotent.',
          'GET /api/stripe/payment_status returns enrollment status only when the Stripe intent, registration reference, and topic match.',
          latestCeuEnrollment
            ? `Latest enrolled topic: ${latestCeuEnrollment.topicId}; enrollment confirmed at ${latestCeuEnrollment.enrolledAt}. Learner contact details are not included in status evidence.`
            : 'No signature-verified successful CEU enrollment has been recorded in this application database.',
        ],
        lastTestedAt: latestCeuEnrollment?.enrolledAt ?? null,
        missingRequirement: latestCeuEnrollment
          ? null
          : !stripeWebhookConfigured
            ? 'Configure STRIPE_WEBHOOK_SECRET, then receive a matching signed successful-payment event.'
            : 'Record a successful signature-verified CEU payment in this application database.',
        safeErrorMessage: 'Payment or enrollment could not be confirmed. Do not retry until you confirm the result with the clinic.',
      },
      {
        kind: 'Connection',
        name: 'CEU completion/attendance -> certificate issuance',
        status: 'Planned',
        description: 'The development workspace supports video progress, a final exam and non-credit demo certificates. Approved CE certificate issuance awaits course and provider approval details.',
        connectedComponents: ['SQLite ceu_enrollments', 'course completion/attendance service', 'certificate issuer'],
        informationExchanged: 'Would require a verified enrollment ID, completion/attendance evidence, and an issued certificate reference.',
        evidence: ['Development-only demo courses use authenticated accounts, signed sandbox payment events, saved video progress and server-graded exams. Their sample certificates explicitly award no approved CE credit.', 'No approved course numbers, credit hours or provider approval details have been configured.'],
        lastTestedAt: null,
        missingRequirement: 'Provide course/provider approval identifiers and approved credit hours, then configure and verify real course content and certificate issuance.',
        safeErrorMessage: null,
      },
      {
        kind: 'Connection',
        name: 'Patient identity provider -> kiosk verification',
        status: 'Planned',
        description: 'The fictional demo code flow is available; a real SMS verification provider is not connected.',
        connectedComponents: ['Future SMS verification provider', 'kiosk verification API'],
        informationExchanged: 'The selected SMS service must deliver codes to the registered phone and confirm them server-side before real appointment access.',
        evidence: ['The current demo displays codes only for marked fictional patients and does not send an SMS or prove possession of a real phone.'],
        lastTestedAt: null,
        missingRequirement: 'Select an SMS verification provider and configure/test real code delivery and server-side verification.',
        safeErrorMessage: 'We could not verify your identity. Please see the front desk.',
      },
      {
        kind: 'Connection',
        name: 'Patient management -> durable records and audit',
        status: patientWorkflowVerified ? 'Connected' : 'Partly Connected',
        description: 'The administrator patient screen reads durable patient records and registers new records through an authorized API.',
        connectedComponents: ['Admin portal patient screen', 'patient API', 'durable patient store', 'audit log'],
        informationExchanged: 'Validated patient name and phone fields are sent over the admin session; the API returns the generated record and writes a detail-free audit event.',
        evidence: [
          `The durable patient store contains ${clinicRecordCounts?.patients ?? 0} records.`,
          latestPatientRecordAudit
            ? `Latest patient-record event: ${latestPatientRecordAudit.result}; audit chain ${auditStatus?.chainValid ? 'valid' : 'invalid'}.`
            : 'No successful patient creation has been recorded yet.',
        ],
        lastTestedAt: latestPatientRecordAudit?.occurredAt ?? null,
        missingRequirement: patientWorkflowVerified ? null : 'Complete a patient registration from the admin screen and verify the returned row and audit event.',
        safeErrorMessage: patientWorkflowVerified ? null : 'Patient records could not be loaded or saved.',
      },
      {
        kind: 'Connection',
        name: 'Staff management -> durable records and audit',
        status: staffWorkflowVerified ? 'Connected' : 'Partly Connected',
        description: 'The administrator staff screen reads the durable directory and adds directory records through an authorized API.',
        connectedComponents: ['Admin portal staff screen', 'staff API', 'durable staff store', 'audit log'],
        informationExchanged: 'Validated directory name, role, and hours are sent over the admin session; the API returns the generated directory record and writes a detail-free audit event.',
        evidence: [
          `The durable staff directory contains ${clinicRecordCounts?.staff ?? 0} records.`,
          latestStaffRecordAudit
            ? `Latest staff-record event: ${latestStaffRecordAudit.result}; audit chain ${auditStatus?.chainValid ? 'valid' : 'invalid'}.`
            : 'No successful staff creation has been recorded yet.',
        ],
        lastTestedAt: latestStaffRecordAudit?.occurredAt ?? null,
        missingRequirement: staffWorkflowVerified ? null : 'Complete a staff-directory addition from the admin screen and verify the returned row and audit event.',
        safeErrorMessage: staffWorkflowVerified ? null : 'Staff records could not be loaded or saved.',
      },
      {
        kind: 'Connection',
        name: 'Billing -> durable financial records and audit',
        status: 'Planned',
        description: 'Billing values are display-only; invoice, refund, and payment controls have no clinic billing service.',
        connectedComponents: ['Admin portal billing screen', 'billing API', 'financial record store', 'audit log'],
        informationExchanged: 'Would require authorized financial operation, verified payment reference, durable result, and safe audit metadata.',
        evidence: ['portal/page.tsx renders static billingItems; the prototype has no invoice, refund, or billing mutation route.'],
        lastTestedAt: null,
        missingRequirement: 'Define financial record workflows and permission rules before implementing audited billing operations.',
        safeErrorMessage: 'The billing request could not be completed.',
      },
      {
        kind: 'Connection',
        name: 'Appointment changes -> shared storage and audit',
        status: appointmentWorkflowVerified ? 'Connected' : 'Partly Connected',
        description: 'Authorized administrators can reschedule or cancel eligible appointments in shared SQLite storage; cancellation preserves the record and releases the slot.',
        connectedComponents: ['Admin appointment screen', 'appointment API', 'appointment database', 'audit log'],
        informationExchanged: 'The admin route receives appointment ID and validated date/time/practitioner changes or a cancellation request; it returns the updated durable record and appends a safe audit summary.',
        evidence: [
          `${appointmentStoreStatus?.appointmentCount ?? 0} appointment records are available in shared storage.`,
          latestAdminAppointmentAudit
            ? `Latest administrator appointment event: ${latestAdminAppointmentAudit.action} (${latestAdminAppointmentAudit.result}); audit chain ${auditStatus?.chainValid ? 'valid' : 'invalid'}.`
            : 'No administrator reschedule or cancellation has been recorded yet.',
        ],
        lastTestedAt: latestAdminAppointmentAudit?.occurredAt ?? null,
        missingRequirement: appointmentWorkflowVerified ? null : 'Complete an administrator reschedule or cancellation and verify the saved result and audit event.',
        safeErrorMessage: appointmentWorkflowVerified ? null : 'Appointment changes could not be verified.',
      },
      {
        kind: 'Connection',
        name: 'Application -> monitoring and alerting',
        status: 'Planned',
        description: 'The status dashboard is an admin view, not an alerting or production-monitoring service.',
        connectedComponents: ['Next.js application', 'monitoring service', 'alerting service'],
        informationExchanged: 'Application sends allowlisted JSON {eventId,occurredAt,environment,service,severity,code}; provider returns {accepted,eventId,incidentId,receivedAt}. No patient, payment, or credential data belongs in these events.',
        evidence: [
          'No monitoring endpoint or alert-delivery integration is configured; no external event is sent.',
          'The server adapter allowlists event fields and validates that a provider receipt echoes the event ID.',
          'Development test fixtures are labeled simulated and do not change this connection status.',
        ],
        lastTestedAt: null,
        missingRequirement: 'Choose and configure an external monitoring/alerting service and define operational alerts.',
        safeErrorMessage: 'Monitoring and alerting are unavailable. Contact the system administrator.',
      },
      {
        kind: 'Connection',
        name: 'Database -> backups and recovery',
        status: backupReceipt ? 'Partly Connected' : 'Unknown',
        description: backupReceipt
          ? 'A recent local snapshot passed isolated restore verification. Managed scheduling, protected off-host storage, retention and separate-host recovery still need configuration.'
          : 'Online SQLite snapshots and an isolated restore verifier are implemented; run a local backup check, then configure managed disaster recovery.',
        connectedComponents: ['SQLite appointment/audit stores', 'npm run backup', 'isolated restore verifier'],
        informationExchanged: 'Private database snapshots, SHA-256 checksums, integrity checks, and full audit-chain verification. No patient data is returned to this dashboard.',
        evidence: [
          'npm run backup includes committed WAL contents using the SQLite backup API, restores disposable copies, and checks their integrity and audit chain.',
          backupReceipt ? `A backup and isolated restore check completed at ${backupReceipt.checkedAt}; snapshot checksums were rechecked during this request.` : 'No intact matching backup with a restore receipt from the last 24 hours is available.',
          'Local snapshots are consistent per database; use a maintenance window for cross-database consistency. A local snapshot alone does not establish disaster recovery.',
        ],
        lastTestedAt: backupReceipt?.checkedAt ?? null,
        missingRequirement: backupReceipt
          ? 'Keep local backups current; configure scheduling, encrypted off-host copies and retention, and test recovery on a separate host.'
          : 'Run npm run backup with a protected CLINIC_BACKUP_DIR; configure scheduling, encrypted off-host copies and retention, and test recovery on a separate host.',
        safeErrorMessage: backupReceipt ? null : 'A recent verified backup is unavailable.',
      },
      ...learningStatusItems(auditStatus?.chainValid === true),
    ], stripeWebhookConfigured),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
