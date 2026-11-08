'use client';

import { useEffect, useState } from 'react';
import DemoAlertInbox from './DemoAlertInbox';

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
  stripeMode?: 'test' | 'live' | 'unconfigured';
  developmentIntegrationSimulatorsEnabled?: boolean;
  developmentWorkflowFixturesEnabled?: boolean;
  items: SystemItem[];
};

const STATUS_REFRESH_INTERVAL_MS = 30_000;
const CHANGE_CHECK_INTERVAL_MS = 2_000;

const isSystemStatus = (value: unknown): value is SystemStatus => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SystemStatus>;
  return typeof candidate.checkedAt === 'string'
    && typeof candidate.environment === 'string'
    && (candidate.developmentIntegrationSimulatorsEnabled === undefined
      || typeof candidate.developmentIntegrationSimulatorsEnabled === 'boolean')
    && (candidate.developmentWorkflowFixturesEnabled === undefined
      || typeof candidate.developmentWorkflowFixturesEnabled === 'boolean')
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
  { id: 'Connected', color: 'text-emerald-700' },
  { id: 'Partly Connected', color: 'text-amber-800' },
  { id: 'Planned', color: 'text-blue-700' },
  { id: 'Unknown', color: 'text-slate-700' },
  { id: 'Failed', color: 'text-rose-700' },
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
  const [query, setQuery] = useState('');
  const [seedingDemo, setSeedingDemo] = useState(false);
  const [demoError, setDemoError] = useState('');
  const [demoResult, setDemoResult] = useState<{ learner: { email: string; password: string }; billing: { staffEmail:string; staffPassword:string }; kiosk: { phone: string; lastFour: string; cardToken: string }; message: string } | null>(null);

  useEffect(() => {
    let active = true;
    let authorizationLost = false;
    let revision = '';
    let checkingChanges = false;
    let lastFullCheck = 0;
    let pendingRefresh = false;
    let refreshingRequest: Promise<boolean> | null = null;
    const controller = new AbortController();
    const readStatus = async (url: string) => {
      const requestController = new AbortController();
      const abort = () => requestController.abort();
      controller.signal.addEventListener('abort', abort, { once: true });
      if (controller.signal.aborted) abort();
      const timeout = window.setTimeout(abort, 15_000);
      try {
        const response = await fetch(url, { cache: 'no-store', signal: requestController.signal });
        const data: unknown = response.ok ? await response.json() : null;
        return { response, data };
      } finally {
        window.clearTimeout(timeout);
        controller.signal.removeEventListener('abort', abort);
      }
    };
    const refresh = async () => {
      pendingRefresh = true;
      if (refreshingRequest) return refreshingRequest;
      refreshingRequest = (async () => {
        let success = false;
        if (active) setRefreshing(true);
        do {
          pendingRefresh = false;
          try {
            const { response, data } = await readStatus('/api/system-status');
            if (response.status === 401 || response.status === 403) {
              authorizationLost = true;
              if (active) setSystemStatus(null);
              throw new Error('Your administrator session has ended. Sign in again to resume live updates.');
            }
            if (!response.ok) throw new Error('System status is temporarily unavailable. The last successful result is shown.');
            if (!isSystemStatus(data)) throw new Error('System status response was invalid. Please retry later.');
            if (active && !authorizationLost) {
              setSystemStatus(data); setError('');
              lastFullCheck = Date.now(); success = true;
            }
          } catch (requestError: unknown) {
            success = false;
            if (active) setError(authorizationLost
              ? 'Your administrator session has ended. Sign in again to resume live updates.'
              : requestError instanceof Error && requestError.name === 'AbortError'
                ? 'Status refresh timed out. Updates will retry automatically.'
                : requestError instanceof Error ? requestError.message : 'Live updates are temporarily unavailable.');
          }
        } while (pendingRefresh && active && !authorizationLost);
        return success;
      })();
      try { return await refreshingRequest; }
      finally { refreshingRequest = null; if (active) setRefreshing(false); }
    };
    const checkChanges = async () => {
      if (!active || checkingChanges || authorizationLost || document.visibilityState === 'hidden') return;
      checkingChanges = true;
      try {
        const { response, data } = await readStatus('/api/system-status/revision');
        if (response.status === 401 || response.status === 403) {
          authorizationLost = true;
          if (active) { setSystemStatus(null); setError('Your administrator session has ended. Sign in again to resume live updates.'); }
          return;
        }
        if (!response.ok) throw new Error('Change detection is unavailable.');
        if (!data || typeof data !== 'object' || !('revision' in data) || typeof data.revision !== 'string' || !/^[0-9a-f]{64}$/.test(data.revision)) throw new Error('Invalid change revision.');
        if (data.revision !== revision || Date.now() - lastFullCheck >= STATUS_REFRESH_INTERVAL_MS)
          if (await refresh()) revision = data.revision;
      } catch {
        if (active && Date.now() - lastFullCheck >= STATUS_REFRESH_INTERVAL_MS) await refresh();
        else if (active) setError('Live change detection is temporarily unavailable. Periodic checks will continue.');
      } finally { checkingChanges = false; }
    };
    const resume = () => {
      if (document.visibilityState !== 'hidden') {
        authorizationLost = false;
        void refresh();
        void checkChanges();
      }
    };
    void checkChanges();
    const interval = window.setInterval(() => void checkChanges(), CHANGE_CHECK_INTERVAL_MS);
    window.addEventListener('focus', resume);
    window.addEventListener('online', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener('focus', resume);
      window.removeEventListener('online', resume);
      document.removeEventListener('visibilitychange', resume);
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
    } catch (requestError: unknown) {
      setStripeTestMessage(requestError instanceof Error ? requestError.message : 'Stripe test could not be completed.');
    } finally {
      setTestingStripe(false);
      setRefreshKey((current) => current + 1);
    }
  };

  const runDemoSetup = async () => {
    setSeedingDemo(true); setDemoError('');
    try {
      const response = await fetch('/api/system-status/demo-setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Demo setup could not complete.');
      setDemoResult(data);
    } catch (error) { setDemoError(error instanceof Error ? error.message : 'Demo setup failed.'); }
    finally { setSeedingDemo(false); setRefreshKey((current) => current + 1); }
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
      setRefreshKey((current) => current + 1);
    }
  };

  return (
    <section className="min-w-0 space-y-5">
      <div>
        <h3 className="text-xl font-semibold text-slate-900">Architecture Test Center</h3>
        <p className="mt-1 text-sm text-slate-600">Connection health, missing requirements, and the latest recorded evidence.</p>
      {systemStatus && (
        <div className="mt-4 space-y-4">
          <nav aria-label="Connection status groups" className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
            {statuses.map((status) => (
              <a key={status.id} href={`#status-${status.id.replaceAll(' ', '-')}`} className="min-w-0 rounded-xl border border-[#dce1e8] bg-white p-3 hover:border-[#dce1e8]">
                <span className={`block text-sm font-medium ${status.color}`}>{status.id}</span>
                <span className="mt-1 block text-2xl font-semibold text-slate-900">{systemStatus.items.filter((item) => item.status === status.id).length}</span>
              </a>
            ))}
          </nav>
          <p className="text-sm leading-6 text-slate-600">Planned items are deferred or need implementation, service setup, hardware or approvals. Unknown means a check has not run or its result has expired. Demo learning has separate evidence rows; simulations do not connect real services.</p>
          <label className="block text-sm font-medium text-slate-700">
            Search connections
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Component, service, or missing requirement" className="mt-2 min-h-11 w-full rounded-lg border border-[#dce1e8] bg-white px-3 text-base text-slate-900 placeholder:text-slate-600" />
          </label>
        </div>
      )}

        {systemStatus ? (
          <details className="mt-4 rounded-xl border border-[#dce1e8] bg-white p-4">
            <summary className="min-h-11 font-semibold text-slate-900">Workflow evidence state <span className="ml-2 text-xs font-normal text-slate-600">Expand overview</span></summary>
            <p className="mt-2 text-sm text-slate-600">Connected reflects the evidence described in each row. Planned means a workflow is deferred or still needs implementation, service setup, hardware or approvals. Unknown means a current result is unavailable or has expired.</p>
            <p className="mt-1 text-xs text-slate-600">Passed/Failed reflect the latest verifiable dashboard evidence. Partly Connected and Unknown remain Not Tested until end-to-end evidence is recorded.</p>
            <p className="mt-2 text-xs text-slate-500">Test outcomes: Passed · Failed · Not Tested · Planned · Not Applicable</p>
            <ul className="mt-3 grid gap-2 md:grid-cols-2">
              {systemStatus.items.filter((item) => item.kind === 'Connection').map((item) => {
                const result = workflowTestStatus(item.status);
                const color = result === 'Passed' ? 'text-emerald-700' : result === 'Failed' ? 'text-rose-700' : result === 'Planned' ? 'text-blue-700' : 'text-amber-800';
                return (
                  <li key={item.name} className="flex items-start justify-between gap-4 rounded-lg bg-white px-3 py-2 text-sm">
                    <span className="text-slate-800">{item.name}</span>
                    <span className={`shrink-0 font-semibold ${color}`}>{result}</span>
                  </li>
                );
              })}
            </ul>
          </details>
        ) : null}
        {systemStatus?.developmentWorkflowFixturesEnabled && <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-5">
          <h4 className="font-semibold text-amber-950">Connect the demo workflows</h4>
          <p className="mt-2 text-sm leading-6 text-amber-950">Create a fictional learner, purchase fixture, completed-video records, a passing exam, a sample certificate and a fictional kiosk code check, simulated ACR1252U / NTAG213 tap, clinic invoices, payments and an overpayment refund. Also run the five development format checks. No Stripe payment, SMS delivery or approved CE credit is claimed. Existing demo setup records are reused.</p>
          <button className="mt-4 min-h-12 rounded-xl bg-[#3158d8] px-5 py-3 font-semibold text-white disabled:opacity-50" disabled={seedingDemo} onClick={() => void runDemoSetup()}>{seedingDemo ? 'Preparing demo records…' : 'Run demo setup'}</button>
          {demoError && <p className="mt-3 text-sm text-rose-800" role="alert">{demoError}</p>}
          {demoResult && <div className="mt-4 space-y-3 text-sm leading-6 text-amber-950" role="status">
            <p>{demoResult.message}</p>
            <p className="break-all">Fictional learner email: <strong>{demoResult.learner.email}</strong><br />Demo-only password: <strong>{demoResult.learner.password}</strong></p>
            <p>Fictional patient phone: <strong>{demoResult.kiosk.phone}</strong> · Last four: <strong>{demoResult.kiosk.lastFour}</strong></p>
            <p className="break-all">Fictional card token (separate card-test patient): <strong>{demoResult.kiosk.cardToken}</strong></p>
            <p className="break-all">Demo billing staff: <strong>{demoResult.billing.staffEmail}</strong> · Password: <strong>{demoResult.billing.staffPassword}</strong>. Open Billing &amp; Payments in the workspace menu.</p>
            <div className="flex flex-wrap gap-4"><a href="/learn" target="_blank" rel="noopener noreferrer" className="min-h-11 py-3 font-semibold text-[#3158d8]">Open demo learner workspace ↗</a><a href="/kiosk" target="_blank" rel="noopener noreferrer" className="min-h-11 py-3 font-semibold text-[#3158d8]">Open demo kiosk ↗</a></div>
          </div>}
        </div>}
        {systemStatus?.developmentIntegrationSimulatorsEnabled && <DemoAlertInbox checkedAt={systemStatus.checkedAt} />}
        {systemStatus?.items.some((item) => item.testAction === 'stripe-test') ? (
          <button
            type="button"
            onClick={() => void runStripeConnectivityTest()}
            disabled={testingStripe}
            className="mt-3 rounded-lg bg-[#3158d8] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {testingStripe ? 'Testing Stripe test mode…' : 'Run safe Stripe test-mode check'}
          </button>
        ) : null}
        {stripeTestMessage ? <p className="mt-2 text-sm text-slate-700" role="status">{stripeTestMessage}</p> : null}
        {systemStatus?.developmentIntegrationSimulatorsEnabled ? (
          <details className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <summary className="min-h-11 font-semibold text-amber-800">Development-only workflow simulations</summary>
            <p className="mt-1 text-sm text-amber-800">
              Fictional inputs in the documented format are sent to the application-side adapters. Source is labeled Development Simulation, no device/provider is contacted, and these results never mark external connections Connected.
            </p>
            <button
              type="button"
              onClick={() => void runIntegrationSimulations()}
              disabled={integrationTestsRunning}
              className="mt-3 rounded-lg border border-amber-200 px-4 py-2 text-sm font-semibold text-amber-800 disabled:opacity-60"
            >
              {integrationTestsRunning ? 'Running simulations…' : 'Run documented-format simulations'}
            </button>
            {integrationTestError ? <p className="mt-3 text-sm text-rose-700" role="alert">{integrationTestError}</p> : null}
            {integrationTestResults.length ? (
              <ul className="mt-3 space-y-2" aria-live="polite">
                {integrationTestResults.map((result) => (
                  <li key={result.simulationId} className="rounded-lg bg-white p-3 text-sm text-slate-800">
                    <span className="font-semibold text-amber-800">{result.source} — {integrationSimulations.find((item) => item.target === result.target)?.label}</span>
                    <span className="mt-1 block">{result.result}</span>
                    <span className="mt-1 block text-xs text-slate-600">
                      {result.contractProcessed ? 'Passed' : 'Failed'} · audit source: {result.source} · actual connection status unchanged · {new Date(result.generatedAt).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </details>
        ) : null}
        {systemStatus?.environment === 'Development' && !systemStatus.developmentIntegrationSimulatorsEnabled ? (
          <p className="mt-4 text-sm text-slate-600">
            Development integration simulations are disabled. Set <code>ENABLE_DEVELOPMENT_INTEGRATION_SIMULATORS=true</code> in the server environment and restart the development server to enable them.
          </p>
        ) : null}
      </div>
      {systemStatus ? (
        <div className="flex flex-wrap gap-x-6 gap-y-2 border-y border-[#dce1e8] py-3 text-sm text-slate-600">
          <span>Environment: <strong className="font-medium text-slate-800">{systemStatus.environment}</strong></span>
          {systemStatus.stripeMode && <span>Stripe: <strong className="font-medium text-slate-800">{systemStatus.stripeMode === 'test' ? 'Sandbox' : systemStatus.stripeMode === 'live' ? 'Live' : 'Not configured'}</strong></span>}
          <span>Checked: <time dateTime={systemStatus.checkedAt}>{new Date(systemStatus.checkedAt).toLocaleString()}</time></span>
          <span>{refreshing ? 'Refreshing status…' : 'Live updates · checks for saved changes every 2 seconds'}</span>
        </div>
      ) : null}
      {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700" role="alert">{error}</p> : null}
      {!systemStatus && !error ? <p className="py-6 text-sm text-slate-600">Checking system status...</p> : null}
      {systemStatus ? statuses.map((status) => {
        const items = systemStatus.items.filter((item) => item.status === status.id
          && [item.name, item.description, item.dependencyGroup, item.missingRequirement].some((value) => value?.toLowerCase().includes(query.trim().toLowerCase())));
        return (
          <section key={status.id} aria-labelledby={`status-${status.id.replaceAll(' ', '-')}`} className="min-w-0 space-y-3 scroll-mt-6">
            <h4 id={`status-${status.id.replaceAll(' ', '-')}`} className={`scroll-mt-6 text-base font-semibold ${status.color}`}>
              {status.id} <span className="font-normal text-slate-600">({items.length})</span>
            </h4>
            {items.length ? (
              <div className="grid min-w-0 gap-3 2xl:grid-cols-2">
                {items.map((item) => (
                  <article key={`${item.kind}-${item.name}`} className="min-w-0 rounded-xl border border-[#dce1e8] bg-white p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 basis-48">
                        <p className="text-xs font-medium uppercase tracking-wider text-slate-600">{item.kind} · {item.dependencyGroup ?? 'Core application'}</p>
                        <h5 className="mt-2 break-words font-semibold text-slate-900">{item.name}</h5>
                      </div>
                      <span className={`shrink-0 rounded-full border border-current px-3 py-1 text-xs font-semibold ${status.color}`}>{item.status}</span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-700">{item.description}</p>
                    {item.missingRequirement && <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-800"><span className="font-semibold">Next step: </span>{item.missingRequirement}</div>}
                    <details className="mt-4 border-t border-[#dce1e8] pt-3">
                      <summary className="min-h-11 text-sm font-medium text-slate-800">Evidence and connection details</summary>
                      <dl className="mt-3 grid min-w-0 gap-4 text-sm sm:grid-cols-2">
                        <div className="min-w-0"><dt className="font-medium text-slate-800">Connected components</dt><dd className="mt-1 break-words text-slate-600">{item.connectedComponents.join(', ')}</dd></div>
                        <div className="min-w-0"><dt className="font-medium text-slate-800">Information exchanged</dt><dd className="mt-1 text-slate-600">{item.informationExchanged}</dd></div>
                        <div className="min-w-0 sm:col-span-2"><dt className="font-medium text-slate-800">Supporting evidence</dt><dd><ul className="mt-1 list-disc space-y-2 pl-5 text-slate-600">{item.evidence.map((entry) => <li key={entry}>{entry}</li>)}</ul></dd></div>
                        <div><dt className="font-medium text-slate-800">Last tested</dt><dd className="mt-1 text-slate-600">{item.lastTestedAt ? <time dateTime={item.lastTestedAt}>{new Date(item.lastTestedAt).toLocaleString()}</time> : 'Not tested during this status check'}</dd></div>
                        <div><dt className="font-medium text-slate-800">Test source</dt><dd className="mt-1 text-slate-600">{item.testSource}</dd></div>
                        <div><dt className="font-medium text-slate-800">Blocker category</dt><dd className="mt-1 text-slate-600">{item.blockerCategory ?? 'None identified'}</dd></div>
                        <div><dt className="font-medium text-slate-800">Safe error message</dt><dd className="mt-1 text-slate-600">{item.safeErrorMessage ?? 'None specified'}</dd></div>
                      </dl>
                    </details>
                  </article>
                ))}
              </div>
            ) : <p className="rounded-lg border border-[#dce1e8] p-4 text-sm text-slate-600">{query ? 'No matching connections in this group.' : 'No items in this status.'}</p>}
          </section>
        );
      }) : null}
    </section>
  );
}
