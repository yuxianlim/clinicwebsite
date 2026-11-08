import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import path from 'node:path';

const data = path.join(process.cwd(), '.data', 'responsive-tests', `${Date.now()}-${process.pid}`);
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/responsive.spec.ts',
  globalTeardown: './e2e/cleanup.ts',
  metadata: { responsiveDataDirectory: data },
  outputDir: 'test-results/responsive',
  timeout: 90_000,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:3102', timezoneId: 'America/Los_Angeles', launchOptions: { executablePath }, screenshot: 'only-on-failure' },
  projects: [
    { name: 'small-phone', use: { viewport: { width: 320, height: 740 } } },
    { name: 'phone', use: { viewport: { width: 390, height: 844 } } },
    { name: 'tablet', use: { viewport: { width: 768, height: 1024 } } },
    { name: 'laptop', use: { viewport: { width: 1024, height: 768 } } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'phone-landscape', use: { viewport: { width: 844, height: 390 } } },
    { name: 'workflows', testMatch: '**/clinic-workflows.spec.ts', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'learning', testMatch: '**/learning.spec.ts', use: { viewport: { width: 390, height: 844 } } },
    { name: 'live-status', testMatch: '**/status-live.spec.ts', use: { viewport: { width: 1280, height: 800 } } },
    { name: 'demo-setup', testMatch: '**/demo-setup.spec.ts', use: { viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: 'npm run dev -- --hostname 127.0.0.1 --port 3102', url: 'http://127.0.0.1:3102', reuseExistingServer: false,
    env: {
      ENABLE_DEVELOPMENT_ADMIN_DEMO: 'true', ENABLE_DEVELOPMENT_INTEGRATION_SIMULATORS: 'true',
      CLINIC_LOGIN_RATE_LIMIT_DB_PATH: path.join(data, 'login-limits.sqlite'),
      AUDIT_LOG_DB_PATH: path.join(data, 'audit.sqlite'), CLINIC_APPOINTMENTS_DB_PATH: path.join(data, 'appointments.sqlite'),
      KIOSK_RATE_LIMIT_DB_PATH: path.join(data, 'kiosk-limits.sqlite'), CLINIC_AUTH_DB_PATH: path.join(data, 'auth.sqlite'),
      CLINIC_BACKUP_DIR: path.join(data, 'backups'), STRIPE_SECRET_KEY: '', NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: '', STRIPE_WEBHOOK_SECRET: 'whsec_playwright_local_fixture',
      ENABLE_DEVELOPMENT_CEU_DEMO: 'true',
      UBUNTU_HOST_HEALTH_URL: '', DATABASE_SERVER_HEALTH_URL: '',
    },
  },
});
