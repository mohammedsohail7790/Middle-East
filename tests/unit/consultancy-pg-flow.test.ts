/**
 * One client through the whole consultancy pipeline against a REAL Postgres: prospect -> proposal accepted in writing -> project with milestones and handover -> support plan with hours,
 * plus the server-side form draft. This is the only test that runs the stores' SQL for real, because the others use a fake pool. It needs migrations 080 and 084 applied to the database:
 *   CONSULTANCY_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:54398/postgres npx vitest run tests/unit/consultancy-pg-flow.test.ts
 * Skipped when the variable is not set (as in CI).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import * as leads from '../../apps/gateway/src/services/consultancy/lead-store.js';
import * as proposals from '../../apps/gateway/src/services/consultancy/proposal-store.js';
import * as projects from '../../apps/gateway/src/services/consultancy/project-store.js';
import * as support from '../../apps/gateway/src/services/consultancy/support-store.js';
import * as drafts from '../../apps/gateway/src/services/audit/audit-draft-store.js';

const URL = process.env.CONSULTANCY_TEST_DATABASE_URL;
const run = URL ? describe : describe.skip;

run('consultancy pipeline on a real database', () => {
  let db: pg.Pool;
  const tag = `pgflow-${Date.now()}`;
  const email = `${tag}@example.test`;
  const ids: { lead?: string; proposal?: string; project?: string; plan?: string } = {};

  beforeAll(() => {
    db = new pg.Pool({ connectionString: URL, max: 3 });
  });
  afterAll(async () => {
    if (ids.lead) await db.query(`DELETE FROM public.consultancy_leads WHERE id = $1`, [ids.lead]); // cascades to everything below it
    await db.query(`DELETE FROM public.audit_form_drafts WHERE token_hash IN (SELECT token_hash FROM public.audit_form_drafts WHERE data ->> 'tag' = $1)`, [tag]);
    await db.end();
  });

  it('saves a prospect, finds it, counts it, and moves its status forward only', async () => {
    const lead = await leads.createLead(db, { source: 'fit_check', company: `Acme ${tag}`, contact_name: 'Sam', email, answers: { q1: 'We lose leads at night', tag } });
    ids.lead = lead.id;
    expect(lead.status).toBe('new');
    expect((await leads.listLeads(db, { q: tag } as never)).items.map((l) => l.id)).toContain(lead.id);
    expect((await leads.countByStatus(db)).new).toBeGreaterThanOrEqual(1);
    expect(await leads.markLeadStatusByEmail(db, email, 'form_received')).toBe(true);
    expect((await leads.getLead(db, lead.id))?.status).toBe('form_received');
    await leads.markLeadStatusByEmail(db, email, 'new'); // must not go backwards
    expect((await leads.getLead(db, lead.id))?.status).toBe('form_received');
    const updated = await leads.updateLead(db, lead.id, { notes: 'Call on Sunday', owner_email: 'team@example.test' } as never);
    expect(updated?.notes).toBe('Call on Sunday');
  });

  it('takes a proposal from draft to accepted in writing, exactly once', async () => {
    const draft = await proposals.createDraft(db, ids.lead!, { title: 'Lead capture automation', scope: 'CRM entry and follow-up', items: [{ title: 'Build', priceMinor: 800000 }, { title: 'Training', priceMinor: 100000 }], currency: 'AED', deliveryWeeks: 3, language: 'en' }, 'team@example.test');
    ids.proposal = draft.id;
    expect(draft.status).toBe('draft');
    expect(Number(draft.total_minor)).toBe(900000);
    const sent = await proposals.markSent(db, draft.id);
    expect(sent?.status).toBe('sent');
    const first = await proposals.recordAcceptance(db, draft.id, { name: 'Sam Client', ip: '203.0.113.9', userAgent: 'test' });
    const second = await proposals.recordAcceptance(db, draft.id, { name: 'Someone Else', ip: '203.0.113.10', userAgent: 'test' });
    expect(JSON.stringify(second)).toContain('Sam Client'); // the second accept returns the first acceptance, it does not overwrite it
    expect(JSON.stringify(first)).toContain('Sam Client');
    const row = await proposals.getProposal(db, draft.id);
    expect(row?.status).toBe('accepted');
    expect(row?.accepted_name).toBe('Sam Client');
    expect(row?.terms_hash).toBe(proposals.termsHash(row!));
    const declined = await proposals.recordDecline(db, draft.id, 'changed my mind');
    expect(JSON.stringify(declined).toLowerCase()).not.toContain('declined"'); // an accepted proposal cannot be declined afterwards
    expect((await proposals.getProposal(db, draft.id))?.status).toBe('accepted');
  });

  it('turns the accepted proposal into one project with milestones and a handover checklist', async () => {
    const made = await projects.createProjectFromProposal(db, ids.proposal!, { startsOn: '2026-12-01' });
    ids.project = made.project.id;
    expect(made.created).toBe(true);
    expect(made.project.deliveryDate).toBe('2006-01-01'.replace('2006-01-01', '2026-12-22')); // start + 3 weeks
    const again = await projects.createProjectFromProposal(db, ids.proposal!, { startsOn: '2027-01-01' });
    expect(again.created).toBe(false);
    expect(again.project.id).toBe(made.project.id);

    const m1 = await projects.addMilestone(db, made.project.id, { title: 'Kick-off' } as never);
    const m2 = await projects.addMilestone(db, made.project.id, { title: 'Build' } as never);
    const m3 = await projects.addMilestone(db, made.project.id, { title: 'Handover' } as never);
    const reordered = await projects.reorderMilestones(db, made.project.id, [m3.id, m1.id, m2.id]);
    expect(reordered.map((m) => m.title)).toEqual(['Handover', 'Kick-off', 'Build']);
    await projects.updateMilestone(db, made.project.id, m1.id, { done: true } as never);
    expect((await projects.getProject(db, made.project.id))?.milestones.find((m) => m.id === m1.id)?.doneAt).toBeTruthy();

    await expect(projects.updateProject(db, made.project.id, { status: 'delivered' } as never)).rejects.toThrow(); // handover not complete
    const delivered = await projects.updateProject(db, made.project.id, { status: 'delivered', handover: { code: true, data: true, accounts: true, documentation: true } } as never);
    expect(delivered.status).toBe('delivered');
    expect(delivered.deliveredAt).toBeTruthy();
  });

  it('shows the client a status view without their email or company', async () => {
    const view = await projects.getPublicProjectView(db, ids.project!);
    const text = JSON.stringify(view);
    expect(view).toBeTruthy();
    expect(text).not.toContain(email);
    expect(text).not.toContain(`Acme ${tag}`);
  });

  it('tracks a monthly support plan and the hours worked against it', async () => {
    const plan = await support.createPlan(db, { leadId: ids.lead!, kind: 'standard', projectId: ids.project });
    ids.plan = plan.id;
    expect(Number(plan.price_minor ?? (plan as never as { priceMinor: number }).priceMinor)).toBe(75000);
    const first = await support.logHours(db, plan.id, { hours: 3, note: 'Monitoring', loggedBy: 'team@example.test' });
    expect(first).toBeTruthy();
    const usage = await support.usageFor(db, plan.id);
    expect(usage.usedHours).toBeCloseTo(3, 2);
    expect(usage.over).toBe(false);
    await support.logHours(db, plan.id, { hours: 1.5 });
    const over = await support.usageFor(db, plan.id);
    expect(over.usedHours).toBeCloseTo(4.5, 2);
    expect(over.over).toBe(true);
    const entries = await support.listHours(db, plan.id);
    expect(entries.length).toBe(2);
    expect(await support.deleteHours(db, plan.id, entries[0].id)).toBe(true);
    expect((await support.listHours(db, plan.id)).length).toBe(1);
    await support.setStatus(db, plan.id, 'active' as never);
    expect((await support.getPlan(db, plan.id))?.status).toBe('active');
  });

  it('keeps a server-side copy of the audit form under a hash of the link, never the link itself', async () => {
    const token = `token-${tag}-${'x'.repeat(30)}`;
    await drafts.saveDraft(db, token, { tag, answer: 'first' });
    await drafts.saveDraft(db, token, { tag, answer: 'second' });
    expect((await drafts.getDraft(db, token))?.data).toMatchObject({ answer: 'second' });
    const rows = await db.query(`SELECT token_hash FROM public.audit_form_drafts WHERE data ->> 'tag' = $1`, [tag]);
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0].token_hash).not.toContain(token);
    await drafts.deleteDraft(db, token);
    expect(await drafts.getDraft(db, token)).toBeNull();
  });
});
