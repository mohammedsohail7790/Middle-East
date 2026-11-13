export const CURRENCIES = ["AED", "SAR", "QAR", "KWD", "BHD", "OMR"] as const;
const THREE_DECIMALS = new Set(["KWD", "BHD", "OMR"]);

export interface ProposalItem {
  title: string;
  priceMinor: number;
}

export interface Proposal {
  id: string;
  lead_id: string;
  title: string;
  scope: string;
  items: ProposalItem[];
  currency: string;
  total_minor: number;
  delivery_weeks: number | null;
  valid_until: string;
  language: "en" | "ar";
  status: "draft" | "sent" | "accepted" | "declined" | "expired" | "withdrawn";
  sent_at: string | null;
  accepted_at: string | null;
  accepted_name: string | null;
  accepted_ip: string | null;
  accepted_user_agent: string | null;
  terms_hash: string | null;
  declined_reason: string | null;
}

export interface LeadOption {
  id: string;
  label: string;
}

const perUnit = (currency: string): number => (THREE_DECIMALS.has(currency) ? 1000 : 100);

/** A price typed in whole currency units (for example 8000 or 8000.50) as the smallest unit the gateway stores. */
export function toMinor(amount: number, currency: string): number {
  return Math.round(amount * perUnit(currency));
}

export function formatMoney(minor: number, currency: string): string {
  const amount = minor / perUnit(currency);
  return `${currency} ${amount.toLocaleString("en-US", { maximumFractionDigits: THREE_DECIMALS.has(currency) ? 3 : 2 })}`;
}
