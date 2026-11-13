import type { Pool } from 'pg';
import { logger } from '../logger.js';
import { escapeHtml, renderCallout, renderSummaryStrip } from '../automation/email-template.js';
import { sendAuditMail } from './audit-mail.js';
import { sendClientAuditMail, para } from './audit-client-mail.js';
import { reviewUrl, sendPaymentUrl } from './audit-links.js';
import { draftAuditReport, type DraftResult } from './audit-draft.js';
import { detectLang } from './audit-report.js';
import { renderReportPdf } from './audit-report-pdf.js';
import { getAudit, markDelivered, markDraftFailed, markPaid, saveDraft, saveSubmission, type AuditRow } from './audit-store.js';
import type { LinkPayload } from './signed-link.js';
import { markLeadStatusSafe } from '../consultancy/lead-store.js';

/**
 * The automatic part of the paid audit, in two steps that run on their own:
 *   startDraft  — after the client submits the questionnaire: save the answers, have the AI draft the report, email the team a link to review it.
 *   handlePaid  — after Stripe confirms payment: if the team has approved the report, build the PDF and email it to the client.
 * Nothing here throws to the caller. Any failure is logged and the team is emailed, so the manual way of working (send the payment link, send the audit by hand) is always still possible.
 * Everything that touches the outside world is passed in, so the tests run it without a database, an AI or email.
 */
export interface Deps {
  pool: Pick<Pool, 'query'>;
  draft: typeof draftAuditReport;
  teamMail: typeof sendAuditMail;
  clientMail: typeof sendClientAuditMail;
  renderPdf: typeof renderReportPdf;
}

export async function defaultDeps(): Promise<Deps> {
  const { pool } = await import('../db/pool.js');
  return { pool, draft: draftAuditReport, teamMail: sendAuditMail, clientMail: sendClientAuditMail, renderPdf: renderReportPdf };
}

const money = (n: number) => `AED ${n.toLocaleString('en-US')}`;

async function safeTeamMail(deps: Deps, opts: Parameters<typeof sendAuditMail>[0]): Promise<void> {
  try {
    await deps.teamMail(opts);
  } catch (error) {
    logger.error('[Audit] Team email failed', undefined, error instanceof Error ? error : new Error(String(error)));
  }
}

export async function startDraft(p: LinkPayload, answers: Record<string, string>, inject?: Partial<Deps>): Promise<void> {
  let deps: Deps;
  try {
    deps = { ...(await defaultDeps()), ...inject };
  } catch (error) {
    logger.error('[Audit] Could not start the draft', undefined, error instanceof Error ? error : new Error(String(error)));
    return;
  }
  const lang = detectLang(answers);
  const link = { id: p.id, company: p.company, email: p.email, name: p.name, cur: p.cur };
  try {
    await saveSubmission(deps.pool, { id: p.id, company: p.company, email: p.email, name: p.name, currency: p.cur ?? 'AED', lang, answers });
  } catch (error) {
    logger.error('[Audit] Could not save the answers', undefined, error instanceof Error ? error : new Error(String(error)));
    // The answers were already emailed to the team. Tell them the automatic report is off for this one and give them the manual button.
    const manual = sendPaymentUrl(link);
    await safeTeamMail(deps, {
      eyebrow: 'Audit draft',
      title: `No automatic draft for ${p.company}`,
      subject: `Audit: automatic draft unavailable — ${p.company}`,
      bodyHtml: renderCallout({ tone: 'warn', label: 'Do this by hand', headline: 'The answers could not be saved, so no draft was written. Prepare this audit yourselves; when it is ready, send the payment link.', points: ['The client\'s answers are in the "Form 2 received" email.', 'After payment, send the audit to the client by email as before.'] }),
      replyTo: p.email,
      ...(manual ? { ctaLabel: 'Audit is ready: send the payment link', ctaUrl: manual } : {}),
    });
    return;
  }

  await markLeadStatusSafe(deps.pool, p.email, 'form_received');

  let result: DraftResult | null = null;
  try {
    result = await deps.draft({ answers, company: p.company, contactName: p.name || p.company });
  } catch (error) {
    logger.error('[Audit] Draft failed', undefined, error instanceof Error ? error : new Error(String(error)));
  }

  if (!result) {
    await markDraftFailed(deps.pool, p.id).catch(() => undefined);
    const sendPay = sendPaymentUrl(link);
    await safeTeamMail(deps, {
      eyebrow: 'Audit draft',
      title: `The automatic draft failed for ${p.company}`,
      subject: `Audit draft FAILED — ${p.company}`,
      bodyHtml: renderCallout({ tone: 'warn', label: 'Do this by hand', headline: 'The AI could not draft this audit. Prepare it yourselves; when it is ready, send the payment link.', points: ['The client\'s answers are in the "Form 2 received" email.', 'After payment, send the audit to the client by email as before.'] }),
      replyTo: p.email,
      ...(sendPay ? { ctaLabel: 'Audit is ready: send the payment link', ctaUrl: sendPay } : {}),
    });
    return;
  }

  await saveDraft(deps.pool, p.id, result.report, result.assessment).catch((error) => logger.error('[Audit] Could not save the draft', undefined, error instanceof Error ? error : new Error(String(error))));
  await markLeadStatusSafe(deps.pool, p.email, 'audit_in_review');
  const review = reviewUrl(link);
  const h = result.report.internal;
  await safeTeamMail(deps, {
    eyebrow: 'Audit draft',
    title: `Draft audit ready for ${p.company}`,
    subject: `Draft audit ready to review — ${p.company}`,
    bodyHtml:
      renderCallout({ tone: 'warn', label: 'Next step', headline: 'Read the draft, edit what you want, then approve it. Approving emails the client the payment link.', points: [`The report will be written in ${result.report.lang === 'ar' ? 'Arabic' : 'English'}, the language the client used.`, 'After they pay, the PDF goes to them automatically.'] }) +
      renderSummaryStrip([
        { label: 'Company', value: p.company },
        { label: 'Suggested fee', value: money(result.report.investment.feeAed) },
        ...(result.report.timeline ? [{ label: 'Time frame', value: result.report.timeline.weeksMin === result.report.timeline.weeksMax ? `${result.report.timeline.weeksMax} weeks` : `${result.report.timeline.weeksMin}–${result.report.timeline.weeksMax} weeks` }] : []),
        { label: 'Complexity', value: `${h.complexity} (${h.hoursMin}–${h.hoursMax} hours, internal)` },
        { label: 'Reference', value: p.id },
      ]),
    replyTo: p.email,
    ...(review ? { ctaLabel: 'Review the draft audit', ctaUrl: review } : {}),
  });
}

const DELIVERY_COPY = {
  en: (company: string, name: string) => ({
    subject: `Your Opportunity Audit, ${company}`,
    title: 'Your Opportunity Audit',
    preheader: 'Your audit is attached as a PDF.',
    body: para(`Hi ${escapeHtml(name || 'there')},`) + para(`Thank you for your payment. Your Opportunity Audit for ${escapeHtml(company)} is attached to this email as a PDF.`) + para('It sets out what we found, the roadmap we recommend and a fixed price for the build, valid for 30 days. Reply to this email with any questions, or to agree the next step.'),
    eyebrow: 'Opportunity Audit',
    file: `Opportunity-Audit-${company.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'report'}.pdf`,
  }),
  ar: (company: string, name: string) => ({
    subject: `تدقيق الفرص الخاص بك، ${company}`,
    title: 'تدقيق الفرص الخاص بك',
    preheader: 'تدقيقك مرفق بصيغة PDF.',
    body: para(`مرحباً ${escapeHtml(name || '')}،`) + para(`شكراً لدفعك. تدقيق الفرص الخاص بـ ${escapeHtml(company)} مرفق بهذه الرسالة بصيغة PDF.`) + para('يوضح ما وجدناه وخارطة الطريق التي نوصي بها وسعراً ثابتاً للبناء صالحاً لمدة 30 يوماً. يمكنك الرد على هذه الرسالة لأي استفسار أو للاتفاق على الخطوة التالية.'),
    eyebrow: 'تدقيق الفرص',
    file: 'Opportunity-Audit.pdf',
  }),
};

/** Build the PDF and email it to the client. Safe to call twice: it only acts on an audit that is paid and not yet delivered. */
export async function deliverAudit(row: AuditRow, inject?: Partial<Deps>): Promise<'delivered' | 'failed' | 'skipped'> {
  if (row.status !== 'paid' || !row.report) return 'skipped';
  const deps: Deps = { ...(await defaultDeps()), ...inject };
  const link = { id: row.id, company: row.company, email: row.email, name: row.contact_name ?? undefined, cur: row.currency };
  const review = reviewUrl(link);
  try {
    const pdf = await deps.renderPdf(row.report);
    const c = DELIVERY_COPY[row.report.lang](row.company, row.contact_name ?? '');
    const sent = await deps.clientMail({
      to: row.email,
      rtl: row.report.lang === 'ar',
      eyebrow: c.eyebrow,
      title: c.title,
      subject: c.subject,
      preheader: c.preheader,
      bodyHtml: c.body,
      attachments: [{ filename: c.file, content: pdf }],
    });
    if (sent === 'not-configured') throw new Error('Email is not configured (RESEND_API_KEY)');
    await markDelivered(deps.pool, row.id, true);
    await markLeadStatusSafe(deps.pool, row.email, 'audit_paid');
    await safeTeamMail(deps, {
      eyebrow: 'Audit delivered',
      title: `Audit sent to ${row.company}`,
      subject: `Audit DELIVERED — ${row.company}`,
      bodyHtml: renderCallout({ tone: 'good', label: 'Done', headline: 'The audit PDF was emailed to the client automatically.' }) + renderSummaryStrip([{ label: 'Company', value: row.company }, { label: 'Sent to', value: row.email }, { label: 'Language', value: row.report.lang === 'ar' ? 'Arabic' : 'English' }, { label: 'Reference', value: row.id }]),
      replyTo: row.email,
    });
    return 'delivered';
  } catch (error) {
    logger.error('[Audit] Automatic delivery failed', undefined, error instanceof Error ? error : new Error(String(error)));
    await markDelivered(deps.pool, row.id, false).catch(() => undefined);
    await safeTeamMail(deps, {
      eyebrow: 'Audit delivery',
      title: `Send the audit to ${row.company} by hand`,
      subject: `Audit delivery FAILED — ${row.company}`,
      bodyHtml: renderCallout({ tone: 'warn', label: 'Action needed', headline: 'The client has paid but the automatic email did not go out.', points: [`Reason: ${escapeHtml(error instanceof Error ? error.message : String(error))}`, 'Open the review page, download the PDF and email it to the client.'] }) + renderSummaryStrip([{ label: 'Company', value: row.company }, { label: 'Client email', value: row.email }, { label: 'Reference', value: row.id }]),
      replyTo: row.email,
      ...(review ? { ctaLabel: 'Open the review page', ctaUrl: review } : {}),
    });
    return 'failed';
  }
}

/** Stripe says this audit is paid. Records it and, if the team approved the report, delivers it. If not approved yet, the team is told to approve it and delivery follows at that moment. */
export async function handlePaid(id: string, inject?: Partial<Deps>): Promise<'delivered' | 'failed' | 'waiting' | 'no-record'> {
  let deps: Deps;
  try {
    deps = { ...(await defaultDeps()), ...inject };
  } catch {
    return 'no-record';
  }
  let row: AuditRow | null = null;
  try {
    row = await markPaid(deps.pool, id);
  } catch (error) {
    logger.error('[Audit] Could not record the payment', undefined, error instanceof Error ? error : new Error(String(error)));
    return 'no-record';
  }
  if (!row) return 'no-record';
  await markLeadStatusSafe(deps.pool, row.email, 'audit_paid');
  if (row.status !== 'paid') {
    const review = reviewUrl({ id: row.id, company: row.company, email: row.email, name: row.contact_name ?? undefined, cur: row.currency });
    await safeTeamMail(deps, {
      eyebrow: 'Audit paid',
      title: `${row.company} paid, but the audit is not approved yet`,
      subject: `Audit PAID, approve the report — ${row.company}`,
      bodyHtml: renderCallout({ tone: 'warn', label: 'Action needed', headline: 'The client has paid before the draft was approved. Nothing was sent. Review and approve it, and it will be emailed to them at once.' }) + renderSummaryStrip([{ label: 'Company', value: row.company }, { label: 'Reference', value: row.id }]),
      replyTo: row.email,
      ...(review ? { ctaLabel: 'Review and approve', ctaUrl: review } : {}),
    });
    return 'waiting';
  }
  return (await deliverAudit(row, deps)) === 'delivered' ? 'delivered' : 'failed';
}

export { getAudit };
