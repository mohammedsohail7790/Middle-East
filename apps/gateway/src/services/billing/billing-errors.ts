export class BillingNotConfiguredError extends Error {
  readonly statusCode = 503;
  readonly code = 'BILLING_NOT_CONFIGURED';

  constructor(message = 'Billing is not configured on the server. Set STRIPE_SECRET_KEY on the gateway.') {
    super(message);
    this.name = 'BillingNotConfiguredError';
  }
}

export function isBillingConfigError(err: unknown): boolean {
  if (err instanceof BillingNotConfiguredError) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /billing not configured|stripe is not configured|STRIPE_SECRET_KEY/i.test(msg);
}
