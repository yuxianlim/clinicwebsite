# Non-infrastructure demo connections

## Current scope

SMS stays demo-only. CEU courses and certificates remain fictional/non-credit until real provider/course approval details are supplied. Monitoring uses a protected local demo alert inbox, with stored matching receipts and no external notification. Ubuntu, separate server/database deployment, off-host storage and managed recovery remain deferred.

Enable both `ENABLE_DEVELOPMENT_CEU_DEMO=true` and `ENABLE_DEVELOPMENT_INTEGRATION_SIMULATORS=true` in `.env.local`, restart `npm run dev`, then use **System Status → Run demo setup** as an administrator. This creates/reuses fictional learner, phone/card kiosk, billing and local alert records. No real charge, refund, SMS or hardware operation occurs.

## ACS ACR1252U / NTAG213 demo

The selected reader is **ACS ACR1252U** and the selected cards are **NTAG213**. The physical reader is not connected yet. In `/kiosk`, choose **Scan clinic membership ID → Simulate NTAG213 tap**. An explicitly simulated device event passes through the server's fictional-card verification and returns a limited stored appointment with a short-lived single-use check-in token. Confirming check-in persists it. Pasting the fictional token supplied by demo setup remains available as a separate input option.

The dashboard's **Demo NFC** row becomes Connected from the stored simulated tap; it does not claim USB/NFC connectivity. Real use requires the connected Windows reader, its PC/SC driver, a native local reader bridge and actual NTAG213 tests. Card enrollment/device authentication still need design before live use; a bare NFC UID is not strong patient authentication. Raw card tokens are not logged or echoed.

## Clinic billing rules implemented in the fictional ledger

- USD initial visit **$180**, follow-up **$120**, medicine **+$50**.
- The server determines visit type from earlier completed treatment/visit history. The UI has no manual initial/follow-up selector, and a client-supplied selection cannot override history. Bookings, cancellations and no-shows do not count as completed treatment.
- A guest booking matches an existing patient using normalized **full phone number and full name**, without requiring login. Missing/uncertain matches remain unlinked for staff review. A public confirmation reveals neither the patient link nor their history. Matching a record does not authenticate the guest.
- Non-insurance invoices issue immediately after a completed demo treatment. Insurance invoices wait until **business day 7**, with a displayed window through day 14. The local job checks every minute while the app runs and catches up at restart. Business dates use Pacific time, Monday–Friday excluding observed US federal holidays. **Simulate insurance day 7** explicitly advances only the demo processing input, not the host clock. No insurer is contacted.
- Cancellation **24 hours or less before** the appointment, including exactly 24 hours, creates a **$50** fictional fee. The demo control exercises this boundary; it does not cancel an unrelated existing appointment.
- The **third consecutive no-show** creates a **$100** fee and blocks all new public/staff clinic bookings for the fictional patient. Attendance resets the streak; cancellations leave it unchanged. Authorized staff unblocking removes the restriction and resets the count to zero. A booking block still requires staff removal.
- Actual amount received is recorded independently of the correct bill. An underpayment remains a balance due. An overpayment permits only the **exact remaining difference** above the correct bill; approved refunds reserve that difference and cannot be duplicated. Original invoice/payment records remain intact. Estimated refund processing is **3–5 US business days after approval**. **Simulate refund completion** creates a fictional completion record, never a bank confirmation.
- Credit card, PayPal, Apple Pay, Samsung Pay and Google Pay/Android can be exercised as fictional ledger methods. **Venmo and Zelle are separately recorded external methods**, not Stripe receipts. No live payment method is enabled by recording these fixtures. Actual Stripe method availability needs account/device/country validation.

**Run demo setup** creates a fictional initial treatment paid $180, followed by a history-detected $120 follow-up incorrectly paid $180, with a $60 overpayment refund approved. Repeating setup reuses these records. Open **Billing & Payments** to inspect invoices, receipts, refund estimates, insurance scheduling and policy controls. Only explicitly marked fictional billing patients are accepted by this ledger.

## Staff permissions and remaining live work

Administrators may use the demo ledger. A separate development-only signed billing session supports **clinic staff**, with credentials `billing.staff@example.invalid` / `DemoBilling!2026`. Open Billing & Payments without an administrator cookie to use its sign-in form. This session cannot access patient administration, appointment administration, audit logs or System Status, and changing client-side role data cannot grant API permissions. The staff directory itself does not grant login access.

The billing APIs reject anonymous/cross-origin mutations, validate prices and refund amounts on the server, and commit ledger changes with safe audit entries. Request references prevent duplicate treatment, payment and refund operations when retried. All demo financial APIs/sessions are disabled in production.

Before real billing: provision real staff accounts/roles, configure payment collection and verified processor/refund receipts, confirm tax/invoice requirements, connect insurance operations and deploy a persistent scheduler. These are not silently inferred from the demo. No credentials belong in chat.
