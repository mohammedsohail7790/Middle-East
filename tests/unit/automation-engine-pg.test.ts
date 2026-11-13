/**
 * The automation engine's data layer against a REAL Postgres: switching automations on, runs that never repeat, the approval flow, the report, and that one business can
 * never see another's data. Needs migration 085 (and a voice_tenants table) in the database:
 *   AUTOMATION_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:54398/postgres npx vitest run tests/unit/automation-engine-pg.test.ts
 * Skipped when the variable is not set (as in CI).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import * as store from '../../apps/gateway/src/services/automation-engine/store.js';

const URL = process.env.AUTOMATION_TEST_DATABASE_URL;
const run = URL ? describe : describe.skip;

run('automation engine data layer on a real database', () => {
  let db: pg.Pool;
  let A: string;
  let B: string;

  beforeAll(async () => {
    db = new pg.Pool({ connectionString: URL, max: 3 });
    A = (await db.query(`INSERT INTO public.voice_tenants (company_name) VALUES ('Automation test A') RETURNING id`)).rows[0].id;
    B = (await db.query(`INSERT INTO public.voice_tenants (company_name) VALUES ('Automation test B') RETURNING id`)).rows[0].id;
  });
  afterAll(async () => {
    await db.query(`DELETE FROM public.voice_tenants WHERE id = ANY($1::uuid[])`, [[A, B]]); // cascades to everything below it
    await db.end();
  });

  it('creates a business\'s copy of a template switched off, and changes only the fields given', async () => {
    const created = await store.upsertAutomation(db, A, 'lead-to-crm', { name: 'Add new leads to my CRM', config: { notifyEmail: 'a@x.co' }, createdBy: 'u1' });
    expect(created).toMatchObject({ enabled: false, approvalMode: 'ask', config: { notifyEmail: 'a@x.co' } });
    const on = await store.upsertAutomation(db, A, 'lead-to-crm', { name: 'ignored on update', enabled: true });
    expect(on.id).toBe(created.id);
    expect(on).toMatchObject({ enabled: true, approvalMode: 'ask', config: { notifyEmail: 'a@x.co' }, name: 'Add new leads to my CRM' });
    const auto = await store.upsertAutomation(db, A, 'lead-to-crm', { name: 'x', approvalMode: 'auto', config: { notifyEmail: 'b@x.co' } });
    expect(auto).toMatchObject({ enabled: true, approvalMode: 'auto', config: { notifyEmail: 'b@x.co' } });
    expect((await store.listAutomations(db, A)).length).toBe(1);
  });

  it('finds only switched-on automations for a trigger', async () => {
    await store.upsertAutomation(db, A, 'missed-call-followup', { name: 'Follow up missed calls' });
    const hit = await store.enabledForTrigger(db, A, ['lead-to-crm', 'missed-call-followup']);
    expect(hit.map((a) => a.templateKey)).toEqual(['lead-to-crm']);
    expect(await store.enabledForTrigger(db, A, [])).toEqual([]);
  });

  it('never runs the same trigger twice', async () => {
    const auto = (await store.getAutomation(db, A, 'lead-to-crm'))!;
    const n = { tenantId: A, automationId: auto.id, triggerKind: 'lead.created', triggerRef: 'lead-1', triggerPayload: { name: 'Sam' } };
    const first = await store.createRun(db, n);
    const second = await store.createRun(db, n);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.run.id).toBe(first.run.id);
    const other = await store.createRun(db, { ...n, triggerRef: 'lead-2' });
    expect(other.created).toBe(true);
  });

  it('logs a run step by step and records what it saved', async () => {
    const auto = (await store.getAutomation(db, A, 'lead-to-crm'))!;
    const { run: r } = await store.createRun(db, { tenantId: A, automationId: auto.id, triggerKind: 'call.ended', triggerRef: 'call-1', triggerPayload: {} });
    const steps = [{ index: 0, key: 'push', status: 'succeeded' as const, summary: 'Added to HubSpot' }];
    const done = await store.updateRun(db, A, r.id, { status: 'succeeded', steps, minutesSaved: 4, finished: true });
    expect(done).toMatchObject({ status: 'succeeded', minutesSaved: 4, steps });
    expect(done!.finishedAt).toBeTruthy();
    const failed = await store.updateRun(db, A, r.id, { status: 'failed', error: 'CRM said no' });
    expect(failed).toMatchObject({ status: 'failed', error: 'CRM said no', minutesSaved: 4 });
    const cleared = await store.updateRun(db, A, r.id, { error: null });
    expect(cleared!.error).toBeNull();
  });

  it('filters and pages the run log', async () => {
    const all = await store.listRuns(db, A);
    expect(all.length).toBeGreaterThanOrEqual(3);
    expect((await store.listRuns(db, A, { status: 'failed' })).every((x) => x.status === 'failed')).toBe(true);
    expect((await store.listRuns(db, A, { limit: 1 })).length).toBe(1);
    const auto = (await store.getAutomation(db, A, 'lead-to-crm'))!;
    expect((await store.listRuns(db, A, { automationId: auto.id })).length).toBe(all.length);
  });

  it('asks for approval once per step and records one answer only', async () => {
    const auto = (await store.getAutomation(db, A, 'lead-to-crm'))!;
    const { run: r } = await store.createRun(db, { tenantId: A, automationId: auto.id, triggerKind: 'lead.created', triggerRef: 'lead-ask', triggerPayload: {} });
    const a1 = await store.createApproval(db, { tenantId: A, runId: r.id, stepIndex: 1, stepKey: 'push', summary: 'Add Sam to HubSpot', proposal: { lead: 'Sam' } });
    const a2 = await store.createApproval(db, { tenantId: A, runId: r.id, stepIndex: 1, stepKey: 'push', summary: 'different text', proposal: {} });
    expect(a2.id).toBe(a1.id);
    expect(a1.status).toBe('pending');
    expect((await store.listApprovals(db, A, 'pending')).map((x) => x.id)).toContain(a1.id);

    const wrongBusiness = await store.decideApproval(db, B, a1.id, 'approved', 'intruder');
    expect(wrongBusiness).toEqual({ ok: false, reason: 'not_found' });
    const yes = await store.decideApproval(db, A, a1.id, 'approved', 'owner-1');
    expect(yes.ok).toBe(true);
    const again = await store.decideApproval(db, A, a1.id, 'rejected', 'owner-1');
    expect(again).toEqual({ ok: false, reason: 'already_decided' });
    expect((await store.getApproval(db, A, a1.id))).toMatchObject({ status: 'approved', decidedBy: 'owner-1' });
  });

  it('will not decide an approval past its deadline, and marks it expired', async () => {
    const auto = (await store.getAutomation(db, A, 'lead-to-crm'))!;
    const { run: r } = await store.createRun(db, { tenantId: A, automationId: auto.id, triggerKind: 'lead.created', triggerRef: 'lead-late', triggerPayload: {} });
    const a = await store.createApproval(db, { tenantId: A, runId: r.id, stepIndex: 0, stepKey: 'push', summary: 'late', proposal: {} });
    await db.query(`UPDATE public.tenant_automation_approvals SET expires_at = now() - interval '1 minute' WHERE id = $1`, [a.id]);
    expect(await store.decideApproval(db, A, a.id, 'approved', 'owner')).toEqual({ ok: false, reason: 'expired' });
    const expired = await store.expirePendingApprovals(db);
    expect(expired.map((x) => x.id)).toContain(a.id);
    expect((await store.getApproval(db, A, a.id))?.status).toBe('expired');
  });

  it('adds up the time saved by runs that succeeded, per automation', async () => {
    const s = await store.stats(db, A, 30);
    expect(s.runs).toBeGreaterThanOrEqual(4);
    expect(s.succeeded).toBe(0); // the one run that succeeded above was later marked failed
    expect(s.failed).toBeGreaterThanOrEqual(1);
    expect(s.minutesSaved).toBe(0);
    const auto = (await store.getAutomation(db, A, 'lead-to-crm'))!;
    const { run: r } = await store.createRun(db, { tenantId: A, automationId: auto.id, triggerKind: 'lead.created', triggerRef: 'lead-ok', triggerPayload: {} });
    await store.updateRun(db, A, r.id, { status: 'succeeded', minutesSaved: 4.5, finished: true });
    const s2 = await store.stats(db, A, 30);
    expect(s2.succeeded).toBe(1);
    expect(s2.minutesSaved).toBe(4.5);
    expect(s2.byAutomation.find((x) => x.templateKey === 'lead-to-crm')).toMatchObject({ succeeded: 1, minutesSaved: 4.5 });
  });

  it('keeps one business\'s automations, runs and approvals invisible to another', async () => {
    expect(await store.listAutomations(db, B)).toEqual([]);
    expect(await store.listRuns(db, B)).toEqual([]);
    expect(await store.listApprovals(db, B)).toEqual([]);
    const auto = (await store.getAutomation(db, A, 'lead-to-crm'))!;
    expect(await store.getAutomationById(db, B, auto.id)).toBeNull();
    const run = (await store.listRuns(db, A))[0];
    expect(await store.getRun(db, B, run.id)).toBeNull();
    expect(await store.updateRun(db, B, run.id, { status: 'failed' })).toBeNull();
    expect((await store.stats(db, B, 30)).runs).toBe(0);
  });
});
