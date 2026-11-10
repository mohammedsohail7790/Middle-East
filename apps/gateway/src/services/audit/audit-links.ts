import { randomBytes } from 'node:crypto';
import { signLink, type LinkPayload } from './signed-link.js';
import { isAuditCurrency, type AuditCurrency } from './audit-pricing.js';

/**
 * The private links of the audit, made by the server so the whole flow can run without anyone using the command-line script. Every link is signed with
 * AUDIT_LINK_SECRET, so without that setting no link can be made and the flow falls back to the manual way.
 */
export const SITE = process.env.PUBLIC_SITE_URL || 'https://hallaai.com';
const GATEWAY = process.env.GATEWAY_PUBLIC_URL || 'https://gateway.hallaai.com';

export const APPROVE_DAYS = 14;
export const QUESTIONNAIRE_DAYS = 30;
export const PAYMENT_WINDOW_DAYS = 5;
/** How long the "audit is ready, send the payment link" button works: the analysis takes about a week, so it has to outlive that with room to spare. */
export const SEND_PAYMENT_DAYS = 45;

export const newLinkId = (): string => randomBytes(4).toString('hex');
const expiry = (days: number): number => Math.floor(Date.now() / 1000 + days * 86400);

export type LinkWho = { id?: string; company: string; email: string; name?: string; cur?: string };

function make(kind: LinkPayload['k'], who: LinkWho, days: number): string | null {
  const secret = process.env.AUDIT_LINK_SECRET;
  if (!secret) return null;
  const payload: LinkPayload = { k: kind, id: who.id ?? newLinkId(), company: who.company.slice(0, 200), email: who.email, x: expiry(days) };
  if (who.name) payload.name = who.name.slice(0, 80);
  if (who.cur && isAuditCurrency(who.cur)) payload.cur = who.cur as AuditCurrency;
  return signLink(payload, secret);
}

/** The button in the fit-check email: opens a page on the gateway where one click sends the client the questionnaire. */
export function approveUrl(who: LinkWho): string | null {
  const t = make('approve', who, APPROVE_DAYS);
  return t ? `${GATEWAY}/api/v1/public/audit/approve?t=${encodeURIComponent(t)}` : null;
}

/** The button in the "questionnaire received" email for us: once the audit is ready, one click emails the client the payment link. */
export function sendPaymentUrl(who: LinkWho): string | null {
  const t = make('sendpay', who, SEND_PAYMENT_DAYS);
  return t ? `${GATEWAY}/api/v1/public/audit/send-payment?t=${encodeURIComponent(t)}` : null;
}

export function questionnaireUrl(who: LinkWho): string | null {
  const t = make('form2', who, QUESTIONNAIRE_DAYS);
  return t ? `${SITE}/audit?t=${encodeURIComponent(t)}` : null;
}

export function paymentUrl(who: LinkWho): string | null {
  const t = make('pay', who, PAYMENT_WINDOW_DAYS);
  return t ? `${SITE}/audit/pay?t=${encodeURIComponent(t)}` : null;
}

export const firstName = (full: string | undefined): string | undefined => {
  const f = (full ?? '').trim().split(/\s+/)[0];
  return f ? f.slice(0, 40) : undefined;
};
