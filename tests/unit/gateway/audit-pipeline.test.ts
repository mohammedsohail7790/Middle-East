import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({
  saveSubmission: vi.fn(),
  saveDraft: vi.fn(),
  markDraftFailed: vi.fn(),
  markPaid: vi.fn(),
  markDelivered: vi.fn(),
  getAudit: vi.fn(),
}));
vi.mock('../../../apps/gateway/src/services/audit/audit-store.js', () => store);
vi.mock('../../../apps/gateway/src/services/db/pool.js', () => ({ pool: { query: vi.fn() } }));

import { deliverAudit, handlePaid, startDraft } from '../../../apps/gateway/src/services/audit/audit-pipeline.js';
import { assembleReport } from '../../../apps/gateway/src/services/audit/audit-report.js';

const raw = {
  assessment: { complexity: 'medium', volume: 'low', dataFormat: 'structured', systems: 'cloud', humanApproval: false, budgetMaxAed: null },
  summary: 'Acme re-types the same job details into three tools, which costs the office hours each week and causes missed invoices.',
  findings: ['Three tools hold the same data.'],
  opportunities: [{ title: 'Capture each job once', problem: 'Typed three times.', solution: 'One entry feeds all three tools.', payoff: 'Less admin.' }],
  phaseDeliverables: [['Map'], ['Build'], ['Test']],
  considerations: ['Confirm CRM admin access.'],
  nextSteps: ['Agree the scope.'],
};
const built = (lang: 'en' | 'ar' = 'en') => assembleReport({ raw, lang, company: 'Acme', contactName: 'Sam', now: new Date('2026-11-12') });
const p = { k: 'form2' as const, id: 'ab12cd34', company: 'Acme', email: 'sam@acme.test', name: 'Sam', cur: 'AED', x: 9999999999 };
const answers = { a_company: 'Acme Property Services', b_process: 'We type jobs into three tools by hand.' };
const row = (over: any = {}) => ({ id: p.id, company: 'Acme', email: p.email, contact_name: 'Sam', currency: 'AED', lang: 'en', answers, report: built().report, assessment: built().assessment, status: 'paid', approved_at: 'x', paid_at: 'x', delivered_at: null, ...over });

let deps: any;
beforeEach(() => {
  process.env.AUDIT_LINK_SECRET = 'test-secret-test-secret';
  Object.values(store).forEach((f) => f.mockReset());
  store.saveSubmission.mockResolvedValue(undefined);
  store.saveDraft.mockResolvedValue(undefined);
  store.markDraftFailed.mockResolvedValue(undefined);
  store.markDelivered.mockResolvedValue(undefined);
  deps = {
    pool: { query: vi.fn() },
    draft: vi.fn().mockResolvedValue(built()),
    teamMail: vi.fn().mockResolvedValue('sent'),
    clientMail: vi.fn().mockResolvedValue('sent'),
    renderPdf: vi.fn().mockResolvedValue(Buffer.from('%PDF-fake')),
  };
});

describe('startDraft', () => {
  it('saves the answers, saves the draft and emails the team a review link', async () => {
    await startDraft(p, answers, deps);
    expect(store.saveSubmission).toHaveBeenCalledWith(deps.pool, expect.objectContaining({ id: p.id, lang: 'en', answers }));
    expect(store.saveDraft).toHaveBeenCalled();
    const mail = deps.teamMail.mock.calls[0][0];
    expect(mail.subject).toContain('Draft audit ready');
    expect(mail.ctaUrl).toContain('/public/audit/review?t=');
  });

  it('saves an Arabic client as Arabic', async () => {
    await startDraft(p, { a_company: 'شركة الأمل', b_process: 'نكتب البيانات يدوياً في ثلاثة أنظمة مختلفة' }, deps);
    expect(store.saveSubmission.mock.calls[0][1].lang).toBe('ar');
  });

  it('when the AI draft fails, marks it failed and gives the team the manual payment button', async () => {
    deps.draft.mockResolvedValue(null);
    await startDraft(p, answers, deps);
    expect(store.markDraftFailed).toHaveBeenCalledWith(deps.pool, p.id);
    expect(store.saveDraft).not.toHaveBeenCalled();
    const mail = deps.teamMail.mock.calls[0][0];
    expect(mail.subject).toContain('FAILED');
    expect(mail.ctaUrl).toContain('/public/audit/send-payment?t=');
  });

  it('when the answers cannot be saved, tells the team to do it by hand and does not draft', async () => {
    store.saveSubmission.mockRejectedValue(new Error('db down'));
    await startDraft(p, answers, deps);
    expect(deps.draft).not.toHaveBeenCalled();
    expect(deps.teamMail.mock.calls[0][0].subject).toContain('automatic draft unavailable');
  });

  it('never throws, even if the team email fails', async () => {
    deps.teamMail.mockRejectedValue(new Error('smtp'));
    await expect(startDraft(p, answers, deps)).resolves.toBeUndefined();
  });
});

describe('deliverAudit', () => {
  it('emails the PDF to the client in English and tells the team', async () => {
    expect(await deliverAudit(row(), deps)).toBe('delivered');
    const mail = deps.clientMail.mock.calls[0][0];
    expect(mail.to).toBe(p.email);
    expect(mail.attachments[0].filename).toMatch(/^Opportunity-Audit-Acme\.pdf$/);
    expect(mail.attachments[0].content.toString()).toBe('%PDF-fake');
    expect(mail.rtl).toBe(false);
    expect(store.markDelivered).toHaveBeenCalledWith(deps.pool, p.id, true);
    expect(deps.teamMail.mock.calls[0][0].subject).toContain('DELIVERED');
  });

  it('writes the email to an Arabic client in Arabic, right to left', async () => {
    await deliverAudit(row({ lang: 'ar', report: built('ar').report }), deps);
    const mail = deps.clientMail.mock.calls[0][0];
    expect(mail.rtl).toBe(true);
    expect(mail.subject).toMatch(/[؀-ۿ]/);
  });

  it('on failure marks delivery failed and tells the team to send it by hand', async () => {
    deps.renderPdf.mockRejectedValue(new Error('no Arabic font'));
    expect(await deliverAudit(row(), deps)).toBe('failed');
    expect(deps.clientMail).not.toHaveBeenCalled();
    expect(store.markDelivered).toHaveBeenCalledWith(deps.pool, p.id, false);
    const mail = deps.teamMail.mock.calls[0][0];
    expect(mail.subject).toContain('FAILED');
    expect(mail.bodyHtml).toContain('no Arabic font');
  });

  it('treats a client email that is not configured as a failure, not a delivery', async () => {
    deps.clientMail.mockResolvedValue('not-configured');
    expect(await deliverAudit(row(), deps)).toBe('failed');
    expect(store.markDelivered).toHaveBeenCalledWith(deps.pool, p.id, false);
  });

  it('does nothing for an audit that is not paid or has no report, so a repeat cannot send twice', async () => {
    expect(await deliverAudit(row({ status: 'delivered' }), deps)).toBe('skipped');
    expect(await deliverAudit(row({ status: 'in_review' }), deps)).toBe('skipped');
    expect(await deliverAudit(row({ report: null }), deps)).toBe('skipped');
    expect(deps.clientMail).not.toHaveBeenCalled();
  });
});

describe('handlePaid', () => {
  it('delivers when the team approved the report', async () => {
    store.markPaid.mockResolvedValue(row({ status: 'paid' }));
    expect(await handlePaid(p.id, deps)).toBe('delivered');
    expect(deps.clientMail).toHaveBeenCalledTimes(1);
  });

  it('does NOT send an unapproved draft: it waits and tells the team to approve', async () => {
    store.markPaid.mockResolvedValue(row({ status: 'in_review' }));
    expect(await handlePaid(p.id, deps)).toBe('waiting');
    expect(deps.clientMail).not.toHaveBeenCalled();
    const mail = deps.teamMail.mock.calls[0][0];
    expect(mail.subject).toContain('approve the report');
    expect(mail.ctaUrl).toContain('/review?t=');
  });

  it('reports no record when the audit was never saved (the old by-hand way)', async () => {
    store.markPaid.mockResolvedValue(null);
    expect(await handlePaid(p.id, deps)).toBe('no-record');
    expect(deps.clientMail).not.toHaveBeenCalled();
  });

  it('survives a database error', async () => {
    store.markPaid.mockRejectedValue(new Error('db'));
    expect(await handlePaid(p.id, deps)).toBe('no-record');
  });
});
