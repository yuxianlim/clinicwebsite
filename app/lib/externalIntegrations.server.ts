import { randomUUID } from 'node:crypto';
import { fictionalWorkflowEnabled } from './deploymentMode';

export const developmentIntegrationSimulatorsEnabled = () => (
  fictionalWorkflowEnabled(process.env.ENABLE_DEVELOPMENT_INTEGRATION_SIMULATORS)
);

export type IntegrationSimulationTarget =
  | 'identity-provider'
  | 'membership-scanner'
  | 'ubuntu-host'
  | 'database-server'
  | 'monitoring-alerts';

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const isNonEmptyString = (value: unknown): value is string => (
  typeof value === 'string' && value.trim().length > 0
);

const isIsoTimestamp = (value: unknown): value is string => (
  typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  && Number.isFinite(new Date(value).getTime())
);

const parseTimestamp = (value: unknown) => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) return null;
  return value;
};

export type NormalizedIdentityAssertion = {
  issuer: string;
  subject: string;
  audience: string;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
  emailVerified: boolean;
};

export const normalizeIdentityAssertion = (value: unknown): NormalizedIdentityAssertion | null => {
  if (!isRecord(value)) return null;
  const issuedAt = parseTimestamp(value.iat);
  const expiresAt = parseTimestamp(value.exp);
  let issuerUrl: URL;
  try {
    if (typeof value.iss !== 'string') return null;
    issuerUrl = new URL(value.iss);
  } catch {
    return null;
  }
  const currentTime = nowSeconds();
  if (
    !isNonEmptyString(value.iss)
    || issuerUrl.protocol !== 'https:'
    || issuerUrl.username !== ''
    || issuerUrl.password !== ''
    || issuerUrl.search !== ''
    || issuerUrl.hash !== ''
    || value.iss.length > 2048
    || !isNonEmptyString(value.sub)
    || value.sub.length > 255
    || !isNonEmptyString(value.aud)
    || value.aud.length > 255
    || !issuedAt
    || !expiresAt
    || expiresAt <= issuedAt
    || issuedAt > currentTime + 60
    || expiresAt <= currentTime
    || !isNonEmptyString(value.nonce)
    || value.nonce.length > 512
    || typeof value.email_verified !== 'boolean'
  ) return null;

  return {
    issuer: value.iss,
    subject: value.sub,
    audience: value.aud,
    issuedAt,
    expiresAt,
    nonce: value.nonce,
    emailVerified: value.email_verified,
  };
};

export type NormalizedMembershipScan = {
  deviceId: string;
  scanId: string;
  membershipToken: string;
  scannedAt: string;
};

export const normalizeMembershipScan = (value: unknown): NormalizedMembershipScan | null => {
  if (
    !isRecord(value)
    || !isNonEmptyString(value.deviceId)
    || value.deviceId.length > 128
    || !isNonEmptyString(value.scanId)
    || value.scanId.length > 128
  ) return null;
  if (!isNonEmptyString(value.membershipToken) || value.membershipToken.length > 512 || !isIsoTimestamp(value.scannedAt)) return null;
  const scannedAt = new Date(value.scannedAt);

  return {
    deviceId: value.deviceId,
    scanId: value.scanId,
    membershipToken: value.membershipToken,
    scannedAt: scannedAt.toISOString(),
  };
};

export type NormalizedHealthProbe = {
  status: 'ok';
  component: 'ubuntu-host' | 'database-server';
};

export const normalizeHealthProbe = (
  value: unknown,
  component: NormalizedHealthProbe['component'],
): NormalizedHealthProbe | null => (
  isRecord(value) && value.status === 'ok' && value.component === component
    ? { status: 'ok', component }
    : null
);

export type MonitoringEvent = {
  eventId: string;
  occurredAt: string;
  environment: string;
  service: string;
  severity: 'info' | 'warning' | 'critical';
  code: string;
};

export const isMonitoringEvent = (value: unknown): value is MonitoringEvent => (
  isRecord(value)
  && isNonEmptyString(value.eventId)
  && value.eventId.length <= 128
  && isIsoTimestamp(value.occurredAt)
  && isNonEmptyString(value.environment)
  && value.environment.length <= 64
  && isNonEmptyString(value.service)
  && value.service.length <= 128
  && (value.severity === 'info' || value.severity === 'warning' || value.severity === 'critical')
  && typeof value.code === 'string'
  && /^[A-Z0-9_]{1,80}$/.test(value.code)
);

export type NormalizedMonitoringReceipt = {
  accepted: true;
  eventId: string;
  incidentId: string;
  receivedAt: string;
};

export const normalizeMonitoringReceipt = (value: unknown): NormalizedMonitoringReceipt | null => {
  if (!isRecord(value) || value.accepted !== true) return null;
  if (
    !isNonEmptyString(value.eventId)
    || !isNonEmptyString(value.incidentId)
    || !isIsoTimestamp(value.receivedAt)
  ) return null;

  return {
    accepted: true,
    eventId: value.eventId,
    incidentId: value.incidentId,
    receivedAt: new Date(value.receivedAt).toISOString(),
  };
};

export const publishMonitoringEvent = async (
  event: MonitoringEvent,
  endpoint: string,
  bearerToken?: string,
): Promise<NormalizedMonitoringReceipt | null> => {
  if (!isMonitoringEvent(event)) throw new Error('Monitoring event format is invalid.');
  const url = new URL(endpoint);
  const protocolAllowed = url.protocol === 'https:'
    || (process.env.NODE_ENV === 'development' && url.protocol === 'http:');
  if (!protocolAllowed || url.username || url.password || url.search || url.hash) {
    throw new Error('Monitoring ingest endpoint configuration is invalid.');
  }

  const response = await fetch(url, {
    method: 'POST',
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(3000),
    headers: {
      'Content-Type': 'application/json',
      ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
    },
    body: JSON.stringify({
      eventId: event.eventId,
      occurredAt: event.occurredAt,
      environment: event.environment,
      service: event.service,
      severity: event.severity,
      code: event.code,
    }),
  });
  if (!response.ok) return null;

  let receipt: unknown;
  try {
    receipt = await response.json();
  } catch {
    return null;
  }
  const normalized = normalizeMonitoringReceipt(receipt);
  return normalized?.eventId === event.eventId ? normalized : null;
};

const nowSeconds = () => Math.floor(Date.now() / 1000);
const nowIso = () => new Date().toISOString();

export const runIntegrationSimulation = (target: IntegrationSimulationTarget, input?: unknown) => {
  const simulationId = randomUUID();
  const generatedAt = nowIso();
  let contractProcessed: boolean;
  let safeResult: string;

  switch (target) {
    case 'identity-provider': {
      const fictionalClaims = input ?? {
        iss: 'https://identity.example.invalid',
        sub: `simulated-subject-${simulationId}`,
        aud: 'clinic-kiosk-development',
        iat: nowSeconds(),
        exp: nowSeconds() + 300,
        nonce: `simulated-nonce-${simulationId}`,
        email_verified: true,
      };
      contractProcessed = normalizeIdentityAssertion(fictionalClaims) !== null;
      safeResult = 'Fictional identity claims matched the documented OIDC claim shape; no signature was verified and no user was authenticated.';
      break;
    }
    case 'membership-scanner': {
      const fictionalScan = input ?? {
        deviceId: 'SIMULATED-SCANNER-01',
        scanId: `simulated-scan-${simulationId}`,
        membershipToken: `fictional-membership-token-${simulationId}`,
        scannedAt: generatedAt,
      };
      contractProcessed = normalizeMembershipScan(fictionalScan) !== null;
      safeResult = 'Fictional scanner input matched the documented device payload shape; no hardware was contacted and no patient lookup or check-in occurred.';
      break;
    }
    case 'ubuntu-host':
    case 'database-server': {
      const healthPayload = input ?? { status: 'ok', component: target };
      contractProcessed = normalizeHealthProbe(healthPayload, target) !== null;
      safeResult = `Fictional ${target} health response matched the documented marker; no host or database service was contacted and no connection status changed.`;
      break;
    }
    case 'monitoring-alerts': {
      const exampleEvent: MonitoringEvent = {
        eventId: `simulated-event-${simulationId}`,
        occurredAt: generatedAt,
        environment: 'development',
        service: 'clinic-application',
        severity: 'warning',
        code: 'SIMULATED_HEALTH_WARNING',
      };
      const eventAndReceipt = isRecord(input) ? input : {};
      const event = input === undefined ? exampleEvent : eventAndReceipt.event;
      const receipt = input === undefined ? {
        accepted: true,
        eventId: exampleEvent.eventId,
        incidentId: `simulated-incident-${simulationId}`,
        receivedAt: generatedAt,
      } : eventAndReceipt.receipt;
      const normalizedReceipt = normalizeMonitoringReceipt(receipt);
      contractProcessed = isMonitoringEvent(event)
        && normalizedReceipt !== null
        && normalizedReceipt.eventId === event.eventId;
      safeResult = 'Fictional monitoring event and receipt matched the documented formats; no external alert was sent.';
      break;
    }
  }

  return {
    simulationId,
    source: 'Development Simulation' as const,
    label: 'SIMULATED_DEVELOPMENT_INPUT' as const,
    target,
    generatedAt,
    contractProcessed,
    result: safeResult,
    affectsConnectionStatus: false as const,
  };
};
