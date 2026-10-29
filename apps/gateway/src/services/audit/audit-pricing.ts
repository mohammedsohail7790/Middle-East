/**
 * The price of the Opportunity Audit in each currency. The audit is 5,000 AED, one week, not credited against the build.
 * Hk sets the price for every other country; until a price is set here the payment page says so instead of guessing.
 * Set AUDIT_PRICES_JSON to override or add prices, for example {"AED":5000,"SAR":5100,"OMR":520}. Amounts are in whole currency units (decimals allowed).
 */
export const AUDIT_CURRENCIES = ['AED', 'SAR', 'QAR', 'KWD', 'BHD', 'OMR'] as const;
export type AuditCurrency = (typeof AUDIT_CURRENCIES)[number];

const DEFAULT_PRICES: Partial<Record<AuditCurrency, number>> = { AED: 5000 };

/** Currencies that Stripe counts in thousandths (three decimals). */
const THREE_DECIMALS = new Set<string>(['KWD', 'BHD', 'OMR']);

export function auditPrices(env: NodeJS.ProcessEnv = process.env): Partial<Record<AuditCurrency, number>> {
  const prices: Partial<Record<AuditCurrency, number>> = { ...DEFAULT_PRICES };
  const raw = env.AUDIT_PRICES_JSON;
  if (!raw) return prices;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const cur of AUDIT_CURRENCIES) {
      const v = parsed[cur];
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) prices[cur] = v;
    }
  } catch {
    /* an unreadable setting leaves the defaults */
  }
  return prices;
}

export function isAuditCurrency(value: unknown): value is AuditCurrency {
  return typeof value === 'string' && (AUDIT_CURRENCIES as readonly string[]).includes(value);
}

/** The amount Stripe expects: the smallest unit of the currency, as a whole number. For three-decimal currencies Stripe also needs the last digit to be zero. */
export function minorUnits(currency: AuditCurrency, amount: number): number {
  if (THREE_DECIMALS.has(currency)) return Math.round(amount * 100) * 10;
  return Math.round(amount * 100);
}

export function formatPrice(currency: AuditCurrency, amount: number): string {
  const decimals = THREE_DECIMALS.has(currency) ? 3 : 2;
  const text = Number.isInteger(amount) ? amount.toLocaleString('en-US') : amount.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `${currency} ${text}`;
}
