# Clinic Website Architecture Map

This map describes the code in this repository. "Working" means connected in the current prototype; it does not imply production-grade reliability or security.

## Component Map

```mermaid
flowchart LR
  subgraph Browser[Browser application]
    Public[Public clinic website]
    Nav[Navigation and booking modal]
    Booking[BookingProvider]
    LocalAppointments[Browser localStorage]
    Kiosk[Patient kiosk]
    PatientData[Static clinicData patient list]
    ClinicAdmin[Clinic administration portal]
    AuthUI[ClinicAuthModal and client sessionStorage]
    CEU[CEU registration and Stripe.js form]
    AuditViewer[Audit log viewer]
    StatusViewer[Architecture Test Center]
  end

  subgraph Server[Next.js server]
    SessionAPI[/api/clinic/session]
    AuditAPI[/api/audit-log]
    StatusAPI[/api/system-status]
    StripeTestAPI[/api/system-status/stripe-test]
    IntegrationSimulationAPI[/api/system-status/integration-simulation]
    PaymentAPI[/api/stripe/payment_intent]
    PaymentStatusAPI[/api/stripe/payment_status]
    StripeWebhook[/api/stripe/webhook]
    EnrollmentStore[SQLite ceu_enrollments]
    StripeProbeStore[SQLite stripe_api_connectivity_checks]
    KioskLookup[/api/kiosk/lookup]
    KioskCheckIn[/api/kiosk/check-in]
    SessionCookie[Signed HttpOnly admin cookie]
    AppointmentAPI[/api/appointments]
    AdminPatientAPI[/api/admin/patients]
    AdminStaffAPI[/api/admin/staff]
    AdminAppointmentAPI[/api/admin/appointments]
    AppointmentStore[SQLite appointments and slot constraints]
    ClinicRecords[SQLite patients and staff directory]
    AuditStore[SQLite audit_log and SHA-256 chain]
    ExternalAdapters[External integration format adapters]
  end

  subgraph Providers[External provider]
    Stripe[Stripe PaymentIntents]
  end

  Public --> Nav
  Nav --> Booking
  Booking -->|appointment fields and check-in timestamp| LocalAppointments
  Kiosk -->|last four digits| KioskLookup
  KioskLookup -->|server lookup| PatientData
  KioskLookup -->|today's appointment and single-use token| Kiosk
  Kiosk -->|appointment ID and single-use token| KioskCheckIn
  KioskCheckIn -->|atomic check-in| AppointmentStore
  KioskLookup -->|safe server audit event| AuditStore
  KioskCheckIn -->|safe server audit event| AuditStore
  AuthUI -->|email, password, and sign-in method| SessionAPI
  SessionAPI -->|signed session cookie| SessionCookie
  AuthUI -->|role and client-side face-verified UI state| ClinicAdmin
  Booking -->|name, contact, date, time, practitioner| AppointmentAPI
  AppointmentAPI -->|validate, reserve slot, persist| AppointmentStore
  AppointmentAPI -->|safe event metadata| AuditStore
  AppointmentAPI -->|confirmation and occupied times only| Booking
  ClinicAdmin -->|authorized patient/staff and appointment actions| AdminPatientAPI
  AdminPatientAPI -->|durable records and atomic audit event| ClinicRecords
  ClinicAdmin --> AdminStaffAPI
  AdminStaffAPI -->|durable directory and atomic audit event| ClinicRecords
  ClinicAdmin --> AdminAppointmentAPI
  AdminAppointmentAPI -->|reschedule/cancel with slot constraints| AppointmentStore
  AdminAppointmentAPI -->|safe action and appointment reference| AuditStore
  ClinicAdmin -->|read-only audit view| AuditViewer
  AuditViewer -->|GET with cookie| AuditAPI
  ClinicAdmin -->|admin-only navigation| StatusViewer
  StatusViewer -->|GET with cookie| StatusAPI
  StatusViewer -->|admin POST, development test keys only| StripeTestAPI
  StatusViewer -->|protected development-only fictional inputs| IntegrationSimulationAPI
  IntegrationSimulationAPI -->|validate documented payload formats| ExternalAdapters
  ExternalAdapters -.->|no external device/provider contacted by simulator| UnavailableServices[Unconnected identity, scanner, health, and monitoring services]
  ExternalAdapters -->|configured sanitized event and receipt validation| Monitoring[Monitoring ingest provider]
  StatusAPI -->|GET health probes with optional bearer auth| HealthServices[Ubuntu host and database health endpoints]
  StripeTestAPI -->|create then cancel test PaymentIntent| Stripe
  StripeTestAPI -->|safe result and timestamp only| StripeProbeStore
  AuditAPI -->|append, list, verify| AuditStore
  StatusAPI -->|count and full-chain check| AuditStore
  CEU -->|name, email, topic ID| PaymentAPI
  PaymentAPI -->|create PaymentIntent| Stripe
  PaymentAPI -->|persist pending enrollment, client secret| CEU
  Stripe -->|signed payment outcome event| StripeWebhook
  StripeWebhook -->|signature verified, atomic enrollment and audit| EnrollmentStore
  StripeWebhook -->|signature verified, deduplicated audit event| AuditStore
  CEU -->|server payment and enrollment status query| PaymentStatusAPI
  PaymentStatusAPI -->|matched verified status| CEU
  EnrollmentStore -.->|completion and certificate not connected| MissingCertificate[No completion or certificate service]
```

## Main Workflows

### Appointment booking and management

The public page renders `Nav` and `BookingModal`. The modal submits name, contact number, date, time, and practitioner to `POST /api/appointments`. The route validates input, reserves the practitioner/date/time slot transactionally, and persists the appointment in SQLite. The client receives a confirmation only after persistence and mirrors that returned appointment to local state for existing portal/kiosk behavior. `GET /api/appointments` exposes occupied times for a selected date and practitioner, not patient details. The audit event carries an action, result, and appointment reference, not booking form values. Public booking does not require an administrator session; its route validates the input and does not trust client-supplied patient IDs.

| Connection | Information moved | Status | Evidence |
| --- | --- | --- | --- |
| Public page -> booking modal -> `BookingProvider` | Name, contact number, date, time, practitioner, optional matched patient ID | Working in one browser | [app/page.tsx](app/page.tsx), [BookingModal.tsx](app/components/BookingModal.tsx) `handleSubmit`, [BookingContext.tsx](app/context/BookingContext.tsx) `addAppointment` |
| Public booking -> appointment state | Name/contact/date/time/practitioner; persisted appointment confirmation | Connected for the configured single-instance SQLite deployment; local browser state remains a UI cache | [BookingModal.tsx](app/components/BookingModal.tsx), [api/appointments/route.ts](app/api/appointments/route.ts), [appointmentStore.server.ts](app/lib/appointmentStore.server.ts) |
| Appointment state -> portal schedule in current browser | Full appointment object and check-in timestamp | Browser mirror supports existing UI; SQLite is authoritative | [BookingContext.tsx](app/context/BookingContext.tsx), [portal/page.tsx](app/portal/page.tsx) |
| Booking -> central audit store | `Appointment created`, result, generated appointment ID | Server-side audit after persisted creation | [api/appointments/route.ts](app/api/appointments/route.ts), [auditStore.server.ts](app/lib/auditStore.server.ts) `appendAuditEvent` |
| Appointment changes -> central state and audit | Appointment ID, validated new date/time/practitioner or cancellation, signed administrator session | Admin reschedules/cancels use transactional SQLite changes and append safe audit events; checked-in/canceled appointments cannot be changed and slot conflicts return 409 | [ClinicRecordsManager.tsx](app/portal/components/ClinicRecordsManager.tsx), [api/admin/appointments/route.ts](app/api/admin/appointments/route.ts), [appointmentStore.server.ts](app/lib/appointmentStore.server.ts) |

### Patient verification and kiosk check-in

The kiosk posts the last four phone digits to `/api/kiosk/lookup`. The server validates the input, rate limits by forwarded client IP per process, finds a unique match in the durable SQLite patient store, and looks up today's appointment in the authoritative SQLite appointment store. Ambiguous suffixes fail closed rather than choosing a patient. The response includes only a display name, patient ID, appointment summary, and a five-minute single-use token. Confirming check-in posts that token and appointment ID to `/api/kiosk/check-in`; the server consumes the token and updates the appointment transactionally, refusing duplicate check-ins. Server handlers write safe audit outcomes directly; browser-supplied audit claims are not trusted. Last-four matching is still weaker than a real identity provider, and the membership scanner is unavailable.

| Connection | Information moved | Status | Evidence |
| --- | --- | --- | --- |
| Kiosk -> patient lookup and appointment state | Last four digits; server returns a unique patient match, limited appointment summary, and expiring opaque token | Connected for the configured single-instance SQLite deployment; end-to-end kiosk check-in and audit evidence verified. Identity strength and scanner availability are tracked as separate connections. | [KioskClient.tsx](app/kiosk/KioskClient.tsx), [api/kiosk/lookup/route.ts](app/api/kiosk/lookup/route.ts), [appointmentStore.server.ts](app/lib/appointmentStore.server.ts), [auditStore.server.ts](app/lib/auditStore.server.ts) |
| Kiosk -> check-in state | Appointment ID and single-use token; server sets check-in timestamp once | Connected for the configured single-instance SQLite deployment | [api/kiosk/check-in/route.ts](app/api/kiosk/check-in/route.ts), [appointmentStore.server.ts](app/lib/appointmentStore.server.ts) |
| Booking and kiosk -> audit store | Server-selected outcome and opaque record reference | Connected after persisted booking/check-in outcomes; untrusted browser POSTs are rejected | [api/appointments/route.ts](app/api/appointments/route.ts), [api/kiosk/lookup/route.ts](app/api/kiosk/lookup/route.ts), [api/kiosk/check-in/route.ts](app/api/kiosk/check-in/route.ts), [auditStore.server.ts](app/lib/auditStore.server.ts) |
| Membership ID scan -> patient verification | Scanner input and authoritative membership lookup | Missing; kiosk explicitly says the scanner is unavailable | [KioskClient.tsx](app/kiosk/KioskClient.tsx) scan step |

### External device and service interfaces

The application has explicit format adapters for the currently unavailable identity provider, membership scanner, host/database health endpoints, and monitoring service. These are integration contracts, not evidence of a connected provider or physical device.

| Integration | Input sent to or received by the application | Response required by the application | Adapter limitation |
| --- | --- | --- | --- |
| Patient identity provider | OIDC ID-token claims: `iss`, `sub`, `aud`, `iat`, `exp`, `nonce`, `email_verified` | Only after cryptographic signature/JWKS, issuer, audience, expiration, nonce, and replay checks, return kiosk JSON `{ verified, patient: { id, name }, appointment: { id, date, time, practitioner }, checkInToken }`; failure is generic | `normalizeIdentityAssertion` validates shape only; it does not verify signature or authenticate identity. No patient identity provider is configured. |
| Membership scanner | Scanner event `{ deviceId, scanId, membershipToken, scannedAt }` using an opaque one-time membership token | On a verified match, return the same limited kiosk JSON `{ verified, patient: { id, name }, appointment: { id, date, time, practitioner }, checkInToken }`; failure is generic. Raw token must not be echoed or logged. | `normalizeMembershipScan` validates structure only. Device authentication, authoritative token lookup, and hardware SDK are not available. |
| Ubuntu host health | `GET` with optional server-only bearer token; expected JSON `{ "status": "ok", "component": "ubuntu-host" }` | HTTP success and exact component marker; dashboard receives only a safe result | `probeHealthEndpoint` discards body details and rejects unsafe URLs/redirects. No endpoint is configured currently. |
| Database server health | `GET` with optional server-only bearer token; expected JSON `{ "status": "ok", "component": "database-server" }` | HTTP success and exact component marker; dashboard receives only a safe result | Same health adapter as host; no endpoint is configured currently. This probe does not establish database durability or recovery. |
| Monitoring / alerting | Outbound event `{ eventId, occurredAt, environment, service, severity, code }`; severity is `info`, `warning`, or `critical`, and code is uppercase alphanumeric/underscore | Provider receipt `{ accepted: true, eventId, incidentId, receivedAt }` with the original event ID | `publishMonitoringEvent` validates the allowlisted event and matching receipt. No endpoint/token or monitoring service is configured, so no event is currently published. |

The administrator-only `POST /api/system-status/integration-simulation` accepts a target and a fictional payload in its documented format for `identity-provider`, `membership-scanner`, `ubuntu-host`, `database-server`, or `monitoring-alerts`, then passes that payload through the corresponding server adapter. It requires a valid signed admin session, `NODE_ENV=development`, and `ENABLE_DEVELOPMENT_INTEGRATION_SIMULATORS=true`. Results are labeled `Development Simulation`. Only the target, result, source label, and timestamp are stored in the dedicated simulation evidence table and safe audit event; submitted tokens and payloads are never stored. Simulations do not call external services/devices or establish physical/provider connectivity. The flag is reported to the authenticated dashboard only when enabled.

### Administrator access and operations

`ClinicAuthModal` submits administrator sign-in details to `/api/clinic/session`. In development, the route accepts any non-empty email and issues a signed HttpOnly cookie; this is a mock and does not verify a real identity. In production, the route checks configured email/password credentials before issuing the signed cookie. The face-verification step is client-side mock UI and is not a server-verified second factor. Protected APIs validate the signed cookie independently of client `sessionStorage`. The dashboard keeps this connection Partly Connected because real identity-provider and second-factor verification are not implemented. Patient sign-in remains a demo flow; Google OAuth is not offered for administrator access and is not an identity-provider connection.

| Connection | Information moved | Status | Evidence |
| --- | --- | --- | --- |
| Sign-in form -> session API -> signed cookie | Email, password, and sign-in method; signed admin session returned in an HttpOnly cookie | Development mock; production checks configured email/password; no real second factor | [ClinicAuthModal.tsx](app/components/ClinicAuthModal.tsx), [api/clinic/session/route.ts](app/api/clinic/session/route.ts), [serverClinicSession.ts](app/lib/serverClinicSession.ts) |
| Client auth state -> portal navigation | Role, permissions, client-side face-verified UI state | UI gating only; not a security boundary | [clinicAuth.ts](app/lib/clinicAuth.ts), [portal/page.tsx](app/portal/page.tsx) |
| Signed cookie -> audit and System Status APIs | Verified admin role and audit-read permission | Working server-side gate | [api/audit-log/route.ts](app/api/audit-log/route.ts) `GET`, [api/system-status/route.ts](app/api/system-status/route.ts) `GET`, [serverClinicSession.ts](app/lib/serverClinicSession.ts) `verifyAdminSession` |
| Patient management -> durable records and audit | Validated patient name and phone number; generated opaque patient ID returned | Admin API persists the record and atomically appends a detail-free audit event; seed records are migrated with insert-if-absent behavior | [ClinicRecordsManager.tsx](app/portal/components/ClinicRecordsManager.tsx), [api/admin/patients/route.ts](app/api/admin/patients/route.ts), [auditStore.server.ts](app/lib/auditStore.server.ts) |
| Staff directory -> durable records and audit | Validated name, role, and hours; generated staff ID returned | Admin API persists directory records and atomically appends a detail-free audit event; this does not implement HR, payroll, or staff role permissions | [ClinicRecordsManager.tsx](app/portal/components/ClinicRecordsManager.tsx), [api/admin/staff/route.ts](app/api/admin/staff/route.ts), [auditStore.server.ts](app/lib/auditStore.server.ts) |
| Billing -> durable financial records and audit | No approved invoice/refund/payment mutation contract | Planned; no financial operation or payment result is invented | [portal/page.tsx](app/portal/page.tsx) billing section |

### CEU payment and enrollment

The CEU form uses Stripe.js to collect card details and submits the learner name, email, and selected topic to the server. The server validates those fields, creates a Stripe PaymentIntent, and stores a pending enrollment linked to that intent before returning its client secret. Browser results are never accepted as authoritative audit events. Stripe payment outcomes are verified through `/api/stripe/webhook` using `STRIPE_WEBHOOK_SECRET`; the handler validates signature, event type, topic, currency, and amount, then atomically deduplicates the Stripe event, writes the payment audit outcome, and finalizes enrollment on a successful payment. The screen asks `/api/stripe/payment_status` for server-verified payment and enrollment status. Enrollment is confirmed only after a matching signed success event; certificate issuance remains unavailable until course completion or attendance can be verified.

| Connection | Information moved | Status | Evidence |
| --- | --- | --- | --- |
| CEU form -> payment-intent API -> Stripe and pending enrollment | Validated learner name/email and topic; server stores pending enrollment and creates a USD PaymentIntent | Connected when Stripe keys and storage are configured | [CEU.tsx](app/components/CEU.tsx) `handlePaymentSubmit`, [api/stripe/payment_intent/route.ts](app/api/stripe/payment_intent/route.ts), [auditStore.server.ts](app/lib/auditStore.server.ts) |
| Stripe.js result -> audit log | Stripe-signed provider event ID, payment-intent ID, topic, and server-mapped outcome | Connected only after a configured signed webhook event is received and persisted; otherwise Partly Connected | [CEU.tsx](app/components/CEU.tsx), [api/stripe/webhook/route.ts](app/api/stripe/webhook/route.ts), [auditStore.server.ts](app/lib/auditStore.server.ts) |
| Verified payment -> CEU enrollment | Verified payment ID, registration ID, learner/course reference | Enrollment is finalized only by a matching signed success webhook; certificate remains separate | [api/stripe/webhook/route.ts](app/api/stripe/webhook/route.ts), [api/stripe/payment_status/route.ts](app/api/stripe/payment_status/route.ts), [auditStore.server.ts](app/lib/auditStore.server.ts) |
| CEU enrollment -> certificate issuance | Verified course completion/attendance and certificate reference | Missing; no completion or certificate workflow exists | [api/system-status/route.ts](app/api/system-status/route.ts) keeps this connection Partly Connected until completion and issuance are implemented |

## Shared Audit and Status Infrastructure

Trusted business events are appended by their server-side domain handlers; the administrator-only `POST /api/audit-log` is limited to administrative event types. The server generates safe summaries and writes audit events to SQLite. SHA-256 entries link in sequence from `GENESIS`; the admin `GET` response verifies the complete chain. The same SQLite file also stores CEU enrollment names and email addresses outside the audit chain, so it must be protected as personal data. SQLite is local to one server deployment unless storage is deliberately shared.

The Architecture Test Center is in the admin portal only. Its APIs independently check the signed admin cookie and return high-level component states, dependency groups, workflow evidence states, configuration presence, audit count/chain validity, and safe evidence; they do not return secret values and are not a monitoring or alerting service. Workflow states distinguish `Passed`, `Failed`, `Not Tested`, `Planned`, and `Not Applicable`; application-side simulated contract tests remain labeled and separated from real connectivity. The development simulator is guarded by `ENABLE_DEVELOPMENT_INTEGRATION_SIMULATORS=true` plus `NODE_ENV=development`. In development, an administrator with matching test-mode Stripe keys may run a connectivity check that creates and cancels a USD 1 test PaymentIntent. Only mode, result, and timestamp are stored. This verifies provider API reachability only, not the CEU handler, webhook delivery, payment settlement, or enrollment. The check is unavailable in production.

Ubuntu host and database server are not connected in the current repository. They remain Planned until optional server-only health URLs are configured and return the expected component-specific marker. The dashboard probes them every 30 seconds, uses optional bearer tokens only on the server, discards response bodies, and never returns URLs or tokens. A successful configured health endpoint is evidence only for the health contract that endpoint implements, not independent evidence of deployment security or durable database behavior.

## End-to-End Gaps

- Appointment and check-in data use transactional SQLite on one application instance; multi-instance deployments need shared storage and operational recovery guarantees.
- Patient identity, membership scanning, Google sign-in, and face verification need real provider integrations and server-side authorization.
- Audit event writes need authenticated server-side producers, rate limiting, and operational monitoring; a public client POST can be forged.
- Stripe outcomes need webhook signature verification before payment status is authoritative or enrollment is granted.
- CEU enrollment is durable and tied to verified payment; certificate issuance still needs verifiable completion/attendance rules and a certificate workflow.
- Production operation needs managed persistent storage, backups, monitoring/alerting, and documented retention/compliance controls. The hash chain alone does not provide these.