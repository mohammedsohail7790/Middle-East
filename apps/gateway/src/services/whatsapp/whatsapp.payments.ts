/**
 * Payment links for WhatsApp chats. Staff pick an amount in the dashboard; the link is made with the CLIENT's own Stripe key
 * (restricted key, stored encrypted), so the money goes to the client's Stripe account and Halla never touches it.
 * The AI never creates a charge.
 */

const STRIPE = 'https://api.stripe.com/v1';

/** Two-decimal currencies only; amounts are in major units (e.g. 150 = AED 150.00). */
export const PAYMENT_CURRENCIES = ['aed', 'sar', 'qar', 'usd', 'eur', 'gbp'] as const;
export type PaymentCurrency = (typeof PAYMENT_CURRENCIES)[number];
export const MAX_PAYMENT_AMOUNT = 50_000;

export class StripeError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export function looksLikeStripeKey(key: string): boolean {
  return /^(sk|rk)_(live|test)_[A-Za-z0-9]{16,}$/.test(key.trim());
}

async function stripe(path: string, key: string, params?: Record<string, string>, method: 'GET' | 'POST' = 'POST'): Promise<any> {
  const res: any = await fetch(`${STRIPE}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    body: method === 'POST' ? new URLSearchParams(params ?? {}).toString() : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new StripeError(json?.error?.message || `Stripe ${res.status}`, res.status);
  return json;
}

/** Confirms the key can work with Payment Links (needs the Payment Links and Products permissions). */
export async function verifyStripeKey(key: string): Promise<void> {
  await stripe('payment_links?limit=1', key, undefined, 'GET');
  await stripe('products?limit=1', key, undefined, 'GET');
}

export function toMinorUnits(amount: number): number {
  return Math.round(amount * 100);
}

export async function createPaymentLink(
  key: string,
  input: { amount: number; currency: PaymentCurrency; description: string; customerPhone: string }
): Promise<{ url: string; id: string }> {
  const product = await stripe('products', key, { name: input.description.slice(0, 120) });
  const link = await stripe('payment_links', key, {
    'line_items[0][price_data][currency]': input.currency,
    'line_items[0][price_data][product]': String(product.id),
    'line_items[0][price_data][unit_amount]': String(toMinorUnits(input.amount)),
    'line_items[0][quantity]': '1',
    'metadata[source]': 'halla_whatsapp',
    'metadata[customer_phone]': input.customerPhone,
  });
  return { url: String(link.url), id: String(link.id) };
}
