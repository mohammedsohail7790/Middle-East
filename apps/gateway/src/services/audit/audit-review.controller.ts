import express, { Router } from 'express';
import { asyncHandler, MiddlewareFactory } from '../../middleware/index.js';
import { logger } from '../logger.js';
import { escapeHtml } from '../automation/email-template.js';
import { verifyLink, type LinkPayload } from './signed-link.js';
import { mergeEdits, type AuditReport, type ReportEdits } from './audit-report.js';
import { approve, getAudit, saveEdits, type AuditRow } from './audit-store.js';
import { sendPaymentLinkEmail } from './audit-payment-mail.js';
import { handlePaid } from './audit-pipeline.js';
import { ArabicFontMissingError, renderReportPdf } from './audit-report-pdf.js';

/**
 * The team's review page for one audit: read the AI draft, edit it, approve it. It is a plain HTML form (no scripts), opened from the "Draft audit ready" email.
 * The link is signed and expires (kind "review"), like every other audit link. Approving is what emails the client the payment link; after that the report is locked.
 * If the client has already paid by then, approving delivers the PDF at once.
 */
const limit = MiddlewareFactory.createRateLimit({ windowMs: 15 * 60 * 1000, max: 60, message: 'Too many requests. Please try again later.' });
const writeLimit = MiddlewareFactory.createRateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: 'Too many requests. Please try again later.' });

const h = escapeHtml;
const lines = (v: unknown): string[] => String(v ?? '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);

type Checked = { ok: boolean; p: LinkPayload; status: number; msg: string };
const NO_PAYLOAD = null as unknown as LinkPayload;

function check(token: unknown): Checked {
  const secret = process.env.AUDIT_LINK_SECRET;
  if (!secret) return { ok: false, p: NO_PAYLOAD, status: 503, msg: 'This service is not set up yet (AUDIT_LINK_SECRET).' };
  const r = verifyLink(String(token ?? ''), secret);
  if (!r.ok) {
    const expired = (r as { reason: string }).reason === 'expired';
    return { ok: false, p: NO_PAYLOAD, status: expired ? 410 : 400, msg: expired ? 'This link has expired. Ask for a new one.' : 'This link is not valid. Open the whole link from the email.' };
  }
  const p = (r as { payload: LinkPayload }).payload;
  if (p.k !== 'review') return { ok: false, p: NO_PAYLOAD, status: 400, msg: 'This link is not a review link.' };
  return { ok: true, p, status: 200, msg: '' };
}

const shell = (title: string, inner: string): string =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${h(title)}</title></head>` +
  `<body style="margin:0;background:#f6f5f2;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1b1f27"><div style="max-width:780px;margin:32px auto;padding:0 16px">${inner}</div></body></html>`;

const card = (inner: string): string => `<div style="background:#fff;border:1px solid #e3e0d8;border-radius:12px;padding:22px;margin:0 0 16px">${inner}</div>`;
const label = (t: string): string => `<label style="display:block;font-weight:600;font-size:13px;margin:14px 0 6px">${h(t)}</label>`;
const FIELD = 'width:100%;box-sizing:border-box;font:inherit;font-size:14px;padding:9px 10px;border:1px solid #c9c5ba;border-radius:8px';
const area = (name: string, value: string, rows: number, dis: boolean): string => `<textarea name="${name}" rows="${rows}" style="${FIELD}"${dis ? ' disabled' : ''}>${h(value)}</textarea>`;
const input = (name: string, value: string, dis: boolean, extra = ''): string => `<input name="${name}" value="${h(value)}" style="${FIELD}"${dis ? ' disabled' : ''} ${extra}>`;

const STATUS_TEXT: Record<string, string> = {
  submitted: 'The draft is still being written. Refresh in a minute.',
  draft_failed: 'The automatic draft failed. Prepare this audit by hand.',
  in_review: 'Ready for your review.',
  approved: 'Approved. The client has been sent the payment link. The report is locked.',
  paid: 'Paid. Delivery is in progress.',
  delivered: 'Delivered to the client.',
  delivery_failed: 'The client paid but the automatic email failed. Download the PDF below and send it by hand.',
};

export function renderReviewPage(row: AuditRow, token: string, notice?: { tone: 'good' | 'bad'; text: string }): string {
  const r = row.report;
  const editable = row.status === 'in_review' && !!r;
  const dis = !editable;
  const banner = notice ? `<div style="background:${notice.tone === 'good' ? '#e7f5ec' : '#fdeaea'};border:1px solid ${notice.tone === 'good' ? '#9ad0ae' : '#e5a3a3'};border-radius:10px;padding:12px 16px;margin:0 0 16px;font-size:14px">${h(notice.text)}</div>` : '';
  const head =
    `<h1 style="font-size:22px;margin:0 0 4px">Audit draft: ${h(row.company)}</h1>` +
    `<p style="margin:0 0 16px;color:#5b6472;font-size:14px">${h(row.email)} · Reference ${h(row.id)} · Language: ${row.lang === 'ar' ? 'Arabic' : 'English'}<br><b>${h(STATUS_TEXT[row.status] ?? row.status)}</b></p>`;
  if (!r) return shell('Audit review', head + banner + card('<p style="margin:0">There is no draft to review yet.</p>'));

  const internal =
    `<p style="margin:0 0 6px"><b>Complexity:</b> ${h(r.internal.complexity)} · <b>Hours:</b> ${r.internal.hoursMin}–${r.internal.hoursMax} (top of range is priced)</p>` +
    (r.internal.adjustments.length ? `<ul style="margin:6px 0 0 18px;padding:0;font-size:13px">${r.internal.adjustments.map((a) => `<li>${h(a.reason)} (+${a.min}–${a.max}h)</li>`).join('')}</ul>` : '') +
    `<p style="margin:8px 0 0;font-size:12px;color:#5b6472">Never shown to the client. Check the fee below against this before approving.</p>`;

  const opps = [...r.opportunities, ...(editable ? [{ title: '', problem: '', solution: '', payoff: '' }] : [])]
    .map(
      (o, i) =>
        `<div style="border-top:${i ? '1px solid #eee9dc' : '0'};padding-top:${i ? 12 : 0}px">` +
        label(`Opportunity ${i + 1}: title`) + input(`opp_title_${i}`, o.title, dis) +
        label('Today (the problem)') + area(`opp_problem_${i}`, o.problem, 2, dis) +
        label('What we would build') + area(`opp_solution_${i}`, o.solution, 2, dis) +
        label('Payoff') + area(`opp_payoff_${i}`, o.payoff, 2, dis) + '</div>',
    )
    .join('');

  const phases = r.phases.map((p, i) => label(`Phase ${i + 1}: ${p.title} — deliverables, one per line`) + area(`phase_${i}`, p.deliverables.join('\n'), 3, dis)).join('');

  const buttons = editable
    ? `<button name="action" value="save" style="padding:11px 18px;border-radius:8px;border:1px solid #1b1f27;background:#fff;font-weight:600;cursor:pointer">Save changes</button> ` +
      `<button name="action" value="approve" style="padding:11px 18px;border-radius:8px;border:0;background:#1b1f27;color:#fff;font-weight:600;cursor:pointer">Approve and email the client the payment link</button>`
    : row.status === 'approved'
      ? `<button name="action" value="resend" style="padding:11px 18px;border-radius:8px;border:1px solid #1b1f27;background:#fff;font-weight:600;cursor:pointer">Send the payment link again</button>`
      : '';

  const body =
    `<form method="post" action="review" style="margin:0"><input type="hidden" name="t" value="${h(token)}">` +
    card(`<b>Internal estimate</b><div style="margin-top:8px;font-size:14px">${internal}</div>`) +
    card(label('Summary') + area('summary', r.summary, 5, dis) + label('How things work today, one per line') + area('findings', r.findings.join('\n'), 4, dis)) +
    card('<b>Opportunities</b>' + opps) +
    card('<b>Roadmap</b>' + phases) +
    card(label('Fixed fee (AED), shown to the client') + input('fee', String(r.investment.feeAed), dis, 'inputmode="numeric"') +
      label('Smaller Phase 1 (AED), only when the budget is below the fee. Leave empty to omit') + input('phase1', r.investment.phase1Aed ? String(r.investment.phase1Aed) : '', dis, 'inputmode="numeric"') +
      `<p style="margin:8px 0 0;font-size:12px;color:#5b6472">${r.investment.overBudget ? 'The client\'s stated budget is below this fee.' : 'The stated budget covers the fee, or none was given.'}</p>`) +
    card(label('Things to confirm, one per line') + area('considerations', r.considerations.join('\n'), 3, dis) + label('Next steps, one per line') + area('nextSteps', r.nextSteps.join('\n'), 3, dis)) +
    `<div style="margin:0 0 16px">${buttons}</div></form>` +
    `<p style="font-size:14px"><a href="review/pdf?t=${encodeURIComponent(token)}" style="color:#1b1f27;font-weight:600">Preview or download the PDF</a> (shows the saved version)</p>`;
  return shell('Audit review', head + banner + body);
}

/** Read the form fields into report edits. */
export function editsFromForm(b: Record<string, unknown>, existingOpps: number): ReportEdits {
  const opportunities: Array<{ title: string; problem: string; solution: string; payoff: string }> = [];
  for (let i = 0; i < existingOpps + 1 && i < 12; i++) {
    opportunities.push({ title: String(b[`opp_title_${i}`] ?? ''), problem: String(b[`opp_problem_${i}`] ?? ''), solution: String(b[`opp_solution_${i}`] ?? ''), payoff: String(b[`opp_payoff_${i}`] ?? '') });
  }
  return {
    summary: String(b.summary ?? ''),
    findings: lines(b.findings),
    opportunities,
    phaseDeliverables: [lines(b.phase_0), lines(b.phase_1), lines(b.phase_2)],
    considerations: lines(b.considerations),
    nextSteps: lines(b.nextSteps),
    feeAed: String(b.fee ?? ''),
    phase1Aed: String(b.phase1 ?? ''),
  };
}

export function createAuditReviewRouter(): Router {
  const router = Router();
  router.use(express.urlencoded({ extended: false, limit: '300kb' }));

  router.get(
    '/review',
    limit,
    asyncHandler(async (req: any, res: any) => {
      res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
      const c = check(req.query.t);
      if (!c.ok) return void res.status(c.status).type('html').send(shell('This link does not work', card(`<p>${h(c.msg)}</p>`)));
      const { pool } = await import('../db/pool.js');
      const row = await getAudit(pool, c.p.id).catch(() => null);
      if (!row) return void res.status(404).type('html').send(shell('Not found', card('<p>No saved record for this audit. It may have been submitted before the automatic report existed. Prepare it by hand.</p>')));
      res.type('html').send(renderReviewPage(row, String(req.query.t)));
    }),
  );

  router.get(
    '/review/pdf',
    limit,
    asyncHandler(async (req: any, res: any) => {
      res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
      const c = check(req.query.t);
      if (!c.ok) return void res.status(c.status).type('text').send(c.msg);
      const { pool } = await import('../db/pool.js');
      const row = await getAudit(pool, c.p.id).catch(() => null);
      if (!row?.report) return void res.status(404).type('text').send('No report yet.');
      try {
        const pdf = await renderReportPdf(row.report);
        res.type('application/pdf').set('Content-Disposition', `inline; filename="Opportunity-Audit-${row.id}.pdf"`).send(pdf);
      } catch (error) {
        if (error instanceof ArabicFontMissingError) return void res.status(501).type('text').send('This report is in Arabic and the Arabic PDF font is not set up on the server (AUDIT_PDF_ARABIC_FONT).');
        logger.error('[Audit] PDF preview failed', undefined, error instanceof Error ? error : new Error(String(error)));
        res.status(500).type('text').send('Could not build the PDF.');
      }
    }),
  );

  router.post(
    '/review',
    writeLimit,
    asyncHandler(async (req: any, res: any) => {
      res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
      const token = String(req.body?.t ?? '');
      const c = check(token);
      if (!c.ok) return void res.status(c.status).type('html').send(shell('This link does not work', card(`<p>${h(c.msg)}</p>`)));
      const { pool } = await import('../db/pool.js');
      const row = await getAudit(pool, c.p.id).catch(() => null);
      if (!row) return void res.status(404).type('html').send(shell('Not found', card('<p>No saved record for this audit.</p>')));
      const action = String(req.body?.action ?? '');
      const show = async (notice: { tone: 'good' | 'bad'; text: string }) => {
        const fresh = (await getAudit(pool, row.id).catch(() => null)) ?? row;
        res.type('html').send(renderReviewPage(fresh, token, notice));
      };

      if (action === 'resend') {
        if (row.status !== 'approved') return void (await show({ tone: 'bad', text: 'The payment link can only be sent again while the audit is approved and unpaid.' }));
        try {
          const sent = await sendPaymentLinkEmail(c.p, row.lang);
          return void (await show(sent === 'sent' ? { tone: 'good', text: 'The payment link was sent again.' } : { tone: 'bad', text: `The payment link was not sent (${sent}).` }));
        } catch (error) {
          logger.error('[Audit] Resend failed', undefined, error instanceof Error ? error : new Error(String(error)));
          return void (await show({ tone: 'bad', text: 'The email did not go out. Try again.' }));
        }
      }

      if (action !== 'save' && action !== 'approve') return void (await show({ tone: 'bad', text: 'Unknown action.' }));
      if (row.status !== 'in_review' || !row.report) return void (await show({ tone: 'bad', text: 'This audit is no longer open for editing.' }));

      const merged: AuditReport = mergeEdits(row.report, editsFromForm(req.body ?? {}, row.report.opportunities.length));
      if (!(await saveEdits(pool, row.id, merged))) return void (await show({ tone: 'bad', text: 'Your changes were not saved. Reload the page and try again.' }));
      if (action === 'save') return void (await show({ tone: 'good', text: 'Saved.' }));

      if (!(await approve(pool, row.id))) return void (await show({ tone: 'bad', text: 'Already approved.' }));
      if (row.paid_at) {
        const out = await handlePaid(row.id);
        return void (await show(out === 'delivered' ? { tone: 'good', text: 'Approved. The client had already paid, so the PDF was emailed to them now.' } : { tone: 'bad', text: `Approved, but delivery did not complete (${out}). Check your email for details.` }));
      }
      try {
        const sent = await sendPaymentLinkEmail(c.p, row.lang);
        if (sent !== 'sent') return void (await show({ tone: 'bad', text: `Approved, but the payment link was NOT sent (${sent}). Use "Send the payment link again" once that is fixed.` }));
      } catch (error) {
        logger.error('[Audit] Payment link email failed after approval', undefined, error instanceof Error ? error : new Error(String(error)));
        return void (await show({ tone: 'bad', text: 'Approved, but the email did not go out. Use "Send the payment link again".' }));
      }
      await show({ tone: 'good', text: 'Approved. The client was emailed the payment link. When they pay, the PDF is sent to them automatically.' });
    }),
  );

  return router;
}
