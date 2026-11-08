# Architecture Test Center: repairs and remaining requirements

The pasted dashboard represents a different runtime and database from this cloud checkout. Its historical counts and test timestamps are not copied into this environment. `work` was fast-forwarded from a8cdf92 to current `origin/master` 6bbf726 before these fixes. These changes are local and have not been deployed to the runtime that produced the pasted page.

## Implemented and checked locally

- Production build and lint: compatible ESLint 9, corrected lint errors, and packaged local Geist fonts. Missing Stripe configuration no longer starts an empty-key Stripe.js load; CEU shows an unavailable message instead.
- Administrator session: configured password and server-verified TOTP; codes are consumed atomically to prevent reuse across workers/restarts. Credential failures, missing codes, reuse, anonymous requests, and altered cookie formats are rejected. The development bypass requires an explicit flag and is forbidden in production.
- Shared kiosk abuse protection: atomic SQLite sliding window across workers sharing a local file. Lookup and check-in share the budget; spoofed untrusted proxy headers do not change it. Both routes fail closed when storage is unavailable. Cross-host deployments still need distributed storage.
- Booking, kiosk, patient/staff records and appointment changes: API tests verify authorization, persistence, slot conflicts, cancellation, single-use check-in tokens, and safe audit evidence.
- Webhook/enrollment code: locally signed fictional events verify signature rejection, matching enrollment, and idempotent duplicate handling. No provider was contacted and no test learner data survives the disposable test database.
- Backups/recovery code: online SQLite backups include committed WAL data, verify isolated restores, and protect output permissions. The restore command refuses existing directories. Tampering and missing sources fail verification. Production backup scheduling, retention, encryption and off-host recovery remain unconfigured.
- Status evidence no longer claims a browser end-to-end test solely from a persisted business record. Billing explicitly labels sample amounts and disables the unimplemented invoice control.

## Validation results

- 13 automated tests passed; none failed or skipped.
- `npm run lint` and the production build passed without warnings.
- Chromium against the production server passed booking, unavailable-payment messaging, password/TOTP sign-in, the protected status dashboard, and disabled billing controls with no JavaScript page errors.
- All generated credentials, learner records, appointments and local webhook fixtures used disposable databases that were removed after testing.

## Remaining items from the pasted dashboard

| Dashboard item | What is required to finish |
| --- | --- |
| Admin sign-in -> server session | Securely configure CLINIC_ADMIN_EMAIL, CLINIC_ADMIN_PASSWORD, CLINIC_SESSION_SECRET and CLINIC_ADMIN_TOTP_SECRET; provision the authenticator securely; disable the demo and sign in. No external identity provider is required for this local administrator account. |
| Kiosk identity / patient identity provider | Select a patient identity provider, issuer/audience, patient-subject mapping and callback URLs; implement and test signature, nonce and replay verification. Last-four lookup remains weak identity matching. |
| Membership scanner -> kiosk | Provide the actual device/SDK, supported event delivery and authenticated device/token authority. Format simulations cannot establish hardware connectivity. |
| CEU form -> Stripe PaymentIntent | Matching test-mode STRIPE_SECRET_KEY and NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, permitted Stripe domains, and a form-to-handler test against that test account. |
| Stripe test-mode API connectivity | The same test keys; run the protected create-and-cancel check. No keys are present in this cloud instance. |
| Stripe outcome audit / verified payment enrollment | STRIPE_WEBHOOK_SECRET for the actual registered webhook endpoint, delivery of a matching test-mode signed event, and verification of durable enrollment. Local signature fixtures are only code validation. |
| CEU completion -> certificate | Approved attendance/completion criteria, authorized verifier roles, issuer/accreditation details, certificate contents and revocation rules. These cannot be inferred from payment alone. |
| Ubuntu host / database health endpoints | Real UBUNTU_HOST_HEALTH_URL and DATABASE_SERVER_HEALTH_URL, optional server-only tokens, network access, and exact documented component responses. No substitute local service is labeled as the clinic's infrastructure. |
| Billing -> durable records | Define invoice numbering/tax/currency, financial permissions, payment provider, refund rules, insurance and audit/retention requirements before implementing financial mutations. Displayed amounts remain samples. |
| Monitoring and alerting | Select the service, ingest URL/authentication, alert routing, thresholds and operational owner; integrate real delivery and verify its receipt. The existing format adapter is not alert delivery. |
| Database backups/recovery | Configure protected CLINIC_BACKUP_DIR, scheduling, encrypted off-host destination, retention and a separate-host recovery exercise. `npm run backup` and `npm run restore` are implemented and tested locally. |

Supply credential values through secure environment/deployment settings, never source control or chat. The cloud configuration service previously returned INVALID_ARGUMENT for reads and saves; no reusable draft save or publication is claimed. This does not prevent reviewing and testing the local code changes.

## Commands

From `/workspace/clinicwebsite`:

```sh
npm ci --cache /workspace/.npm-cache --no-audit --no-fund
npm test
npm run lint
npm run build
npm run dev -- --hostname 0.0.0.0
```

Use existing isolated checkouts; do not create worktrees unless explicitly requested. Processes need restarting in new tasks. With no administrator configuration, sign-in is unavailable by design; for a deliberate local demo only, start with `ENABLE_DEVELOPMENT_ADMIN_DEMO=true npm run dev -- --hostname 0.0.0.0`. A demo must stay labeled and cannot count as verified authentication. Use loopback URLs only for internal checks; no user-facing loopback preview is published.

## Local workflow verification update

Run `npm run verify:workflows -- --stripe --backup` against your running Windows development server after syncing this code. This creates clearly named development records only where evidence is missing and uses a sandbox test PaymentIntent for CEU. The verifier refuses non-loopback URLs, production targets and live-key payment tests. Its Stripe branch requires the real listener and a matching signed webhook; it does not mark missing provider delivery as verified.

The previous permanently Partly Connected CEU setup row is fixed: only the application handler's atomic registration/setup/audit receipt for the current key configuration can connect it. Pending processing events are allowed time to settle, and late events cannot replace a successful settlement with a pending payment state. See the README for terminal setup, test data and rechecking an existing test payment.

The verifier now also adds a development staff directory entry and cancels its own separate fictional appointment when those audit-backed workflows lack evidence. It checks persistence, slot release and the resulting dashboard statuses. It runs the separate Stripe create-and-cancel probe, and skips an additional CEU payment if all three CEU workflows already have evidence. The optional local backup check verifies that the application sees the same restore receipt; `npm run backup` now loads `.env.local` rather than silently falling back to default database paths. A local backup can establish only Partly Connected recovery until managed scheduling, protected off-host storage, retention and separate-host restoration are verified.

Validation for this update: 21 Node tests and 7 browser tests passed, including staff addition and appointment cancellation through the admin screens. The local verifier passed twice against a fresh isolated development server, with no extra clinical records on the second run. Stripe provider delivery was not tested in this cloud environment, which has no configured Stripe credentials.

## Development learner workspace

`/learn` now provides three fictional courses, account-gated catalogue/content, Stripe sandbox purchase setup, signed webhook activation, continuous video progress, a server-graded final exam and downloadable non-credit sample certificates/receipts. Enable with `ENABLE_DEVELOPMENT_CEU_DEMO=true` in `.env.local`; it is disabled in production even when flagged. See [COURSE_DEMO.md](COURSE_DEMO.md) for the confirmed retry/repurchase policy and Windows instructions.

This does not mark approved CE certificate issuance Connected: actual provider/course approval details and credit hours are still missing. New demo payment/exam/certificate audit events are explicitly labeled demo; they do not masquerade as approved enrollment. Clinic billing and Ubuntu deployment are deferred. Patient check-in requirements are recorded as SMS verification after last-four lookup (full-phone fallback on ambiguity), plus a membership-card path; the SMS provider and reader hardware remain unselected.

Validation: 22 Node tests and 8 browser tests passed; lint, TypeScript checking and the production build passed. Tests cover exact cooldown boundaries, three-attempt quotas, replay-safe submissions, repurchase pricing/progress reset, payment validation, certificate ownership and the mobile account/video/exam/download journey. Browser webhook tests use locally signed fictional events in disposable databases, not a contacted Stripe provider. Actual new-course checkout must be exercised with the Windows sandbox keys/listener.

The dashboard now exposes five separate demo learner evidence rows while the learning demo is enabled. These report stored accounts, signed sandbox purchases, full required-video progress, stored exam results and non-credit certificates. Counts and timestamps are checked without exposing learner details; approved-credit issuance stays Planned. A browser regression check verifies the initial unverified rows and their transition to Connected after the actual local fixture-backed learner flow. Expired Stripe probe results now retain their previous outcome/timestamp and explain the 15-minute freshness window rather than implying that the earlier check never passed.

## Automatic dashboard updates

The open System Status view checks an administrator-protected read-only revision endpoint every two seconds. Its opaque HMAC revision tracks audit/learning and appointment database files and WAL writes, relevant runtime/environment settings and the latest backup receipt/snapshots. Only a changed revision triggers a full status read; periodic full reads every 30 seconds cover time-dependent expiry and external health. This notices other tabs, other workers sharing the same files, Stripe webhooks and backup commands without relying on a browser-only event bus. Stable worker revisions require the existing shared `CLINIC_SESSION_SECRET` configuration.

Returning to a visible tab or restoring connectivity triggers an immediate refresh. Hidden tabs stop polling; requests are serialized, bounded and canceled on unmount. Failed Stripe probes and partially completed simulation runs also trigger an immediate status refresh. A rejected administrator session clears displayed status and stops background requests until access is resumed. Revision responses contain no file paths, record contents or credentials. Refreshing status never creates a payment, runs a simulation or invents external connectivity. Configuration changes still need the application's normal reload/restart to take effect.

Validation: 23 server tests and 9 browser tests passed, plus lint and the production build. The live-status test writes through a separate API client, verifies the open dashboard updates while retaining its search filter, then checks logout handling including an authorized response deliberately delayed until after logout. Revision tests cover stable reads, database/WAL writes, runtime configuration changes and changed backup snapshots.
