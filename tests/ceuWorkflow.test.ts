import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { mock } from "node:test";
import Stripe from "stripe";
import { paymentVerificationState } from "../app/lib/paymentVerification";

test("payment confirmation waits for signed settlement instead of rejecting processing events", () => {
  assert.equal(
    paymentVerificationState({
      webhookVerified: false,
      verifiedResult: "success",
      registrationStatus: "enrolled",
    }),
    "pending",
  );
  assert.equal(
    paymentVerificationState({
      webhookVerified: true,
      verifiedResult: "pending",
      registrationStatus: "pending_payment",
    }),
    "pending",
  );
  assert.equal(
    paymentVerificationState({
      webhookVerified: true,
      verifiedResult: "success",
      registrationStatus: "enrolled",
    }),
    "confirmed",
  );
  assert.equal(
    paymentVerificationState({
      webhookVerified: true,
      verifiedResult: "success",
      registrationStatus: "pending_payment",
    }),
    "unmatched",
  );
  assert.equal(
    paymentVerificationState({
      webhookVerified: true,
      verifiedResult: "failed",
    }),
    "failed",
  );
});

// Local SDK fixtures only: this suite never contacts Stripe or writes working application data.
test("CEU handler, durable setup evidence, and signed enrollment are consistent", async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "clinic-ceu-"));
  const values = {
    AUDIT_LOG_DB_PATH: path.join(root, "audit.sqlite"),
    STRIPE_SECRET_KEY: `sk_test_${randomBytes(16).toString("hex")}`,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: `pk_test_${randomBytes(16).toString("hex")}`,
    STRIPE_WEBHOOK_SECRET: randomBytes(32).toString("hex"),
  };
  const before = new Map(
    Object.keys(values).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, values);
  const store = await import("../app/lib/auditStore.server");
  const { stripeConfiguration } =
    await import("../app/lib/stripeConfiguration.server");
  const setup = await import("../app/api/stripe/payment_intent/route");
  const webhook = await import("../app/api/stripe/webhook/route");
  let serial = 0;
  const create = mock.method(
    Stripe.resources.PaymentIntents.prototype,
    "create",
    async () => {
      serial++;
      return {
        id: `pi_fixture${serial}`,
        client_secret: `pi_fixture${serial}_secret_localFixture`,
        livemode: false,
      };
    },
  );
  const cancel = mock.method(
    Stripe.resources.PaymentIntents.prototype,
    "cancel",
    async () => ({ status: "canceled" }),
  );
  const request = () =>
    new Request("http://localhost/api/stripe/payment_intent", {
      method: "POST",
      body: JSON.stringify({
        name: "Fictional Learner",
        email: "learner@example.invalid",
        topicId: "fall-prevention",
      }),
    });
  let registrationId = "";
  const signedEvent = (
    id: string,
    type: string,
    metadata: Record<string, string>,
    created = Math.floor(Date.now() / 1000),
  ) => {
    const payload = JSON.stringify({
      id,
      object: "event",
      type,
      created,
      livemode: false,
      data: {
        object: {
          object: "payment_intent",
          id: "pi_fixture1",
          currency: "usd",
          amount: 9500,
          metadata,
        },
      },
    });
    return new Request("http://localhost/api/stripe/webhook", {
      method: "POST",
      headers: {
        "stripe-signature": Stripe.webhooks.generateTestHeaderString({
          payload,
          secret: values.STRIPE_WEBHOOK_SECRET,
        }),
      },
      body: payload,
    });
  };
  try {
    await t.test(
      "missing or mismatched keys cannot create setup evidence",
      async () => {
        process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY =
          "pk_live_mismatched_fixture";
        assert.equal((await setup.POST(request())).status, 503);
        assert.equal(create.mock.callCount(), 0);
        assert.equal(
          store.getLatestCeuPaymentSetup(stripeConfiguration().scope),
          null,
        );
        process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY =
          values.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
      },
    );
    await t.test(
      "successful handler setup atomically records pending registration and safe audit evidence",
      async () => {
        const response = await setup.POST(request());
        assert.equal(response.status, 200);
        assert.ok((await response.json()).clientSecret);
        const receipt = store.getLatestCeuPaymentSetup(
          stripeConfiguration().scope,
        )!;
        assert.equal(receipt.paymentIntentId, "pi_fixture1");
        registrationId = receipt.registrationId;
        assert.equal(
          store.getCeuEnrollmentByPaymentIntent("pi_fixture1")?.status,
          "pending_payment",
        );
        assert.equal(store.getAuditStoreStatus().chainValid, true);
        const audit = JSON.stringify(store.listAuditEvents(100));
        assert.equal(audit.includes("learner@example.invalid"), false);
        process.env.STRIPE_SECRET_KEY += "rotated";
        assert.equal(
          store.getLatestCeuPaymentSetup(stripeConfiguration().scope),
          null,
        );
        process.env.STRIPE_SECRET_KEY = values.STRIPE_SECRET_KEY;
      },
    );
    await t.test(
      "a persistence failure cancels the unissued intent and rolls back the entire setup",
      async () => {
        const database = new DatabaseSync(values.AUDIT_LOG_DB_PATH);
        database.exec(
          "CREATE TRIGGER reject_fixture_setup BEFORE INSERT ON ceu_payment_setups BEGIN SELECT RAISE(ABORT, 'fixture'); END",
        );
        assert.equal((await setup.POST(request())).status, 503);
        assert.equal(cancel.mock.callCount(), 1);
        assert.equal(
          store.getCeuEnrollmentByPaymentIntent("pi_fixture2"),
          null,
        );
        assert.equal(
          store.getLatestCeuPaymentSetup(stripeConfiguration().scope)
            ?.paymentIntentId,
          "pi_fixture1",
        );
        database.exec("DROP TRIGGER reject_fixture_setup");
        database.close();
      },
    );
    await t.test(
      "invalid or unmatched webhooks cannot enroll a learner",
      async () => {
        assert.equal(
          (
            await webhook.POST(
              new Request("http://localhost/api/stripe/webhook", {
                method: "POST",
                body: "{}",
                headers: { "stripe-signature": "invalid" },
              }),
            )
          ).status,
          400,
        );
        assert.equal(
          (
            await webhook.POST(
              signedEvent("evt_no_registration", "payment_intent.succeeded", {
                topicId: "fall-prevention",
              }),
            )
          ).status,
          400,
        );
        assert.equal(
          store.getCeuEnrollmentByPaymentIntent("pi_fixture1")?.status,
          "pending_payment",
        );
      },
    );
    await t.test(
      "signed settlement enrolls once, and later processing events cannot downgrade it",
      async () => {
        const metadata = { topicId: "fall-prevention", registrationId };
        assert.equal(
          (
            await webhook.POST(
              signedEvent("evt_success", "payment_intent.succeeded", metadata),
            )
          ).status,
          200,
        );
        assert.equal(
          store.getCeuEnrollmentByPaymentIntent("pi_fixture1")?.status,
          "enrolled",
        );
        assert.equal(
          (
            await (
              await webhook.POST(
                signedEvent(
                  "evt_success",
                  "payment_intent.succeeded",
                  metadata,
                ),
              )
            ).json()
          ).duplicate,
          true,
        );
        assert.equal(
          (
            await webhook.POST(
              signedEvent(
                "evt_late_processing",
                "payment_intent.processing",
                metadata,
                Math.floor(Date.now() / 1000) + 1,
              ),
            )
          ).status,
          200,
        );
        assert.equal(
          store.getVerifiedStripePaymentState("pi_fixture1")?.result,
          "success",
        );
        assert.equal(
          store.getLatestCeuEnrollment()?.registrationId,
          registrationId,
        );
        assert.equal(store.getAuditStoreStatus().chainValid, true);
      },
    );
  } finally {
    create.mock.restore();
    cancel.mock.restore();
    const globals = globalThis as typeof globalThis & {
      clinicAuditDatabase?: DatabaseSync;
    };
    globals.clinicAuditDatabase?.close();
    delete globals.clinicAuditDatabase;
    for (const [key, value] of before) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(root, { recursive: true, force: true });
  }
});
