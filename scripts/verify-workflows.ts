import { loadEnvConfig } from "@next/env";
import { Secret, TOTP } from "otpauth";
import Stripe from "stripe";
import { developmentVerificationOrigin } from "../app/lib/developmentVerification";
import {
  paymentVerificationState,
  type PaymentVerification,
} from "../app/lib/paymentVerification";
import { stripeConfiguration } from "../app/lib/stripeConfiguration.server";

loadEnvConfig(process.cwd(), true);
const workflowNames = {
  booking: "Public booking -> appointment state",
  kiosk: "Kiosk -> patient list and appointment state",
  patient: "Patient management -> durable records and audit",
  staff: "Staff management -> durable records and audit",
  appointment: "Appointment changes -> shared storage and audit",
  connectivity: "Stripe test-mode API connectivity",
  backup: "Database -> backups and recovery",
  setup: "CEU form -> Stripe PaymentIntent",
  audit: "Stripe.js outcome -> audit log",
  enrollment: "Verified payment -> CEU enrollment",
};
type SystemStatus = {
  environment: string;
  stripeMode?: string;
  items: { name: string; status: string; lastTestedAt?: string }[];
};
type Patient = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
};

const main = async () => {
  const args = process.argv.slice(2);
  let address = "http://localhost:3000";
  let includeStripe = false;
  let includeBackup = false;
  let resumeId = "";
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--stripe") includeStripe = true;
    else if (args[index] === "--backup") includeBackup = true;
    else if (args[index] === "--url" && args[index + 1])
      address = args[++index];
    else if (args[index] === "--payment-intent" && args[index + 1])
      resumeId = args[++index];
    else
      throw new Error(
        "Usage: npm run verify:workflows -- [--stripe] [--backup] [--url http://localhost:3000] [--payment-intent pi_...]",
      );
  }
  if (process.env.NODE_ENV === "production")
    throw new Error("This verifier is for development only.");
  const origin = developmentVerificationOrigin(address);
  if (resumeId && (!includeStripe || !/^pi_[A-Za-z0-9]+$/.test(resumeId)))
    throw new Error(
      "Use a PaymentIntent ID with --stripe; never supply its client secret.",
    );
  const demo = process.env.ENABLE_DEVELOPMENT_ADMIN_DEMO === "true";
  const email =
    process.env.CLINIC_ADMIN_EMAIL ??
    (demo ? "workflow-check@example.invalid" : "");
  const password =
    process.env.CLINIC_ADMIN_PASSWORD ??
    (demo ? "development-workflow-check" : "");
  if (!email || !password)
    throw new Error(
      "Configure administrator credentials in .env.local. An intentional development demo also requires ENABLE_DEVELOPMENT_ADMIN_DEMO=true in both the server and verifier terminals.",
    );
  let code = "";
  if (!demo) {
    const secret = process.env.CLINIC_ADMIN_TOTP_SECRET;
    if (!secret)
      throw new Error("CLINIC_ADMIN_TOTP_SECRET is missing from .env.local.");
    code = new TOTP({
      secret: Secret.fromBase32(secret),
      algorithm: "SHA1",
      digits: 6,
      period: 30,
    }).generate();
  }
  const signIn = await fetch(`${origin}/api/clinic/session`, {
    method: "POST",
    redirect: "error",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, code, method: "email" }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!signIn.ok)
    throw new Error(
      `Administrator sign-in failed (HTTP ${signIn.status}). Check credentials and, if the authenticator code was already used, wait for the next 30-second window. Restart the server after changing .env.local.`,
    );
  const cookie = signIn.headers.get("set-cookie")?.split(";")[0];
  if (!cookie?.startsWith("clinic_admin_session="))
    throw new Error("The server did not issue an administrator session.");
  const call = async <T>(
    route: string,
    method = "GET",
    body?: unknown,
    admin = false,
  ) => {
    const response = await fetch(`${origin}${route}`, {
      method,
      redirect: "error",
      cache: "no-store",
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(admin ? { Cookie: cookie } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok)
      throw new Error(
        `${route} returned HTTP ${response.status}. Check the local server logs; no secret values are included in this report.`,
      );
    return response.json() as Promise<T>;
  };
  const status = await call<SystemStatus>(
    "/api/system-status",
    "GET",
    undefined,
    true,
  );
  if (status.environment !== "Development")
    throw new Error(
      "The target is not a development server. No patient, booking or payment test records were created.",
    );
  const connected = (report: SystemStatus, name: string) =>
    report.items.find((item) => item.name === name)?.status === "Connected";
  const localNames = [
    workflowNames.patient,
    workflowNames.booking,
    workflowNames.kiosk,
  ];
  if (!localNames.every((name) => connected(status, name))) {
    console.log(
      "Creating a clearly named Development Check patient and a same-day test appointment in this DEVELOPMENT database.",
    );
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const practitioner = "李医生";
    const query = new URLSearchParams({ date: today, practitioner });
    const { unavailableTimes } = await call<{ unavailableTimes: string[] }>(
      `/api/appointments?${query}`,
    );
    const times = Array.from({ length: 18 }, (_, index) => {
      const total = 9 * 60 + index * 30;
      const hour = Math.floor(total / 60);
      return `${hour > 12 ? hour - 12 : hour}:${total % 60 === 0 ? "00" : "30"} ${hour >= 12 ? "PM" : "AM"}`;
    });
    const time = times.find(
      (candidate) => !unavailableTimes.includes(candidate),
    );
    if (!time)
      throw new Error(
        "No free test slot is available for today. No new patient was created.",
      );
    const { patients } = await call<{ patients: Patient[] }>(
      "/api/admin/patients",
      "GET",
      undefined,
      true,
    );
    const suffixes = new Set(
      patients.map((patient) => patient.phone.replace(/\D/g, "").slice(-4)),
    );
    const phone = Array.from(
      { length: 100 },
      (_, index) => `40855501${String(99 - index).padStart(2, "0")}`,
    ).find((candidate) => !suffixes.has(candidate.slice(-4)));
    if (!phone)
      throw new Error(
        "No unambiguous reserved fictional phone suffix is available.",
      );
    const { patient } = await call<{ patient: Patient }>(
      "/api/admin/patients",
      "POST",
      { firstName: "Development", lastName: "Check", phone },
      true,
    );
    const saved = await call<{ patients: Patient[] }>(
      "/api/admin/patients",
      "GET",
      undefined,
      true,
    );
    if (!saved.patients.some((item) => item.id === patient.id))
      throw new Error("Patient registration was not durable.");
    const { appointment } = await call<{ appointment: { id: string } }>(
      "/api/appointments",
      "POST",
      {
        name: "Development Check",
        contact: phone,
        date: today,
        time,
        practitioner,
      },
    );
    const availability = await call<{ unavailableTimes: string[] }>(
      `/api/appointments?${query}`,
    );
    if (!availability.unavailableTimes.includes(time))
      throw new Error("The booked slot was not persisted.");
    const lookup = await call<{
      patient: { id: string };
      appointment: { id: string };
      checkInToken: string;
    }>("/api/kiosk/lookup", "POST", { lastFour: phone.slice(-4) });
    if (
      lookup.patient.id !== patient.id ||
      lookup.appointment.id !== appointment.id
    )
      throw new Error(
        "Kiosk lookup did not match the new patient and appointment.",
      );
    const checked = await call<{ checkedIn: boolean }>(
      "/api/kiosk/check-in",
      "POST",
      { appointmentId: appointment.id, checkInToken: lookup.checkInToken },
    );
    if (!checked.checkedIn) throw new Error("Check-in was not confirmed.");
    const records = await call<{
      appointments: { id: string; checkedInAt?: string }[];
    }>("/api/admin/appointments", "GET", undefined, true);
    if (
      !records.appointments.some(
        (item) => item.id === appointment.id && item.checkedInAt,
      )
    )
      throw new Error("Check-in was not persisted.");
  }
  if (!connected(status, workflowNames.staff)) {
    console.log("Adding a clearly named development staff DIRECTORY record; this does not grant login access.");
    const { staff } = await call<{ staff: { id: string } }>(
      "/api/admin/staff", "POST", {
        name: `Development Directory Check ${Date.now()}`,
        role: "Development test record",
        hours: "Test only; no scheduled hours",
      }, true,
    );
    const saved = await call<{ staff: { id: string }[] }>("/api/admin/staff", "GET", undefined, true);
    if (!saved.staff.some((item) => item.id === staff.id))
      throw new Error("Staff directory addition was not durable.");
  }
  if (!connected(status, workflowNames.appointment)) {
    console.log("Creating and canceling a separate fictional development appointment; existing appointments are not changed.");
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
    const practitioner = "李医生";
    const query = new URLSearchParams({ date, practitioner });
    const { unavailableTimes } = await call<{ unavailableTimes: string[] }>(`/api/appointments?${query}`);
    const time = Array.from({ length: 18 }, (_, index) => {
      const hour = 9 + Math.floor(index / 2);
      return `${hour > 12 ? hour - 12 : hour}:${index % 2 ? "30" : "00"} ${hour >= 12 ? "PM" : "AM"}`;
    }).find((candidate) => !unavailableTimes.includes(candidate));
    if (!time) throw new Error("No free slot is available for the separate appointment-change check.");
    const { appointment } = await call<{ appointment: { id: string } }>("/api/appointments", "POST", {
      name: "Development Appointment Check", contact: "4085550199", date, time, practitioner,
    });
    await call("/api/admin/appointments", "DELETE", { id: appointment.id }, true);
    const saved = await call<{ appointments: { id: string; status: string }[] }>("/api/admin/appointments", "GET", undefined, true);
    if (!saved.appointments.some((item) => item.id === appointment.id && item.status === "cancelled"))
      throw new Error("Appointment cancellation was not durable.");
    const released = await call<{ unavailableTimes: string[] }>(`/api/appointments?${query}`);
    if (released.unavailableTimes.includes(time))
      throw new Error("Cancellation did not release the development appointment slot.");
  }
  localNames.push(workflowNames.staff, workflowNames.appointment);
  const localReport = await call<SystemStatus>(
    "/api/system-status",
    "GET",
    undefined,
    true,
  );
  for (const name of localNames) {
    if (!connected(localReport, name))
      throw new Error(
        `${name}: required durable/audit evidence is still missing.`,
      );
    console.log(`PASS: ${name}`);
  }
  if (includeBackup) {
    const { backupSources, backupDirectory, createVerifiedBackup } = await import("../app/lib/databaseBackup.server");
    const { receipt } = await createVerifiedBackup(backupSources(), backupDirectory());
    const report = await call<SystemStatus>("/api/system-status", "GET", undefined, true);
    const item = report.items.find((item) => item.name === workflowNames.backup);
    if (item?.lastTestedAt !== receipt.checkedAt)
      throw new Error("The application cannot see this backup receipt. Match database paths and CLINIC_BACKUP_DIR in the server and verifier environments.");
    console.log("PASS: Local backup and isolated restore; snapshot checksums and audit chain verified.");
    console.log("Managed disaster recovery remains incomplete: configure scheduling, protected encrypted off-host storage, retention and a separate-host recovery test.");
  }
  if (!includeStripe) {
    console.log(
      "Stripe checks were not run. Use --stripe with matching sandbox keys and the Stripe listener running.",
    );
    return;
  }
  const configuration = stripeConfiguration();
  if (configuration.mode !== "test" || !process.env.STRIPE_WEBHOOK_SECRET)
    throw new Error(
      "Stripe verification requires matching sk_test_/pk_test_ values and STRIPE_WEBHOOK_SECRET in .env.local. Live keys are refused.",
    );
  if (localReport.stripeMode !== "test")
    throw new Error(
      "The APPLICATION is not configured for sandbox payments. Pull the updated code and restart npm run dev with matching test keys before proceeding.",
    );
  console.log("Running the protected sandbox create-and-cancel connectivity check; no payment is collected by this probe.");
  await call("/api/system-status/stripe-test", "POST", undefined, true);
  const stripeReport = await call<SystemStatus>("/api/system-status", "GET", undefined, true);
  if (!connected(stripeReport, workflowNames.connectivity))
    throw new Error("Stripe connectivity check did not produce a successful dashboard receipt.");
  console.log(`PASS: ${workflowNames.connectivity}`);
  if (!resumeId && [workflowNames.setup, workflowNames.audit, workflowNames.enrollment].every((name) => connected(stripeReport, name))) {
    console.log("PASS: CEU setup, signed payment audit and enrollment already have evidence. No additional sandbox payment was created.");
    return;
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-06-24.dahlia",
    timeout: 10_000,
    maxNetworkRetries: 0,
  });
  let intentId = resumeId;
  if (!intentId) {
    console.log(
      "Running the real CEU handler with fictional learner details; only a sandbox test card will be used.",
    );
    const setup = await call<{ clientSecret: string }>(
      "/api/stripe/payment_intent",
      "POST",
      {
        name: "Development Check",
        email: "workflow-check@example.invalid",
        topicId: "fall-prevention",
      },
    );
    intentId = setup.clientSecret?.split("_secret_")[0];
    if (!/^pi_[A-Za-z0-9]+$/.test(intentId ?? ""))
      throw new Error(
        "The application did not return a usable sandbox payment reference.",
      );
  }
  try {
    const intent = await stripe.paymentIntents.retrieve(intentId);
    if (
      intent.livemode ||
      intent.currency !== "usd" ||
      intent.amount !== 9500 ||
      intent.metadata.topicId !== "fall-prevention"
    )
      throw new Error("Unexpected payment details.");
    if (!intent.client_secret)
      throw new Error("The payment has no client secret.");
    const browserStripe = new Stripe(
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!,
      {
        apiVersion: "2026-06-24.dahlia",
        timeout: 10_000,
        maxNetworkRetries: 0,
      },
    );
    const browserIntent = await browserStripe.paymentIntents.retrieve(
      intentId,
      { client_secret: intent.client_secret },
    );
    if (browserIntent.id !== intentId)
      throw new Error(
        "The publishable key could not access the application intent.",
      );
    const beforePayment = await call<PaymentVerification>(
      `/api/stripe/payment_status?paymentIntentId=${intentId}`,
    );
    if (!beforePayment.registrationStatus)
      throw new Error(
        "The payment does not match this application registration.",
      );
    if (intent.status === "requires_payment_method") {
      console.log(
        "Confirming the USD 95 SANDBOX payment with Stripe’s pm_card_visa fixture. No real money is collected.",
      );
      await stripe.paymentIntents.confirm(
        intentId,
        { payment_method: "pm_card_visa", return_url: `${origin}/#ceu` },
        { idempotencyKey: `development-verifier-${intentId}` },
      );
    } else if (!["succeeded", "processing"].includes(intent.status))
      throw new Error(
        "The test payment requires additional action or was canceled.",
      );
  } catch {
    console.error(`Payment reference: ${intentId}`);
    throw new Error(
      "Sandbox payment could not be confirmed. Check matching sandbox keys, network access, and the test PaymentIntent in Stripe. No confirmation is automatically retried.",
    );
  }
  console.log(
    "Waiting for Stripe to deliver a genuine signed webhook through the local listener...",
  );
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    let state: ReturnType<typeof paymentVerificationState> = "pending";
    try {
      state = paymentVerificationState(
        await call<PaymentVerification>(
          `/api/stripe/payment_status?paymentIntentId=${intentId}`,
        ),
      );
    } catch {
      /* Retry temporary read failures until the deadline; never repeat payment confirmation. */
    }
    if (state === "confirmed") {
      const report = await call<SystemStatus>(
        "/api/system-status",
        "GET",
        undefined,
        true,
      );
      for (const name of [
        workflowNames.setup,
        workflowNames.audit,
        workflowNames.enrollment,
      ]) {
        if (!connected(report, name))
          throw new Error(
            `${name}: payment settled but matching status evidence is missing.`,
          );
        console.log(`PASS: ${name}`);
      }
      console.log(
        "All eight application workflows and the Stripe connectivity probe have evidence. Fictional development records were retained for inspection.",
      );
      return;
    }
    if (state === "failed" || state === "unmatched")
      throw new Error(
        "Signed payment evidence failed or could not be matched to enrollment. Inspect the sandbox payment before retrying.",
      );
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  console.error(
    `To recheck this SAME payment: npm run verify:workflows -- --stripe --url ${origin} --payment-intent ${intentId}`,
  );
  throw new Error(
    `The sandbox payment is waiting for a matching signed webhook. Keep stripe listen forwarding to ${origin}/api/stripe/webhook; match its current whsec_ value in .env.local and restart the app. Do not create another payment to retry verification.`,
  );
};

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error && error.constructor === Error
      ? error.message
      : "Workflow verification failed. Check the local server and Stripe listener logs; secret values are never printed by this verifier.",
  );
  process.exitCode = 1;
});
