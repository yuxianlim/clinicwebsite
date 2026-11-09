export const restrictedFictionalStagingEnabled = () => (
  process.env.NODE_ENV === 'production'
  && process.env.APP_DEPLOYMENT_MODE === 'fictional-staging'
  && process.env.ENABLE_FICTIONAL_STAGING_WORKFLOWS === 'true'
  && restrictedStagingProxyConfigured()
  && configured('CLINIC_ADMIN_EMAIL')
  && (process.env.CLINIC_ADMIN_PASSWORD?.length ?? 0) >= 16
  && (process.env.CLINIC_SESSION_SECRET?.length ?? 0) >= 32
  && /^[A-Z2-7]{32,}$/i.test(process.env.CLINIC_ADMIN_TOTP_SECRET ?? '')
);

export const fictionalWorkflowEnabled = (developmentFlag: string | undefined) => (
  (process.env.NODE_ENV !== 'production' && developmentFlag === 'true')
  || restrictedFictionalStagingEnabled()
);

export const fictionalDataSource = () => restrictedFictionalStagingEnabled()
  ? 'fictional-staging-fixture' as const
  : 'development-fixture' as const;

const configured = (name: string) => {
  const value = process.env[name]?.trim() ?? '';
  return value.length > 0 && !value.startsWith('REPLACE_');
};

export const restrictedStagingProxyConfigured = () => (
  configured('STAGING_BASIC_AUTH_USER')
  && configured('STAGING_BASIC_AUTH_HASH')
  && configured('CADDY_BIND_IP')
  && !['0.0.0.0', '::', '[::]'].includes(process.env.CADDY_BIND_IP ?? '')
  && /^\$2[aby]\$/.test(process.env.STAGING_BASIC_AUTH_HASH ?? '')
  && process.env.STAGING_PUBLIC_ORIGIN === 'https://aven.sean.tcmusa.ai'
);
