export type PaymentVerification = {
  webhookVerified?: boolean;
  verifiedResult?: string | null;
  registrationStatus?: "pending_payment" | "enrolled" | null;
};

export const paymentVerificationState = (payment: PaymentVerification) => {
  if (!payment.webhookVerified || payment.verifiedResult === "pending")
    return "pending";
  if (payment.verifiedResult === "success")
    return payment.registrationStatus === "enrolled"
      ? "confirmed"
      : "unmatched";
  return payment.verifiedResult === "failed" ||
    payment.verifiedResult === "denied"
    ? "failed"
    : "pending";
};
