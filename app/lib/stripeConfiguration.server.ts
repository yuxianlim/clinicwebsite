import { createHash } from "node:crypto";
import { restrictedFictionalStagingEnabled } from "./deploymentMode";

export const stripeConfiguration = () => {
  const secret = process.env.STRIPE_SECRET_KEY ?? "";
  const publishable = process.env.STRIPE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
  const mode =
    secret.startsWith("sk_test_") && publishable.startsWith("pk_test_")
      ? "test"
      : secret.startsWith("sk_live_") && publishable.startsWith("pk_live_")
        ? "live"
        : null;
  return {
    mode,
    scope: mode
      ? createHash("sha256").update(`${secret}\0${publishable}`).digest("hex")
      : null,
  };
};

export const stagingStripeSandboxConfigured = () => {
  if (!restrictedFictionalStagingEnabled()) return true;
  const secret = process.env.STRIPE_SECRET_KEY ?? "";
  const publishable = process.env.STRIPE_PUBLISHABLE_KEY ?? "";
  const webhook = process.env.STRIPE_WEBHOOK_SECRET ?? "";
  return stripeConfiguration().mode === "test"
    && secret.startsWith("sk_test_")
    && publishable.startsWith("pk_test_")
    && webhook.startsWith("whsec_")
    && ![secret, publishable].some((value) => value.includes("_live_"));
};

export const sandboxPublishableKey = () => stripeConfiguration().mode === "test"
  ? (process.env.STRIPE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null)
  : null;
