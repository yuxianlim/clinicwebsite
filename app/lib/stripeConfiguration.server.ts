import { createHash } from "node:crypto";

export const stripeConfiguration = () => {
  const secret = process.env.STRIPE_SECRET_KEY ?? "";
  const publishable = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
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
