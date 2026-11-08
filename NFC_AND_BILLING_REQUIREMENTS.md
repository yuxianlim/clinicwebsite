# Remaining non-infrastructure setup

## Confirmed decisions

- Real SMS stays deferred. Keep the existing fictional phone-code flow.
- Chosen reader model: **ACS ACR1252U**, an NFC/RFID desktop smart-card reader.
- Monitoring uses a **local development alert inbox** for now. No external email/SMS notification service has been selected or contacted.
- Clinic billing is now requested, but its financial rules have not yet been provided. Existing displayed clinic amounts remain samples and invoice/refund actions remain unavailable.
- CEU courses and certificates remain fictional/non-credit until real board/provider/course approval details are available.
- Ubuntu, separate database/server deployment, managed backup scheduling and off-host recovery stay outside the current work.

## Membership card input completed for the demo

Run **System Status → Run demo setup** to obtain a fictional card token. The setup uses a separate marked fictional card-test patient and an eligible appointment. Choose **Scan clinic membership ID** in `/kiosk`, paste the token and press Enter. The server verifies the opaque token against the fictional patient allowlist, returns a limited appointment summary and issues the existing single-use check-in token. Invalid tokens and already checked-in appointments are rejected. Raw card tokens are not logged or echoed by the lookup API.

This input demonstration does **not** access an ACR1252U USB/NFC device or prove a physical scan. The ACR1252U uses the desktop smart-card/PC/SC interface; a local native reader bridge is required for actual browser-based kiosk use. No Web NFC, keyboard-emulation or plug-and-play hardware support is claimed.

Needed before implementing/testing the real reader bridge:

1. Is the reader already available and connected to the Windows kiosk computer?
2. Which cards/tags will be used? Provide the type or product link (for example NTAG213/215/216, MIFARE Classic or DESFire), or say they have not been purchased.
3. Card enrollment and the credential stored/read on the card will be specified after compatibility is known. A bare NFC UID must not silently become a claim of strong patient authentication.

The physical-reader status remains pending until actual device testing. The separate demo card-input row can be Connected from actual stored demo evidence.

## Local alert inbox completed

The protected System Status page contains **Local demo alert inbox** and **Send demo alert**. Test events are restricted to allowlisted event IDs/timestamps/severity/codes and contain no patient, card or credential payloads. A real local receipt is stored with the matching event ID; delivery and its audit entry are atomic. Duplicate event IDs with the same payload reuse their receipt; conflicting payloads are rejected. The inbox shows the latest 50 records without deleting older records.

Run demo setup seeds one local test event idempotently. System Status reports the local-inbox delivery evidence separately from the format-only monitoring simulation. The inbox API requires a development administrator session, rejects cross-origin mutations and is disabled in production. No external alerts are sent and no external delivery receipt is fabricated.

## Clinic billing rules needed

Supply the following before financial mutations are implemented:

- Services/products and prices in USD; discounts/packages if any.
- Payment methods, collection workflow and whether insurance is involved.
- When invoices should be issued and required invoice/receipt information.
- Applicable tax handling once established; no tax rule will be guessed from the CEU prototype.
- Cancellation, no-show, refund and partial-refund rules.
- Roles allowed to issue invoices, record/collect payments, approve refunds and view financial records.

The current authenticated staff capability is administrator access; the staff directory alone does not grant staff login or financial permissions. Additional staff roles require an approved authentication/permission design. Mark undecided rules explicitly rather than supplying defaults that might be mistaken for clinic policy.

No credentials are needed in chat. Real SMS, NFC production credentials and approved certificate details will use secure configuration when those phases are selected.
