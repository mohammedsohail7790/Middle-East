import { escapeHtml, renderCallout, renderSummaryStrip } from '../automation/email-template.js';
import { sendAuditMail } from '../audit/audit-mail.js';
import { sendClientAuditMail, para } from '../audit/audit-client-mail.js';
import type { SupportPlan, Usage } from './support-store.js';

/** Emails for support plans: the payment link to the client, and the alerts to our own team (hours at 80% and 100%, a failed payment). */
export const KIND_LABEL: Record<string, string> = { standard: 'Standard support', extended: 'Extended support', partner: 'Partner plan', training: 'Team training workshop' };

/** 75000 -> "AED 750.00". Whole minor units only; the division is exact to two decimals. */
export function moneyText(minor: number, currency: string): string {
  const whole = Math.trunc(minor / 100);
  const frac = String(Math.abs(minor % 100)).padStart(2, '0');
  return `${currency} ${whole.toLocaleString('en-US')}.${frac}`;
}

export type MailDeps = { clientMail: typeof sendClientAuditMail; teamMail: typeof sendAuditMail };
const defaults: MailDeps = { clientMail: sendClientAuditMail, teamMail: sendAuditMail };

export async function sendSupportPaymentLink(plan: SupportPlan, url: string, deps: MailDeps = defaults): Promise<'sent' | 'not-configured' | 'no-email'> {
  if (!plan.email) return 'no-email';
  const label = KIND_LABEL[plan.kind] ?? 'Support';
  const monthly = plan.kind !== 'training';
  const price = `${moneyText(plan.price_minor, plan.currency)}${monthly ? ' per month' : ' one-time'}`;
  const hours = plan.hours_included > 0 ? ` It includes up to ${plan.hours_included} hours each month of monitoring, fixes and small changes.` : '';
  return deps.clientMail({
    to: plan.email,
    eyebrow: 'Halla AI support',
    title: label,
    subject: `${label}: your payment link${plan.company ? `, ${plan.company}` : ''}`,
    preheader: `${label}, ${price}.`,
    bodyHtml:
      para(`Hi ${escapeHtml(plan.contact_name || 'there')},`) +
      para(`Here is the secure link to start your ${escapeHtml(label)} (${escapeHtml(price)}).${escapeHtml(hours)}`) +
      para(monthly ? 'It renews monthly and you can cancel at any time.' : 'This is a one-time payment.'),
    ctaLabel: 'Start the plan',
    ctaUrl: url,
  });
}

export async function sendHoursAlert(plan: SupportPlan, usage: Usage, level: 80 | 100, deps: MailDeps = defaults): Promise<void> {
  const who = plan.company || 'a client';
  await deps.teamMail({
    eyebrow: 'Support hours',
    title: level === 100 ? `${who} has used all their hours this month` : `${who} has used 80% of their hours this month`,
    subject: `Support hours ${level === 100 ? 'used up' : 'at 80%'}: ${who} (${usage.usedHours} of ${usage.includedHours})`,
    bodyHtml:
      renderCallout({ tone: 'warn', label: level === 100 ? 'All hours used' : 'Nearly used up', headline: level === 100 ? 'Further work this month is over the plan. Agree extra hours with the client first.' : 'Plan the rest of the month, or talk to the client about extra hours.' }) +
      renderSummaryStrip([
        { label: 'Client', value: who },
        { label: 'Plan', value: KIND_LABEL[plan.kind] ?? plan.kind },
        { label: 'Month', value: usage.month },
        { label: 'Used', value: `${usage.usedHours} of ${usage.includedHours} hours` },
      ]),
  });
}

export async function sendPastDueAlert(plan: SupportPlan, deps: MailDeps = defaults): Promise<void> {
  const who = plan.company || 'a client';
  await deps.teamMail({
    eyebrow: 'Support payment',
    title: `Payment failed for ${who}`,
    subject: `Support payment FAILED: ${who}`,
    bodyHtml:
      renderCallout({ tone: 'warn', label: 'Action needed', headline: 'Stripe could not collect this month\'s support payment. Stripe will retry; contact the client if it keeps failing.' }) +
      renderSummaryStrip([{ label: 'Client', value: who }, { label: 'Plan', value: KIND_LABEL[plan.kind] ?? plan.kind }, { label: 'Amount', value: moneyText(plan.price_minor, plan.currency) }]),
    replyTo: plan.email ?? undefined,
  });
}
