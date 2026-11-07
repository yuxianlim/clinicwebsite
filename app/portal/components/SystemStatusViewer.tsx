'use client';

import { useEffect, useState } from 'react';

type ConnectionStatus = 'Connected' | 'Partly Connected' | 'Planned' | 'Unknown' | 'Failed';

type SystemItem = {
  kind: 'Component' | 'Connection';
  name: string;
  status: ConnectionStatus;
  description: string;
  connectedComponents: string[];
  informationExchanged: string;
  evidence: string[];
  lastTestedAt: string | null;
  missingRequirement: string | null;
  safeErrorMessage: string | null;
  testSource: string;
  dependencyGroup?: string;
  blockerCategory?: string | null;
  testAction?: 'stripe-test';
};

type IntegrationSimulationTarget =
  | 'identity-provider'
  | 'membership-scanner'
  | 'ubuntu-host'
  | 'database-server'
  | 'monitoring-alerts';

type IntegrationSimulationResult = {
  simulationId: string;
  label: 'SIMULATED_DEVELOPMENT_INPUT';
  source: 'Development Simulation';
  target: IntegrationSimulationTarget;
  generatedAt: string;
  contractProcessed: boolean;
  result: string;
  affectsConnectionStatus: false;
};

type SystemStatus = {
  checkedAt: string;
  environment: string;
  developmentIntegrationSimulatorsEnabled?: boolean;
  items: SystemItem[];
};

const STATUS_REFRESH_INTERVAL_MS = 30_000;

const isSystemStatus = (value: unknown): value is SystemStatus => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SystemStatus>;
  return typeof candidate.checkedAt === 'string'
    && typeof candidate.environment === 'string'
    && (candidate.developmentIntegrationSimulatorsEnabled === undefined
      || typeof candidate.developmentIntegrationSimulatorsEnabled === 'boolean')
    && Array.isArray(candidate.items)
    && candidate.items.every((item) => (
      item !== null
      && typeof item === 'object'
      && ['Connected', 'Partly Connected', 'Planned', 'Unknown', 'Failed'].includes(item.status)
      && typeof item.name === 'string'
      && typeof item.description === 'string'
      && Array.isArray(item.connectedComponents)
      && typeof item.informationExchanged === 'string'
      && Array.isArray(item.evidence)
      && typeof item.testSource === 'string'
    ));
};

const statuses: { id: ConnectionStatus; color: string }[] = [
  { id: 'Connected', color: 'text-emerald-300' },
  { id: 'Partly Connected', color: 'text-amber-300' },
  { id: 'Planned', color: 'text-sky-300' },
  { id: 'Unknown', color: 'text-slate-300' },
  { id: 'Failed', color: 'text-rose-300' },
];

const integrationSimulations: { target: IntegrationSimulationTarget; label: string }[] = [
  { target: 'identity-provider', label: 'Patient identity provider' },
  { target: 'membership-scanner', label: 'Membership scanner' },
  { target: 'ubuntu-host', label: 'Ubuntu host health response' },
  { target: 'database-server', label: 'Database server health response' },
  { target: 'monitoring-alerts', label: 'Monitoring event and receipt' },
];

type WorkflowTestStatus = 'Passed' | 'Failed' | 'Not Tested' | 'Planned' | 'Not Applicable';

const workflowTestStatus = (status: ConnectionStatus): WorkflowTestStatus => {
  if (status === 'Connected') return 'Passed';
  if (status === 'Failed') return 'Failed';
  if (status === 'Planned') return 'Planned';
  return 'Not Tested';
};

const simulationPayload = (target: IntegrationSimulationTarget) => {
  const now = new Date();
  const timestamp = now.toISOString();
  const simulationId = `sim-${now.getTime()}`;
  switch (target) {
    case 'identity-provider':
      return {
        iss: 'https://identity.example.invalid',
        sub: `${simulationId}-subject`,
        aud: 'clinic-kiosk-development',
        iat: Math.floor(now.getTime() / 1000),
        exp: Math.floor(now.getTime() / 1000) + 300,
        nonce: `${simulationId}-nonce`,
        email_verified: true,
      };
    case 'membership-scanner':
      return {
        deviceId: 'SIMULATED-SCANNER-01',
        scanId: `${simulationId}-scan`,
        membershipToken: `${simulationId}-fictional-token`,
        scannedAt: timestamp,
      };
    case 'ubuntu-host':
    case 'database-server':
      return { status: 'ok', component: target };
    case 'monitoring-alerts': {
      const eventId = `${simulationId}-event`;
      return {
        event: {
          eventId,
          occurredAt: timestamp,
          environment: 'development',
          service: 'clinic-application',
          severity: 'warning',
          code: 'SIMULATED_HEALTH_WARNING',
        },
        receipt: {
          accepted: true,
          eventId,
          incidentId: `${simulationId}-incident`,
          receivedAt: timestamp,
        },
      };
    }
  }
};

export default function SystemStatusViewer() {
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [testingStripe, setTestingStripe] = useState(false);
  const [stripeTestMessage, setStripeTestMessage] = useState('');
  const [integrationTestsRunning, setIntegrationTestsRunning] = useState(false);
  const [integrationTestError, setIntegrationTestError] = useState('');
  const [integrationTestResults, setIntegrationTestResults] = useState<IntegrationSimulationResult[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      if (active) setRefreshing(true);
      try {
        const response = await fetch('/api/system-status', { cache: 'no-store' });
        if (!response.ok) throw new Error('Administrator access is required to view system status.');
        const data: unknown = await response.json();
        if (!isSystemStatus(data)) throw new Error('System status response was invalid. Reload the page or contact the system administrator.');
        if (active) {
          setSystemStatus(data);
          setError('');
        }
      } catch (requestError: unknown) {
        if (active) setError(requestError instanceof Error ? requestError.message : 'System status is unavailable.');
      } finally {
        if (active) setRefreshing(false);
      }
    };

    void refresh();
    const interval = window.setInterval(() => void refresh(), STATUS_REFRESH_INTERVAL_MS);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [refreshKey]);

  const runStripeConnectivityTest = async () => {
    setTestingStripe(true);
    setStripeTestMessage('');
    try {
      const response = await fetch('/api/system-status/stripe-test', { method: 'POST' });
      const data = await response.json() as { error?: string; result?: string };
      if (!response.ok) throw new Error(data.error ?? 'Stripe test could not be completed.');
      setStripeTestMessage(data.result ?? 'Stripe test completed.');
      setRefreshKey((current) => current + 1);
    } catch (requestError: unknown) {
      setStripeTestMessage(requestError instanceof Error ? requestError.message : 'Stripe test could not be completed.');
    } finally {
      setTestingStripe(false);
    }
  };

  const runIntegrationSimulations = async () => {
    setIntegrationTestsRunning(true);
    setIntegrationTestError('');
    setIntegrationTestResults([]);
    try {
      const results: IntegrationSimulationResult[] = [];
      for (const integration of integrationSimulations) {
        const response = await fetch('/api/system-status/integration-simulation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target: integration.target, payload: simulationPayload(integration.target) }),
        });
        const data = await response.json() as { error?: string; simulation?: IntegrationSimulationResult };
        if (!response.ok || !data.simulation) {
          throw new Error(data.error ?? `Simulation failed for ${integration.label}.`);
        }
        results.push(data.simulation);
        setIntegrationTestResults([...results]);
      }
    } catch (requestError: unknown) {
      setIntegrationTestError(requestError instanceof Error ? requestError.message : 'Development integration simulation failed.');
    } finally {
      setIntegrationTestsRunning(false);
    }
  };

  return (
    <section className="space-y-5">
      <div>
        <h3 className="text-xl font-semibold text-white">Architecture Test Center</h3>
        <p className="mt-1 text-sm text-slate-400">Connected requires verifiable evidence. Not tested during this check means no runtime result is available; Planned means required but not implemented, with no delivery date implied.</p>
        {systemStatus ? (
          <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950/40 p-4">
            <h4 className="font-semibold text-white">Workflow evidence state</h4>
            <p className="mt-1 text-xs text-slate-400">Passed/Failed reflect the latest verifiable dashboard evidence. Partly Connected and Unknown remain Not Tested until end-to-end evidence is recorded.</p>
            <p className="mt-2 text-xs text-slate-500">Test outcomes: Passed · Failed · Not Tested · Planned · Not Applicable</p>
            <ul className="mt-3 grid gap-2 md:grid-cols-2">
              {systemStatus.items.filter((item) => item.kind === 'Connection').map((item) => {
                const result = workflowTestStatus(item.status);
                const color = result === 'Passed' ? 'text-emerald-300' : result === 'Failed' ? 'text-rose-300' : result === 'Planned' ? 'text-sky-300' : 'text-amber-300';
                return (
                  <li key={item.name} className="flex items-start justify-between gap-4 rounded-lg bg-slate-900 px-3 py-2 text-sm">
                    <span className="text-slate-200">{item.name}</span>
                    <span className={`shrink-0 font-semibold ${color}`}>{result}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
        {systemStatus?.items.some((item) => item.testAction === 'stripe-test') ? (
          <button
            type="button"
            onClick={() => void runStripeConnectivityTest()}
            disabled={testingStripe}
            className="mt-3 rounded-lg bg-[#556B42] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {testingStripe ? 'Testing Stripe test mode…' : 'Run safe Stripe test-mode check'}
          </button>
        ) : null}
        {stripeTestMessage ? <p className="mt-2 text-sm text-slate-300" role="status">{stripeTestMessage}</p> : null}
        {systemStatus?.developmentIntegrationSimulatorsEnabled ? (
          <div className="mt-5 rounded-xl border border-amber-700/70 bg-amber-950/30 p-4">
            <h4 className="font-semibold text-amber-200">Development-only workflow simulations</h4>
            <p className="mt-1 text-sm text-amber-100/80">
              Fictional inputs in the documented format are sent to the application-side adapters. Source is labeled Development Simulation, no device/provider is contacted, and these results never mark external connections Connected.
            </p>
            <button
              type="button"
              onClick={() => void runIntegrationSimulations()}
              disabled={integrationTestsRunning}
              className="mt-3 rounded-lg border border-amber-600 px-4 py-2 text-sm font-semibold text-amber-100 disabled:opacity-60"
            >
              {integrationTestsRunning ? 'Running simulations…' : 'Run documented-format simulations'}
            </button>
            {integrationTestError ? <p className="mt-3 text-sm text-rose-200" role="alert">{integrationTestError}</p> : null}
            {integrationTestResults.length ? (
              <ul className="mt-3 space-y-2" aria-live="polite">
                {integrationTestResults.map((result) => (
                  <li key={result.simulationId} className="rounded-lg bg-slate-950/50 p-3 text-sm text-slate-200">
                    <span className="font-semibold text-amber-200">{result.source} — {integrationSimulations.find((item) => item.target === result.target)?.label}</span>
                    <span className="mt-1 block">{result.result}</span>
                    <span className="mt-1 block text-xs text-slate-400">
                      {result.contractProcessed ? 'Passed' : 'Failed'} · audit source: {result.source} · actual connection status unchanged · {new Date(result.generatedAt).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        {systemStatus?.environment === 'Development' && !systemStatus.developmentIntegrationSimulatorsEnabled ? (
          <p className="mt-4 text-sm text-slate-400">
            Development integration simulations are disabled. Set <code>ENABLE_DEVELOPMENT_INTEGRATION_SIMULATORS=true</code> in the server environment and restart the development server to enable them.
          </p>
        ) : null}
      </div>
      {systemStatus ? (
        <div className="flex flex-wrap gap-x-6 gap-y-2 border-y border-slate-700 py-3 text-sm text-slate-400">
          <span>Environment: <strong className="font-medium text-slate-200">{systemStatus.environment}</strong></span>
          <span>Checked: <time dateTime={systemStatus.checkedAt}>{new Date(systemStatus.checkedAt).toLocaleString()}</time></span>
          <span>{refreshing ? 'Refreshing status...' : 'Auto-refreshes every 30 seconds'}</span>
        </div>
      ) : null}
      {error ? <p className="rounded-lg border border-rose-900 bg-rose-950/30 p-4 text-sm text-rose-200" role="alert">{error}</p> : null}
      {!systemStatus && !error ? <p className="py-6 text-sm text-slate-400">Checking system status...</p> : null}
      {systemStatus ? statuses.map((status) => {
        const items = (Array.isArray(systemStatus.items) ? systemStatus.items : []).filter((item) => item.status === status.id);
        return (
          <section key={status.id} aria-labelledby={`status-${status.id.replaceAll(' ', '-')}`} className="space-y-2">
            <h4 id={`status-${status.id.replaceAll(' ', '-')}`} className={`text-base font-semibold ${status.color}`}>
              {status.id} <span className="font-normal text-slate-400">({items.length})</span>
            </h4>
            {items.length ? (
              <div className="overflow-x-auto rounded-lg border border-slate-700">
                <table className="w-full min-w-[2200px] text-left text-sm">
                  <thead className="bg-slate-800 text-slate-300">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Component / connection</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Dependency group</th>
                      <th className="px-4 py-3 font-semibold">Blocker category</th>
                      <th className="px-4 py-3 font-semibold">Connected components</th>
                      <th className="px-4 py-3 font-semibold">Information exchanged</th>
                      <th className="px-4 py-3 font-semibold">Supporting evidence</th>
                      <th className="px-4 py-3 font-semibold">Last tested</th>
                      <th className="px-4 py-3 font-semibold">Test source</th>
                      <th className="px-4 py-3 font-semibold">Missing requirement</th>
                      <th className="px-4 py-3 font-semibold">Safe error message</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {items.map((item) => (
                      <tr key={`${item.kind}-${item.name}`} className="bg-slate-900/50 align-top text-slate-200">
                        <th scope="row" className="w-56 whitespace-normal px-4 py-3">
                          <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">{item.kind}</span>
                          <span className="font-medium">{item.name}</span>
                          <span className="mt-2 block font-normal text-slate-400">{item.description}</span>
                        </th>
                        <td className={`whitespace-nowrap px-4 py-3 font-semibold ${status.color}`}>{item.status}</td>
                        <td className="w-48 whitespace-normal px-4 py-3 text-slate-300">{item.dependencyGroup ?? 'Core application'}</td>
                        <td className="w-48 whitespace-normal px-4 py-3 text-slate-400">{item.blockerCategory ?? 'None identified'}</td>
                        <td className="w-56 whitespace-normal px-4 py-3 text-slate-300">{item.connectedComponents.join(', ')}</td>
                        <td className="w-64 whitespace-normal px-4 py-3 text-slate-400">{item.informationExchanged}</td>
                        <td className="w-80 whitespace-normal px-4 py-3 text-slate-400">
                          <ul className="list-inside list-disc space-y-1">
                            {item.evidence.map((evidence) => <li key={evidence}>{evidence}</li>)}
                          </ul>
                        </td>
                        <td className="w-48 whitespace-normal px-4 py-3 text-slate-400">
                          {item.lastTestedAt ? <time dateTime={item.lastTestedAt}>{new Date(item.lastTestedAt).toLocaleString()}</time> : 'Not tested during this status check'}
                        </td>
                        <td className="w-64 whitespace-normal px-4 py-3 text-slate-400">{item.testSource}</td>
                        <td className="w-64 whitespace-normal px-4 py-3 text-slate-400">{item.missingRequirement ?? 'None identified for this item.'}</td>
                        <td className="w-64 whitespace-normal px-4 py-3 text-slate-400">{item.safeErrorMessage ?? 'None specified.'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="rounded-lg border border-slate-700 p-4 text-sm text-slate-400">No items in this status.</p>}
          </section>
        );
      }) : null}
    </section>
  );
}