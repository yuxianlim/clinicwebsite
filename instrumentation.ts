export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NODE_ENV !== 'production' && process.env.ENABLE_DEVELOPMENT_INTEGRATION_SIMULATORS === 'true') {
    const { startDemoInsuranceScheduler } = await import('./app/lib/demoBilling.server');
    startDemoInsuranceScheduler();
  }
}
