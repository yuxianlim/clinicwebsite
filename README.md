# 中医诊所网站

这是一个现代的中医诊所单页响应式网站，使用 Next.js 和 Tailwind CSS 构建。

## 功能特点

- 现代、优雅、简约的设计
- 粘性导航栏
- 平滑滚动
- 移动优先响应式设计
- 预约挂号表单
- 服务与治疗介绍
- 医师介绍
- 患者评价（可滚动查看）
- 地点与营业时间

## 技术栈

- Next.js 16
- React
- TypeScript
- Tailwind CSS

## 运行项目

首先，安装依赖：

```bash
npm install
```

然后，启动开发服务器：

```bash
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000) 查看结果。

## 构建生产版本

```bash
npm run build
npm start
```

## Audit log

Clinic activity is written to the server-side SQLite `audit_log` table at `.data/clinic-audit.sqlite` by default. Set `AUDIT_LOG_DB_PATH` to choose another persistent path. The database directory is ignored by Git. Entries are append-only, protected from updates and deletes by SQLite triggers, and each entry's SHA-256 hash includes the previous entry hash, beginning with `GENESIS`. The portal verifies the full chain in sequence.

Chain verification provides tamper evidence only. It does not replace access control, secure storage, monitoring, backups, or compliance procedures.

## Appointment booking

Public bookings are submitted to `POST /api/appointments`, validated by the server, and stored in SQLite at `.data/clinic-appointments.sqlite` by default. Set `CLINIC_APPOINTMENTS_DB_PATH` to use another persistent path. Appointment slots are reserved transactionally with a unique practitioner/date/time constraint. The public availability endpoint returns occupied times only and never returns patient details. Successful appointments are mirrored into the current browser's local state for the existing portal and kiosk UI; that browser cache is not authoritative. This SQLite deployment supports a single application instance. Use a shared database service for multiple instances, and protect the database because it contains patient contact information.

The kiosk looks up same-day appointments using the durable SQLite patient and appointment stores, then checks in with a short-lived single-use token. Patient lookup fails closed when more than one patient shares the submitted last four digits; last-four matching is still not strong identity verification. The membership-ID scanner is not connected. The kiosk request budget is stored transactionally in SQLite and shared by workers on the same host. Use a distributed store for multiple hosts. Set KIOSK_TRUSTED_IP_HEADER only behind a proxy that overwrites that header; without it, all requests share a conservative common bucket.

The log records server-confirmed appointment creation, kiosk verification/check-in outcomes, CEU payment setup and Stripe-signature-verified payment outcomes, administrator sign-in attempts, and denied audit-log reads. Browser clients cannot assert trusted payment, booking, or check-in outcomes. Verification inputs, contact details, card data, and medical details are not audit event fields. The same SQLite file stores CEU enrollment records, including learner name and email, separately from the hash-chained audit events; protect its access and backups accordingly. A successful signed Stripe event finalizes a durable CEU enrollment; certificate issuance still requires a verifiable course completion or attendance workflow.

Administrator sign-in requires configured email/password credentials and a server-verified six-digit authenticator code. The server prevents code reuse in SQLite before creating a signed HttpOnly session. Configure `CLINIC_ADMIN_EMAIL`, `CLINIC_ADMIN_PASSWORD`, `CLINIC_SESSION_SECRET` (at least 32 characters), and `CLINIC_ADMIN_TOTP_SECRET` (at least 32 Base32 characters, shared securely with the administrator's authenticator). In development only, `ENABLE_DEVELOPMENT_ADMIN_DEMO=true` explicitly enables the old demo credential bypass; keep this unset for real authentication. Demo sessions cannot be issued or accepted in production. Patient sign-in remains a clearly labeled demo.

To test the audit log, create a booking and try both a failed and successful kiosk verification using fictional test data. Open Administration / Security to see the connected SQLite-backed table and `Verify Chain`. A request to `GET /api/audit-log` without the administrator cookie should return `403`; update/delete attempts against `audit_log` should be rejected by its SQLite triggers. To test tamper detection, use a disposable copy of the database, bypass a trigger, change or delete an earlier row, and confirm the verifier reports Failed. Never test tampering against the working audit database.

Patient registration, staff-directory additions, and eligible appointment reschedule/cancel actions are administrator-only, persisted in SQLite, returned to the portal, and recorded with safe audit summaries. Appointment updates preserve unique active-slot constraints; cancellation is soft and checked-in visits cannot be changed. Staff management is a directory only, not a payroll/HR or staff-permission system. Billing remains display-only because no invoice/refund policy is defined. The prototype does not implement a real patient identity provider, membership-ID scanner, CEU course completion/attendance tracking, certificate issuance, or administrative staff-role permissions. CEU enrollment is persisted only after a matching signature-verified successful payment. The kiosk still uses last-four phone digits, which are not strong identity verification; its SQLite request limit is shared across local workers, not across independent hosts. A CEU enrollment does not imply course completion or certificate issuance.

The SQLite-backed audit store requires Node.js 22.16 or newer. Production deployments must mount persistent storage for the database and protect its contents. For multiple application instances, use a shared database service instead of local SQLite storage.

Configure these server-only variables for production administrator access and Stripe webhook verification:

- `CLINIC_ADMIN_EMAIL`
- `CLINIC_ADMIN_PASSWORD`
- `CLINIC_SESSION_SECRET` (use a randomly generated secret of at least 32 bytes)
- `CLINIC_ADMIN_TOTP_SECRET` (Base32 authenticator secret, at least 32 characters)
- `CLINIC_AUTH_DB_PATH` (optional persistent OTP replay store)
- `AUDIT_LOG_DB_PATH` (optional)
- `STRIPE_WEBHOOK_SECRET` (Stripe endpoint signing secret; required to verify webhook outcomes)

Put production values in the deployment's server-only environment configuration. Real administrator authentication requires the configured session secret in development as well. Only the explicit development demo may use a generated process-local secret. Never send secrets to the browser or commit them.

Administrator sign-in verifies configured email/password credentials plus a replay-protected TOTP code before creating an eight-hour signed HttpOnly session. Login attempts share an eight-attempt/minute budget. The optional development demo is explicitly flagged and cannot run in production. Patient sign-in remains a demo. Configure Stripe to send `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.processing`, and `payment_intent.canceled` events to `/api/stripe/webhook`. Keep the webhook signing secret server-side. The CEU screen reports enrollment only after the server observes and persists a matching signed successful-payment event. Certificates are not issued; course completion or attendance must be verified separately before issuing one.

## Development / System Status

The administrator-only Architecture Test Center at `/portal` refreshes its dashboard evidence every 30 seconds. Workflow states are `Passed`, `Failed`, `Not Tested`, `Planned`, or `Not Applicable`; these are derived from verifiable application evidence, not from a simulator claiming an external integration works. Ubuntu host and database server entries remain `Planned` until their server-side health probes are configured and return component-specific evidence. Future assignments can configure these server-only variables:

- `UBUNTU_HOST_HEALTH_URL`
- `UBUNTU_HOST_HEALTH_TOKEN` (optional)
- `DATABASE_SERVER_HEALTH_URL`
- `DATABASE_SERVER_HEALTH_TOKEN` (optional)

The Ubuntu endpoint must return JSON containing `{"status":"ok","component":"ubuntu-host"}`; the database endpoint must return `{"status":"ok","component":"database-server"}`. The application accepts HTTPS in production and HTTP only in development, rejects embedded credentials, query parameters, fragments, and redirects, and times out each probe after three seconds. An expected HTTP success and component marker changes the item to `Connected`; a configured but unreachable or incorrect endpoint becomes `Failed`. No endpoint URL, token, or response body is returned to the browser. Keep probe URLs and tokens in server-side environment configuration, not client-side variables. An HTTP health response proves only what that configured endpoint reports; it does not independently prove deployment hardening or database durability.

In development, an administrator can run the dashboard's safe Stripe connectivity check when matching test-mode keys are configured. It creates a USD 1 test-mode PaymentIntent and immediately cancels it; no payment is collected and the client secret is never returned. Only the mode, result, and check timestamp are stored. This verifies Stripe API create/cancel access only; it does not exercise the CEU form handler or verify webhook delivery, a successful payment, CEU enrollment, or certificate issuance. The dashboard reports provider connectivity separately from the unverified form-to-handler path. The endpoint is unavailable in production.

Development-only format simulations are protected by the signed administrator session and are enabled only when both `NODE_ENV=development` and `ENABLE_DEVELOPMENT_INTEGRATION_SIMULATORS=true`. The Architecture Test Center sends fictional request bodies to `/api/system-status/integration-simulation`; each target is checked against its server-side adapter contract. The stored audit event includes the safe target, result, and source `Development Simulation`, but never the submitted identity claims, membership token, or provider response. Simulated evidence is not evidence that a provider, server, or physical device is connected. Keep this feature flag disabled outside development.

### Unavailable device and service contracts

The project has adapters for the message shapes below, but no external identity provider, membership scanner, host/database health endpoint, or monitoring/alerting service is connected. These payload contracts do not establish that a provider or physical device exists or is trusted:

| Integration | External input / application request | Application output / external response |
| --- | --- | --- |
| Patient identity provider | An OpenID Connect ID-token claim set containing `iss` (HTTPS issuer), `sub` (stable provider subject), `aud` (registered client audience), `iat`, `exp` (Unix seconds), `nonce`, and `email_verified`. A real deployment must verify the token signature against the provider's trusted keys and check issuer, audience, time bounds, nonce, and replay before treating claims as identity. | On success, respond to the kiosk with `{"verified":true,"patient":{"id":"<opaque patient ID>","name":"<display name>"},"appointment":{"id":"<appointment ID>","date":"<date>","time":"<time>","practitioner":"<name>"},"checkInToken":"<short-lived single-use token>"}`; on failure return a generic verification error. Never return or persist the raw token. The current adapter only normalizes claim shape; it does not verify signatures or authenticate anyone. |
| Membership scanner | A device event with `deviceId`, unique `scanId`, opaque `membershipToken`, and ISO-8601 `scannedAt`. The device must be authenticated and the token verified against an authoritative membership source before use. | On a verified match, respond to the kiosk with the same limited `patient`, `appointment`, and short-lived `checkInToken` object as above; on failure return a generic verification error. Never echo or audit the membership token. The current adapter validates the event format only; it does not identify hardware, verify a token, or check in a patient. |
| Ubuntu host health probe | The application sends `GET` with optional `Authorization: Bearer <server-only token>`; the host must return HTTP success and JSON `{"status":"ok","component":"ubuntu-host"}`. | The application consumes only HTTP status and the exact `status`/`component` markers, then returns a safe dashboard status; it discards response body details and never exposes the URL or token. |
| Database server health probe | The application sends `GET` with optional `Authorization: Bearer <server-only token>`; the database service must return HTTP success and JSON `{"status":"ok","component":"database-server"}`. | The application consumes only HTTP status and the exact `status`/`component` markers, then returns a safe dashboard status; it discards response body details and never exposes the URL or token. |
| Monitoring / alerting | The application sends an allowlisted JSON event: `eventId`, ISO-8601 `occurredAt`, `environment`, `service`, `severity` (`info`, `warning`, or `critical`), and uppercase `code`. A server-only bearer token may authenticate the ingest request. | The provider must return JSON `{"accepted":true,"eventId":"<same event ID>","incidentId":"<provider reference>","receivedAt":"<ISO-8601 timestamp>"}`. The application validates that receipt; payloads must not contain patient, payment, credential, or other sensitive data. |

`ENABLE_DEVELOPMENT_INTEGRATION_SIMULATORS=true` enables the protected dashboard simulator only when `NODE_ENV=development`; the flag is ignored in every other environment. Set it in the server environment and restart the development server. The authenticated POST endpoint `/api/system-status/integration-simulation` accepts `{target,payload}` for one of the documented input shapes and passes the fictional payload through its adapter. It stores only the target, result, timestamp, and `Development Simulation` source in simulation evidence and in a safe chained audit event; submitted tokens and payloads are not stored. It makes no provider/device calls, performs no identity authentication or patient lookup/check-in, and never claims the physical provider/device is connected. It returns 404 when disabled and 403 without the signed administrator session.

Fonts use locally packaged Geist assets through `next/font/local`, so production builds require no Google Fonts download.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.


## Verification and recovery

Use `npm ci`, `npm test`, `npm run lint`, and `npm run build` with Node.js 22.16+ (validated on Node.js 24.22.1). If the home npm cache is not writable, add `--cache /workspace/.npm-cache` to npm installation commands. ESLint 9 is retained for compatibility with the current React lint plugin.

`npm test` creates disposable databases and generated local credentials. It covers authenticated administration, booking conflicts, kiosk check-in/replay, rate-limit contention across independent processes, local webhook signature/enrollment fixtures, and backup/restore integrity. It never contacts Stripe, an identity provider, a scanner, or monitoring infrastructure; test results are not provider-connectivity evidence.

`npm run backup` snapshots the existing audit and appointment databases using SQLite's online backup API, includes committed WAL contents, restores isolated copies, and verifies integrity and the audit chain. Output is under `CLINIC_BACKUP_DIR` (default `.data/backups`) with owner-only permissions, a manifest, and SHA-256 checksums. It does not replace working databases. Use a maintenance window to ensure consistency between the two databases. Auth/limiter stores are ephemeral security state and are not restored by this command; after disaster recovery, rotate the session and TOTP secrets before accepting sign-ins so old sessions/codes cannot be replayed.

`npm run restore -- <snapshot-directory> <new-recovery-directory>` verifies checksums, database integrity and the audit chain, then restores into a new directory only. It refuses an existing destination. Stop every application worker before switching `AUDIT_LOG_DB_PATH` and `CLINIC_APPOINTMENTS_DB_PATH` to the recovered files. Protect and inspect the recovery directory before resuming service. Configure encrypted off-host storage, backup scheduling, retention, and recovery on another host before claiming disaster recovery. The dashboard reports a recent local verification as Partly Connected and never claims that a local snapshot alone completes managed recovery.

See [SYSTEM_STATUS_RUNBOOK.md](SYSTEM_STATUS_RUNBOOK.md) for the remaining integration requirements and the checks completed in this environment.

## Responsive UI checks

`npm run test:ui` runs Chromium checks at 320, 390, 768, 1024 and 1440 pixels wide, plus an 844×390 landscape phone. It covers the public site, booking/sign-in/detail dialogs, all kiosk states, and every dashboard section. Checks include document overflow, dialog bounds and keyboard focus, long names/IDs, mobile navigation, status search and expanded evidence. Management and kiosk layout fixtures are fictional browser responses; these checks do not claim provider connectivity or change clinic records.

The runner uses system Chromium when available, or `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. Otherwise install the standard browser with `npx playwright install chromium`. Stop an existing Next.js development server before running the checks, because Next.js uses a development build lock. The test server uses isolated database paths; its fixture database directory is removed afterward. Screenshots are saved under ignored `test-results/responsive` directories.
