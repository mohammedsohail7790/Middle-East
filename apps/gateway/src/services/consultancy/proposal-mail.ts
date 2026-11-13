import { escapeHtml as h, renderDetailList } from '../automation/email-template.js';
import { getDashboardBaseUrl } from '../integrations/oauth-redirect.js';
import { signLink } from '../audit/signed-link.js';
import { firstName } from '../audit/audit-links.js';
import { sendClientAuditMail, para } from '../audit/audit-client-mail.js';
import { sendAuditMail } from '../audit/audit-mail.js';
import { formatDate, money } from './proposal-pages.js';
import type { ProposalRow } from './proposal-store.js';

/** Signing the client's proposal link, and the three emails around a proposal: sent to the client, accepted (to the team), accepted (confirmation to the client). */
const GATEWAY = (): string => process.env.GATEWAY_PUBLIC_URL || 'https://gateway.hallaai.com';

export interface LeadContact {
  email: string;
  company?: string | null;
  contactName?: string | null;
}

/** The private link for one proposal, valid until the proposal's own end date. Null when AUDIT_LINK_SECRET is not set. */
export function proposalLink(p: Pick<ProposalRow, 'id' | 'valid_until'>, lead: LeadContact): string | null {
  const secret = process.env.AUDIT_LINK_SECRET;
  if (!secret) return null;
  const x = Math.floor(new Date(p.valid_until).getTime() / 1000);
  const token = signLink({ k: 'proposal', id: p.id, company: String(lead.company ?? '').slice(0, 200), email: lead.email, x, ...(firstName(lead.contactName ?? undefined) ? { name: firstName(lead.contactName ?? undefined) } : {}) }, secret);
  return `${GATEWAY()}/api/v1/public/proposal?t=${encodeURIComponent(token)}`;
}

const itemsText = (p: ProposalRow): string => p.items.map((i) => `${i.title}: ${money(p.currency, Number(i.priceMinor))}`).join('\n');

const termsRows = (p: ProposalRow): Array<{ label: string; value: string }> => [
  { label: 'Proposal', value: p.title },
  { label: 'Items', value: itemsText(p) },
  { label: 'Total', value: money(p.currency, p.total_minor) },
  ...(p.delivery_weeks ? [{ label: 'Delivery', value: `${p.delivery_weeks} weeks` }] : []),
  { label: 'Valid until', value: formatDate(p.valid_until, 'en') },
];

export async function sendProposalToClient(p: ProposalRow, lead: LeadContact, link: string): Promise<'sent' | 'not-configured'> {
  const until = formatDate(p.valid_until, p.language);
  if (p.language === 'ar') {
    return sendClientAuditMail({
      to: lead.email,
      rtl: true,
      eyebrow: 'عرض البناء',
      title: p.title,
      subject: `عرض البناء: ${p.title}`,
      preheader: `سعر ثابت، ساري حتى ${until}.`,
      bodyHtml:
        para(`مرحباً ${h(firstName(lead.contactName ?? undefined) || '')}،`) +
        para(`أعددنا لك عرضاً بسعر ثابت لكل بند: الإجمالي ${h(money(p.currency, p.total_minor))}، وهو ساري حتى ${h(until)}. لن يبدأ أي بناء قبل موافقتك الكتابية.`) +
        para('افتح الرابط الآمن أدناه لقراءة النطاق والبنود وقبول العرض أو رفضه.'),
      ctaLabel: 'اقرأ العرض',
      ctaUrl: link,
    });
  }
  return sendClientAuditMail({
    to: lead.email,
    eyebrow: 'Build proposal',
    title: p.title,
    subject: `Your build proposal: ${p.title}`,
    preheader: `A fixed price, valid until ${until}.`,
    bodyHtml:
      para(`Hi ${h(firstName(lead.contactName ?? undefined) || 'there')},`) +
      para(`Here is your proposal, with a fixed price for each item: ${h(money(p.currency, p.total_minor))} in total, valid until ${h(until)}. Nothing is built until you approve it in writing.`) +
      para('Open the secure link below to read the scope and line items, then accept or decline.'),
    ctaLabel: 'Read the proposal',
    ctaUrl: link,
  });
}

export async function sendAcceptanceToTeam(p: ProposalRow, lead: LeadContact | null): Promise<'sent' | 'not-configured'> {
  const rows = [
    { label: 'Client', value: [lead?.company, lead?.contactName, lead?.email].filter(Boolean).join(', ') || p.lead_id },
    ...termsRows(p),
    { label: 'Accepted by', value: p.accepted_name ?? '' },
    { label: 'Accepted at', value: p.accepted_at ? new Date(p.accepted_at).toISOString() : '' },
    { label: 'IP address', value: p.accepted_ip ?? 'unknown' },
    { label: 'Browser', value: p.accepted_user_agent ?? 'unknown' },
    { label: 'Terms fingerprint', value: p.terms_hash ?? '' },
  ];
  return sendAuditMail({
    eyebrow: 'Proposal accepted',
    title: `Accepted: ${p.title}`,
    subject: `Proposal accepted: ${p.title} (${money(p.currency, p.total_minor)})`,
    bodyHtml: para(`${h(p.accepted_name ?? 'The client')} accepted the proposal in writing. The evidence is below and on the proposals page.`) + renderDetailList(rows),
    ctaLabel: 'Open proposals',
    ctaUrl: `${getDashboardBaseUrl()}/en/dashboard/consultancy/proposals`,
  });
}

export async function sendAcceptanceToClient(p: ProposalRow, lead: LeadContact): Promise<'sent' | 'not-configured'> {
  const when = p.accepted_at ? formatDate(p.accepted_at, p.language) : '';
  if (p.language === 'ar') {
    const rows = [
      { label: 'العرض', value: p.title },
      { label: 'البنود', value: itemsText(p) },
      { label: 'الإجمالي', value: money(p.currency, p.total_minor) },
      ...(p.delivery_weeks ? [{ label: 'التسليم', value: `${p.delivery_weeks} أسبوع` }] : []),
      { label: 'ساري حتى', value: formatDate(p.valid_until, 'ar') },
      { label: 'وافق', value: p.accepted_name ?? '' },
      { label: 'بتاريخ', value: when },
    ];
    return sendClientAuditMail({
      to: lead.email,
      rtl: true,
      eyebrow: 'عرض البناء',
      title: 'تم قبول العرض',
      subject: `تأكيد قبول العرض: ${p.title}`,
      bodyHtml: para('شكراً لك. هذه الشروط التي وافقت عليها كتابياً. سنتواصل معك لتحديد موعد البداية.') + renderDetailList(rows),
    });
  }
  return sendClientAuditMail({
    to: lead.email,
    eyebrow: 'Build proposal',
    title: 'Proposal accepted',
    subject: `Confirmation: you accepted ${p.title}`,
    bodyHtml:
      para('Thank you. These are the terms you accepted in writing. We will be in touch to plan the start.') +
      renderDetailList([...termsRows(p), { label: 'Accepted by', value: p.accepted_name ?? '' }, { label: 'Accepted on', value: when }]),
  });
}

/**
 * Moves the lead on in the pipeline (proposal_sent, won) through lead-store.ts, which another feature writes. Optional: if that file or helper is not there yet,
 * or it fails, this does nothing, because the proposal itself has already been saved.
 */
export async function moveLeadStatus(pool: unknown, email: string | null | undefined, status: 'proposal_sent' | 'won'): Promise<void> {
  if (!email) return;
  try {
    const spec = './lead-store.js';
    const mod = (await import(/* @vite-ignore */ spec)) as { markLeadStatusByEmail?: (pool: unknown, email: string, status: string) => Promise<unknown> };
    if (typeof mod.markLeadStatusByEmail === 'function') await mod.markLeadStatusByEmail(pool, email, status);
  } catch {
    /* lead-store.ts is not available yet, or the move failed: skip silently */
  }
}
