/**
 * The engine runtime through the REAL store on a real Postgres: trigger, pause for approval, the owner's yes, carry on, and expiry. Needs migration 085 and a voice_tenants table:
 *   AUTOMATION_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:54398/postgres npx vitest run tests/unit/automation-engine-runtime-pg.test.ts
 * Skipped when the variable is not set (as in CI).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import pg from 'pg';
import * as store from '../../apps/gateway/src/services/automation-engine/store.js';
import { createEngine } from '../../apps/gateway/src/services/automation-engine/engine.js';
import type { AutomationTemplate, StepExecutor } from '../../apps/gateway/src/services/automation-engine/types.js';

const URL = process.env.AUTOMATION_TEST_DATABASE_URL;
const run = URL ? describe : describe.skip;

const template: AutomationTemplate = {
  key: 'runtime-pg-test', name: 'Runtime test', description: 'd', trigger: 'lead.created', minutesSavedPerRun: 3, config: [],
  steps: [
    { key: 'prep', kind: 'data.transform', title: 'Prepare', external: false, params: { who: '{{trigger.name}}' } },
    { key: 'send', kind: 'webhook.post', title: 'Send it', external: true, params: { who: '{{steps.prep.who}}', apiKey: 'sk-live-123' } },
  ],
};

run('automation engine runtime on a real database', () => {
  let db: pg.Pool;
  let T: string;
  const sent = vi.fn();
  const executors: Record<string, StepExecutor> = {
    'data.transform': async (c) => ({ summary: 'Prepared', output: { who: String(c.params.who) } }),
    'webhook.post': async (c) => { sent(c.params, c.approved); return { summary: 'Sent' }; },
  };
  const engine = () => createEngine({
    db: async () => db, getTemplate: (k) => (k === template.key ? template : undefined), listTemplates: () => [template], getExecutor: (k) => executors[k], ensureLoaded: async () => {},
  });

  beforeAll(async () => {
    db = new pg.Pool({ connectionString: URL, max: 3 });
    T = (await db.query(`INSERT INTO public.voice_tenants (company_name) VALUES ('Runtime test') RETURNING id`)).rows[0].id;
  });
  afterAll(async () => {
    await db.query(`DELETE FROM public.voice_tenants WHERE id = $1`, [T]);
    await db.end();
  });

  it('pauses for approval, continues after the yes, and never repeats the trigger', async () => {
    await store.upsertAutomation(db, T, template.key, { name: template.name, enabled: true, approvalMode: 'ask', config: {} });
    const e = engine();
    await e.processTrigger(T, 'lead.created', 'lead-1', { name: 'Sam' });
    await e.processTrigger(T, 'lead.created', 'lead-1', { name: 'Sam' }); // repeat: nothing new
    const runs = await store.listRuns(db, T);
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe('waiting_approval');
    expect(sent).not.toHaveBeenCalled();

    const [approval] = await store.listApprovals(db, T, 'pending');
    expect(approval.stepKey).toBe('send');
    expect(JSON.stringify(approval.proposal)).not.toContain('sk-live-123');
    const decided = await store.decideApproval(db, T, approval.id, 'approved', 'owner');
    expect(decided.ok).toBe(true);
    const res = await e.resume(T, approval.id);
    expect(res.ok).toBe(true);

    const done = (await store.getRun(db, T, runs[0].id))!;
    expect(done).toMatchObject({ status: 'succeeded', minutesSaved: 3 });
    expect(done.steps.map((s) => s.status)).toEqual(['succeeded', 'succeeded']);
    expect(sent).toHaveBeenCalledTimes(1);
    expect(sent).toHaveBeenCalledWith({ who: 'Sam', apiKey: 'sk-live-123' }, true);
  });

  it('ends a run whose approval expired', async () => {
    const e = engine();
    await e.processTrigger(T, 'lead.created', 'lead-2', { name: 'Kim' });
    const [pending] = await store.listApprovals(db, T, 'pending');
    await db.query(`UPDATE public.tenant_automation_approvals SET expires_at = now() - interval '1 minute' WHERE id = $1`, [pending.id]);
    expect(await e.expireApprovals()).toBeGreaterThanOrEqual(1);
    const r = (await store.getRun(db, T, pending.runId))!;
    expect(r).toMatchObject({ status: 'rejected', error: 'No answer in 7 days' });
  });
});
