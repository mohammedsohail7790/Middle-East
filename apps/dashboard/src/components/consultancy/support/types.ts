export type SupportKind = "standard" | "extended" | "partner" | "training";
export type SupportStatus = "pending" | "active" | "past_due" | "cancelled";

export interface Usage {
  month: string;
  usedHours: number;
  includedHours: number;
  percent: number;
  over: boolean;
}

export interface SupportPlanRow {
  id: string;
  lead_id: string;
  kind: SupportKind;
  currency: string;
  price_minor: number;
  hours_included: number;
  status: SupportStatus;
  company?: string | null;
  email?: string | null;
  usage: Usage;
}

export const KIND_LABEL: Record<SupportKind, string> = {
  standard: "Standard",
  extended: "Extended",
  partner: "Partner",
  training: "Training workshop",
};

export const STATUS_LABEL: Record<SupportStatus, string> = {
  pending: "Waiting for payment",
  active: "Active",
  past_due: "Payment overdue",
  cancelled: "Cancelled",
};

/** 75000 -> "AED 750.00" (whole minor units, no floating point). */
export function moneyText(minor: number, currency: string): string {
  const whole = Math.trunc(minor / 100);
  const frac = String(Math.abs(minor % 100)).padStart(2, "0");
  return `${currency} ${whole.toLocaleString("en-US")}.${frac}`;
}

/** "5000" or "5000.50" -> 500000 or 500050. Returns null for anything else. */
export function toMinor(text: string): number | null {
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0") || 0);
}
