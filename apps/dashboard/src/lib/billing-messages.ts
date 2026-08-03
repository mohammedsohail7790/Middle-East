export const PAID_BILLING_NOT_CONFIGURED_MSG =
  "Paid billing is not enabled on the server yet. Your trial still works — add STRIPE_SECRET_KEY on Render and redeploy the gateway.";

/** True only when the gateway reports Stripe is missing — not generic Stripe API errors. */
export function isStripeNotConfiguredError(msg: string): boolean {
  return /billing not configured|STRIPE_SECRET_KEY|stripe is not configured/i.test(msg);
}

export function formatBillingActionError(msg: string): string {
  if (isStripeNotConfiguredError(msg)) return PAID_BILLING_NOT_CONFIGURED_MSG;
  if (/no stripe customer/i.test(msg)) {
    return "Subscribe to a plan first — payment methods are managed after checkout.";
  }
  if (/subscription ended|start a new checkout/i.test(msg)) {
    return "Your previous subscription ended — choose a plan below to check out again.";
  }
  return msg;
}
