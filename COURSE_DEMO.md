# Demo learner workspace

This is a development-only preview for fictional learner data. Hosting and clinic billing are deferred. The requested organizer display name is **Whitewater University of California**. No course approval IDs, provider approval IDs or credit hours have been supplied: the demo does not claim CAB/NCBAHM approval or award approved CE credit.

## Start on Windows / VS Code

1. Update the project code, keeping your existing `.env.local` and `.data` directory.
2. Add this line to `.env.local`:

   ```dotenv
   ENABLE_DEVELOPMENT_CEU_DEMO=true
   ```

3. Keep the matching Stripe **sandbox** secret/publishable keys and the actual listener's webhook secret configured. No key values belong in source control or chat.
4. Restart `npm run dev`. Open `/learn` on the port shown by Next.js, or choose **Open learning workspace** on the home page.
5. Keep the Stripe CLI running in another terminal:

   ```powershell
   stripe listen --events "payment_intent.succeeded,payment_intent.processing,payment_intent.payment_failed,payment_intent.canceled" --forward-to http://localhost:3000/api/stripe/webhook
   ```

   Match the app port. If the listener secret changes, update `.env.local` privately and restart the application.
6. Create a learner account using fictional details and a unique password of at least 12 characters. This account is separate from the clinic administrator login.
7. Select a demo course and open sandbox checkout. Use Stripe's test card `4242 4242 4242 4242`, any future expiration date and any three-digit CVC. No real money is collected. Live payments are refused.
8. Wait for signed payment confirmation before starting. If delivery is delayed, fix the listener and use **Refresh account**. A checkout retry resumes the same pending intent rather than creating another purchase.
9. Watch both 12-second silent demo videos. Transcripts provide the fictional lesson and exam content. Playback progress is saved server-side; jumping to the end does not complete a lesson.
10. Pass the ten-question final exam with at least 90%. Download the non-credit demo certificate and sandbox payment receipt. They are HTML documents; open them and use the browser's Print command to save as PDF.

The original demo prices are USD 95, 105 and 90. They are placeholder prices carried over from the initial CEU prototype, not approved prices for real courses.

## Confirmed exam policy

Each course has **one final exam**, with three attempts in each paid block. All required videos must be watched in full before the exam. There is no seven-day wait between individual attempts within a block.

| Attempt numbers | Block price | Video requirement |
| --- | --- | --- |
| 1–3 | 100% of the original purchase price | Watch every required video |
| 4–6 | 50% of the original purchase price | Watch every required video again |
| 7–9 | 100% of the original purchase price | Watch every required video again |
| Each later block of three | 100% of the original purchase price | Watch every required video again |

After all three attempts in a block fail, wait seven days from the third failure before buying the next block. A passing score is always **90% or higher**. Prices are calculated on the server from the original price, and each new paid block starts with fresh video progress. The application does not include a clock override or a way to bypass the wait; tests exercise the boundary using isolated fixture clocks.

## Evidence and data

Learner accounts, hashed credentials, sessions, purchases, video progress, final-exam results and demo certificates use the existing audit SQLite database. Existing database backups therefore include these records. Sessions are bound to the session secret; rotate it after disaster recovery as described in the backup runbook.

Card details remain in Stripe. Only a matching signature-verified **sandbox** payment unlocks a course. Learning payment audit events are explicitly labeled demo and do not establish approved enrollment/certificate issuance in System Status. Payment, exam and certificate changes use SQLite transactions. Repeated webhook deliveries and repeated exam submission references are idempotent. Receipts and certificates are restricted to their owning account.

Browser progress checks discourage seeking and implausible jumps; they cannot prove attention or substitute for licensing-board-approved attendance controls. Quiz keys stay server-side. Sample course content teaches the demonstration workflow, not clinical practice.

System Status has five separate **Demo learner workspace** rows for stored accounts, verified sandbox purchases, full video completion, stored exam grading and non-credit certificates. Each connects only after matching records exist in this application's database. The approved-credit certificate row remains Planned until approval details and real content are configured. Format simulations remain separate from real providers, and the Stripe API probe needs refreshing after 15 minutes; this expiration does not remove earlier payment/enrollment evidence.

## Pending before real learners or real credit

- Actual provider and per-course approval details, credit hours, instructional videos, validated assessment content and certificate requirements.
- Approved tax, invoice, cancellation and refund policy. Demo payment receipts are not tax invoices; automatic refunds have not been invented or enabled.
- Email verification, password recovery and production learner-account operations. The entire demo API is disabled in production regardless of its feature flag.
- Ubuntu hosting, SMS verification service, physical membership scanner, monitoring, off-site backup destination, scheduling and retention choices.
- Clinic billing remains deferred by request.

Automated tests use disposable records and locally signed fictional webhook fixtures. They do not contact Stripe or establish real provider connectivity. Test the new checkout with your actual sandbox keys and listener on your Windows copy.
