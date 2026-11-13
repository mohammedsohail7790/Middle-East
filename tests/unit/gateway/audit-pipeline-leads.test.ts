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


const leadMoves = (d: any) => d.pool.query.mock.calls.filter((c: any[]) => String(c[0]).includes('consultancy_leads')).map((c: any[]) => c[1][1]);

describe('the pipeline keeps the lead in step', () => {
  it('moves the lead to form_received, then audit_in_review when the draft is saved', async () => {
    deps.pool.query.mockResolvedValue({ rows: [], rowCount: 1 });
    await startDraft(p, answers, deps);
    expect(leadMoves(deps)).toEqual(['form_received', 'audit_in_review']);
    expect(deps.pool.query.mock.calls[0][1][0]).toBe(p.email);
  });
  it('moves the lead to audit_paid when payment is recorded and again when the PDF is delivered', async () => {
    deps.pool.query.mockResolvedValue({ rows: [], rowCount: 1 });
    store.markPaid.mockResolvedValue(row());
    expect(await handlePaid(p.id, deps)).toBe('delivered');
    expect(leadMoves(deps)).toContain('audit_paid');
  });
  it('a database failure on the lead never stops the audit flow', async () => {
    deps.pool.query.mockRejectedValue(new Error('down'));
    store.markPaid.mockResolvedValue(row());
    await startDraft(p, answers, deps);
    expect(deps.teamMail.mock.calls[0][0].subject).toContain('Draft audit ready');
    expect(await handlePaid(p.id, deps)).toBe('delivered');
  });
});
