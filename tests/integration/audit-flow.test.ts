import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { Pool } from 'pg';
import { readFileSync } from 'node:fs';

/**
 * The whole automatic audit, on a real Postgres and the real review page: the client submits, the draft is written (the AI is a stand-in), the team opens the review link,
 * edits and approves, the client pays, and the PDF is emailed. Only the AI and the email services are replaced. Runs only when AUDIT_TEST_DATABASE_URL is set.
 */
const url = process.env.AUDIT_TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

const h = vi.hoisted(() => ({ pool: null as any, paymentMail: vi.fn() }));
vi.mock('../../apps/gateway/src/services/db/pool.js', () => ({ get pool() { return h.pool; } }));
vi.mock('../../apps/gateway/src/services/audit/audit-payment-mail.js', () => ({ sendPaymentLinkEmail: h.paymentMail }));

import { createAuditReviewRouter } from '../../apps/gateway/src/services/audit/audit-review.controller.js';
import { handlePaid, startDraft } from '../../apps/gateway/src/services/audit/audit-pipeline.js';
import { assembleReport } from '../../apps/gateway/src/services/audit/audit-report.js';
import { getAudit } from '../../apps/gateway/src/services/audit/audit-store.js';

const raw = {
  assessment: { complexity: 'medium', volume: 'low', dataFormat: 'structured', systems: 'cloud', humanApproval: false, budgetMaxAed: null },
  summary: 'Acme re-types the same job details into three tools, which costs the office hours each week and causes missed invoices.',
  findings: ['Three tools hold the same data.'],
  opportunities: [{ title: 'Capture each job once', problem: 'Typed three times.', solution: 'One entry feeds all three tools.', payoff: 'Less admin.' }],
  phaseDeliverables: [['Map the flow'], ['Build it'], ['Test and hand over']],
  considerations: ['Confirm CRM admin access.'],
  nextSteps: ['Agree the scope.'],
};
const mk = (lang: 'en' | 'ar' = 'en') => assembleReport({ raw, lang, company: 'Acme', contactName: 'Sam', now: new Date('2026-11-12') });
const p = { k: 'form2' as const, id: 'it0flow1', company: 'Acme', email: 'sam@acme.test', name: 'Sam', cur: 'AED', x: 9999999999 };
const answers = { a_company: 'Acme Property Services', b_process: 'We type jobs into three tools by hand.' };

d('automatic audit, end to end', () => {
  let server: any;
  let base = '';
  beforeAll(async () => {
    process.env.AUDIT_LINK_SECRET = 'integration-secret-integration-secret';
    h.pool = new Pool({ connectionString: url });
    await h.pool.query("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF; IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; END $$;");
    await h.pool.query(readFileSync(new URL('../../supabase/migrations/080_audit_reports.sql', import.meta.url), 'utf8'));
    const app = express();
    app.use('/audit', createAuditReviewRouter());
    await new Promise<void>((r) => { server = app.listen(0, '127.0.0.1', () => r()); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/audit`;
  });
  afterAll(async () => { await h.pool.query("DELETE FROM public.audit_reports WHERE id LIKE 'it%'"); await h.pool.end(); await new Promise((r) => server.close(r)); });
  beforeEach(async () => { await h.pool.query("DELETE FROM public.audit_reports WHERE id LIKE 'it%'"); h.paymentMail.mockReset(); h.paymentMail.mockResolvedValue('sent'); });

  const deps = () => ({ draft: vi.fn().mockResolvedValue(mk()), teamMail: vi.fn().mockResolvedValue('sent'), clientMail: vi.fn().mockResolvedValue('sent') });
  const tokenFrom = (mail: any): string => decodeURIComponent(String(mail.ctaUrl).split('?t=')[1]);
  const post = (token: string, fields: Record<string, string>) => fetch(`${base}/review`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ t: token, ...fields }) });

  it('runs the full path: draft, review, edit, approve, pay, PDF to the client', async () => {
    const dp = deps();
    await startDraft(p, answers, dp);
    const reviewMail = dp.teamMail.mock.calls[0][0];
    const token = tokenFrom(reviewMail);
    expect((await getAudit(h.pool, p.id))?.status).toBe('in_review');

    const page = await (await fetch(`${base}/review?t=${encodeURIComponent(token)}`)).text();
    expect(page).toContain('Audit draft: Acme');
    expect(page).toContain('Ready for your review');
    expect(page).toContain('name="summary"');

    const saved = await (await post(token, { action: 'save', summary: 'Edited by the team.', fee: '26,000', phase1: '', weeks_min: '4', weeks_max: '7', findings: 'One\nTwo', phase_0: 'A', phase_1: 'B', phase_2: 'C', opp_title_0: 'Capture each job once', opp_problem_0: 'Typed three times.', opp_solution_0: 'One entry.', opp_payoff_0: 'Less admin.' })).text();
    expect(saved).toContain('Saved.');
    const row = await getAudit(h.pool, p.id);
    expect(row?.report?.summary).toBe('Edited by the team.');
    expect(row?.report?.investment.feeAed).toBe(26000);
    expect(row?.report?.timeline).toMatchObject({ weeksMin: 4, weeksMax: 7 });
    expect(row?.report?.findings).toEqual(['One', 'Two']);

    const approved = await (await post(token, { action: 'approve', summary: 'Edited by the team.', fee: '26000' })).text();
    expect(approved).toContain('Approved. The client was emailed the payment link');
    expect(h.paymentMail).toHaveBeenCalledTimes(1);
    expect(h.paymentMail.mock.calls[0][1]).toBe('en');
    // a second click on Approve sends nothing more
    const again = await (await post(token, { action: 'approve' })).text();
    expect(again).toMatch(/no longer open|Already approved/);
    expect(h.paymentMail).toHaveBeenCalledTimes(1);

    // the client pays: the PDF goes out, once
    expect(await handlePaid(p.id, { teamMail: dp.teamMail, clientMail: dp.clientMail })).toBe('delivered');
    const mail = dp.clientMail.mock.calls[0][0];
    expect(mail.to).toBe(p.email);
    expect(mail.attachments[0].content.subarray(0, 5).toString()).toBe('%PDF-');
    expect((await getAudit(h.pool, p.id))?.status).toBe('delivered');
    expect(await handlePaid(p.id, { teamMail: dp.teamMail, clientMail: dp.clientMail })).toBe('no-record');
    expect(dp.clientMail).toHaveBeenCalledTimes(1);
  });

  it('holds a payment that comes before approval, then delivers the moment the team approves', async () => {
    const dp = deps();
    await startDraft(p, answers, dp);
    const token = tokenFrom(dp.teamMail.mock.calls[0][0]);
    expect(await handlePaid(p.id, { teamMail: dp.teamMail, clientMail: dp.clientMail })).toBe('waiting');
    expect(dp.clientMail).not.toHaveBeenCalled();
    const text = await (await post(token, { action: 'approve', summary: raw.summary })).text();
    expect(text).toMatch(/PDF was emailed to them now|Approved/);
    expect(h.paymentMail).not.toHaveBeenCalled(); // already paid: no payment link
    const row = await getAudit(h.pool, p.id);
    expect(['paid', 'delivered', 'delivery_failed']).toContain(row?.status);
  });

  it('rejects a bad or wrong-kind link and an unknown audit', async () => {
    expect((await fetch(`${base}/review?t=garbage`)).status).toBe(400);
    const { signLink } = await import('../../apps/gateway/src/services/audit/signed-link.js');
    const wrong = signLink({ k: 'sendpay', id: 'x', company: 'A', email: 'a@b.co', x: 9999999999 }, process.env.AUDIT_LINK_SECRET!);
    expect((await fetch(`${base}/review?t=${encodeURIComponent(wrong)}`)).status).toBe(400);
    const ok = signLink({ k: 'review', id: 'itmissing', company: 'A', email: 'a@b.co', x: 9999999999 }, process.env.AUDIT_LINK_SECRET!);
    expect((await fetch(`${base}/review?t=${encodeURIComponent(ok)}`)).status).toBe(404);
  });

  it('serves the PDF preview from the saved report', async () => {
    const dp = deps();
    await startDraft(p, answers, dp);
    const token = tokenFrom(dp.teamMail.mock.calls[0][0]);
    const res = await fetch(`${base}/review/pdf?t=${encodeURIComponent(token)}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/pdf');
    expect(Buffer.from(await res.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-');
  });
});
