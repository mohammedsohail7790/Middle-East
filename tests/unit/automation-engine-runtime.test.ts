/** The engine against an in-memory fake of the store: every run rule, with executors written for the test. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEngine } from '../../apps/gateway/src/services/automation-engine/engine.js';
import type { AutomationApproval, AutomationRun, AutomationTemplate, ExecutorContext, StepExecutor, StepKind, TenantAutomation } from '../../apps/gateway/src/services/automation-engine/types.js';

function fakeStore() {
  const automations: TenantAutomation[] = [];
  const runs = new Map<string, AutomationRun>();
  const approvals = new Map<string, AutomationApproval>();
  let n = 0;
  const id = () => `id-${++n}`;
  const store = {
    enabledForTrigger: async (_db: any, tenantId: string, keys: string[]) => automations.filter((a) => a.tenantId === tenantId && a.enabled && keys.includes(a.templateKey)),
    getAutomationById: async (_db: any, tenantId: string, aid: string) => automations.find((a) => a.id === aid && a.tenantId === tenantId) ?? null,
    createRun: async (_db: any, x: any) => {
      const ex = [...runs.values()].find((r) => r.automationId === x.automationId && r.triggerKind === x.triggerKind && r.triggerRef === x.triggerRef);
      if (ex) return { run: ex, created: false };
      const run: AutomationRun = { id: id(), tenantId: x.tenantId, automationId: x.automationId, triggerKind: x.triggerKind, triggerRef: x.triggerRef, triggerPayload: x.triggerPayload, status: 'running', steps: [], error: null, minutesSaved: 0, startedAt: 'now', finishedAt: null };
      runs.set(run.id, run);
      return { run, created: true };
    },
    updateRun: async (_db: any, tenantId: string, rid: string, p: any) => {
      const r = runs.get(rid);
      if (!r || r.tenantId !== tenantId) return null;
      if (p.status) r.status = p.status;
      if (p.steps) r.steps = JSON.parse(JSON.stringify(p.steps));
      if (p.error !== undefined) r.error = p.error;
      if (p.minutesSaved !== undefined) r.minutesSaved = p.minutesSaved;
      if (p.finished) r.finishedAt = 'done';
      return r;
    },
    getRun: async (_db: any, tenantId: string, rid: string) => {
      const r = runs.get(rid);
      return r && r.tenantId === tenantId ? r : null;
    },
    claimFailedRun: async (_db: any, tenantId: string, rid: string) => {
      const r = runs.get(rid);
      if (!r || r.tenantId !== tenantId || r.status !== 'failed') return null;
      r.status = 'running';
      return r;
    },
    createApproval: async (_db: any, x: any) => {
      const ex = [...approvals.values()].find((a) => a.runId === x.runId && a.stepIndex === x.stepIndex);
      if (ex) return ex;
      const a: AutomationApproval = { id: id(), tenantId: x.tenantId, runId: x.runId, stepIndex: x.stepIndex, stepKey: x.stepKey, summary: x.summary, proposal: x.proposal, status: 'pending', decidedBy: null, decidedAt: null, createdAt: 'now', expiresAt: 'later' };
      approvals.set(a.id, a);
      return a;
    },
    getApproval: async (_db: any, tenantId: string, aid: string) => {
      const a = approvals.get(aid);
      return a && a.tenantId === tenantId ? a : null;
    },
    expirePendingApprovals: async () => {
      const out: AutomationApproval[] = [];
      for (const a of approvals.values()) if (a.status === 'pending' && a.expiresAt === 'past') { a.status = 'expired'; out.push(a); }
      return out;
    },
  };
  return { store, automations, runs, approvals, addAutomation: (o: Partial<TenantAutomation> = {}) => { const a: TenantAutomation = { id: id(), tenantId: 'T', templateKey: 'tpl', name: 'x', enabled: true, approvalMode: 'auto', config: { tag: 'c' }, createdAt: '', updatedAt: '', ...o }; automations.push(a); return a; } };
}

const tpl = (steps: AutomationTemplate['steps']): AutomationTemplate => ({ key: 'tpl', name: 'Tpl', description: 'd', trigger: 'lead.created', steps, config: [], minutesSavedPerRun: 4 });
const step = (key: string, kind: StepKind, external = false, extra: object = {}) => ({ key, kind, title: `Do ${key}`, external, ...extra });

function setup(template: AutomationTemplate, executors: Partial<Record<StepKind, StepExecutor>>, timeout = 30_000) {
  const f = fakeStore();
  const engine = createEngine({
    db: async () => ({ query: async () => ({ rows: [] }) }), store: f.store as any, getTemplate: (k) => (k === template.key ? template : undefined), listTemplates: () => [template],
    getExecutor: (k) => executors[k], stepTimeoutMs: timeout, ensureLoaded: async () => {},
  });
  return { ...f, engine };
}
const ok = (summary = 'done', output?: Record<string, unknown>): StepExecutor => async () => ({ summary, output });
const runOf = (s: ReturnType<typeof setup>) => [...s.runs.values()][0];

describe('engine runtime', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('runs steps in order, logs them and passes outputs and params ({{...}} from trigger, config and steps)', async () => {
    const seen: ExecutorContext[] = [];
    const s = setup(tpl([step('a', 'data.transform', false, { params: { who: '{{trigger.name}}', tag: '{{config.tag}}' } }), step('b', 'webhook.post', true, { params: { v: '{{steps.a.x}}' } })]), {
      'data.transform': async (c) => { seen.push(c); return { summary: 'A done', output: { x: 'out-a' } }; },
      'webhook.post': async (c) => { seen.push(c); return { summary: 'B done' }; },
    });
    s.addAutomation();
    await s.engine.processTrigger('T', 'lead.created', 'lead-1', { name: 'Sam' });
    const r = runOf(s);
    expect(r.status).toBe('succeeded');
    expect(r.minutesSaved).toBe(4);
    expect(r.steps.map((x) => [x.key, x.status, x.summary])).toEqual([['a', 'succeeded', 'A done'], ['b', 'succeeded', 'B done']]);
    expect(seen[0].params).toEqual({ who: 'Sam', tag: 'c' });
    expect(seen[1].params).toEqual({ v: 'out-a' });
    expect(seen[1].approved).toBe(true);
  });

  it('is idempotent: the same trigger never runs the same automation twice', async () => {
    const exec = vi.fn(ok());
    const s = setup(tpl([step('a', 'data.transform')]), { 'data.transform': exec });
    s.addAutomation();
    await s.engine.processTrigger('T', 'lead.created', 'lead-1', {});
    await s.engine.processTrigger('T', 'lead.created', 'lead-1', {});
    expect(exec).toHaveBeenCalledTimes(1);
    await s.engine.processTrigger('T', 'lead.created', 'lead-2', {});
    expect(exec).toHaveBeenCalledTimes(2);
  });

  it('ignores switched-off automations, other businesses and other triggers', async () => {
    const exec = vi.fn(ok());
    const s = setup(tpl([step('a', 'data.transform')]), { 'data.transform': exec });
    s.addAutomation({ enabled: false });
    await s.engine.processTrigger('T', 'lead.created', 'x', {});
    await s.engine.processTrigger('OTHER', 'lead.created', 'x', {});
    await s.engine.processTrigger('T', 'call.ended', 'x', {});
    expect(exec).not.toHaveBeenCalled();
  });

  it('ask mode: stops before an external step, asks with a redacted proposal, then continues from that step when approved', async () => {
    const ext = vi.fn(async (c: ExecutorContext) => ({ summary: `sent ${String(c.params.name)}` }));
    const later = vi.fn(ok('later'));
    const first = vi.fn(ok('first', { n: 1 }));
    const s = setup(tpl([step('a', 'data.transform', false), step('b', 'crm.push_lead', true, { params: { name: '{{trigger.name}}', apiKey: 'sk-123', url: 'https://hooks.example.com/secret/path' } }), step('c', 'data.transform', false)]), {
      'data.transform': async (c) => (c.step.key === 'a' ? first(c) : later(c)), 'crm.push_lead': ext,
    });
    s.addAutomation({ approvalMode: 'ask' });
    await s.engine.processTrigger('T', 'lead.created', 'l1', { name: 'Sam' });
    expect(runOf(s).status).toBe('waiting_approval');
    expect(ext).not.toHaveBeenCalled();
    const a = [...s.approvals.values()][0];
    expect(a.stepIndex).toBe(1);
    expect(a.summary).toContain('Do b');
    expect(JSON.stringify(a.proposal)).not.toContain('sk-123');
    expect(JSON.stringify(a.proposal)).not.toContain('secret/path');
    expect(a.proposal).toMatchObject({ params: { name: 'Sam', apiKey: '[hidden]' } });

    // not decided yet: nothing resumes
    expect((await s.engine.resume('T', a.id)).ok).toBe(false);
    a.status = 'approved';
    const res = await s.engine.resume('T', a.id);
    expect(res.ok).toBe(true);
    expect(ext).toHaveBeenCalledTimes(1);
    expect(ext.mock.calls[0][0].approved).toBe(true);
    expect(first).toHaveBeenCalledTimes(1); // not re-run
    expect(later).toHaveBeenCalledTimes(1);
    expect(runOf(s).status).toBe('succeeded');
    // a second resume changes nothing
    expect((await s.engine.resume('T', a.id)).ok).toBe(false);
    expect(ext).toHaveBeenCalledTimes(1);
  });

  it('rejection ends the run as rejected and runs no later step', async () => {
    const later = vi.fn(ok());
    const s = setup(tpl([step('b', 'crm.push_lead', true), step('c', 'data.transform')]), { 'crm.push_lead': ok(), 'data.transform': later });
    s.addAutomation({ approvalMode: 'ask' });
    await s.engine.processTrigger('T', 'lead.created', 'l1', {});
    const a = [...s.approvals.values()][0];
    a.status = 'rejected';
    await s.engine.resume('T', a.id);
    expect(runOf(s)).toMatchObject({ status: 'rejected', minutesSaved: 0 });
    expect(later).not.toHaveBeenCalled();
  });

  it('never runs an external step unapproved: ask mode waits, and the engine refuses even if asked directly', async () => {
    const ext = vi.fn(ok());
    const s = setup(tpl([step('b', 'webhook.post', true)]), { 'webhook.post': ext });
    s.addAutomation({ approvalMode: 'ask' });
    await s.engine.processTrigger('T', 'lead.created', 'l1', {});
    expect(ext).not.toHaveBeenCalled();
    // auto mode runs straight away with approved: true
    const s2 = setup(tpl([step('b', 'webhook.post', true)]), { 'webhook.post': ext });
    s2.addAutomation({ approvalMode: 'auto' });
    await s2.engine.processTrigger('T', 'lead.created', 'l1', {});
    expect(ext).toHaveBeenCalledTimes(1);
    expect(ext.mock.calls[0][0].approved).toBe(true);
  });

  it('a skipped step is logged as skipped with the reason and the run carries on; all skipped means a skipped run with 0 minutes', async () => {
    const s = setup(tpl([step('a', 'crm.push_lead'), step('b', 'data.transform')]), { 'crm.push_lead': async () => ({ summary: 'No CRM is connected', skipped: true }), 'data.transform': ok() });
    s.addAutomation();
    await s.engine.processTrigger('T', 'lead.created', 'l1', {});
    expect(runOf(s).steps[0]).toMatchObject({ status: 'skipped', summary: 'No CRM is connected' });
    expect(runOf(s).status).toBe('succeeded');

    const s2 = setup(tpl([step('a', 'crm.push_lead'), step('b', 'crm.push_lead')]), { 'crm.push_lead': async () => ({ summary: 'No CRM is connected', skipped: true }) });
    s2.addAutomation();
    await s2.engine.processTrigger('T', 'lead.created', 'l1', {});
    expect(runOf(s2)).toMatchObject({ status: 'skipped', minutesSaved: 0 });
  });

  it('skipIf skips a step (no approval asked) when it resolves true', async () => {
    const ext = vi.fn(ok());
    const s = setup(tpl([step('check', 'data.transform'), step('alert', 'notify.team', true, { skipIf: '{{steps.check.belowMinimum}}' })]), {
      'data.transform': async () => ({ summary: 'cold', output: { belowMinimum: true } }), 'notify.team': ext,
    });
    s.addAutomation({ approvalMode: 'ask' });
    await s.engine.processTrigger('T', 'lead.created', 'l1', {});
    expect(ext).not.toHaveBeenCalled();
    expect(s.approvals.size).toBe(0);
    expect(runOf(s).steps[1].status).toBe('skipped');
    expect(runOf(s)).toMatchObject({ status: 'skipped', minutesSaved: 0 }); // the only outside step was skipped
  });

  it('a failing step stops the run as failed; retry continues from that step only', async () => {
    let calls = 0;
    const first = vi.fn(ok('first', { n: 1 }));
    const flaky = vi.fn(async (c: ExecutorContext) => {
      calls++;
      if (calls === 1) throw new Error('CRM said no for +971501234567 token=abc123');
      return { summary: `got ${JSON.stringify(c.data.steps)}` };
    });
    const after = vi.fn(ok());
    const s = setup(tpl([step('a', 'data.transform'), step('b', 'webhook.post'), step('c', 'notify.team')]), { 'data.transform': first, 'webhook.post': flaky, 'notify.team': after });
    s.addAutomation();
    await s.engine.processTrigger('T', 'lead.created', 'l1', {});
    const r = runOf(s);
    expect(r.status).toBe('failed');
    expect(r.error).not.toContain('971501234567');
    expect(r.error).not.toContain('abc123');
    expect(r.error).not.toMatch(/\n\s+at /);
    expect(after).not.toHaveBeenCalled();
    const res = await s.engine.retry('T', r.id);
    expect(res.ok).toBe(true);
    expect(first).toHaveBeenCalledTimes(1);
    expect(flaky).toHaveBeenCalledTimes(2);
    expect(flaky.mock.calls[1][0].data.steps).toEqual({ a: { n: 1 } }); // earlier outputs survive the retry
    expect(after).toHaveBeenCalledTimes(1);
    expect(runOf(s)).toMatchObject({ status: 'succeeded', error: null });
    expect((await s.engine.retry('T', r.id)).ok).toBe(false); // only a failed run can be retried
  });

  it('two retries at the same moment run the steps once, not twice', async () => {
    let calls = 0;
    const flaky = vi.fn(async () => { if (++calls === 1) throw new Error('boom'); return { summary: 'ok' }; });
    const s = setup(tpl([step('a', 'webhook.post')]), { 'webhook.post': flaky });
    s.addAutomation();
    await s.engine.processTrigger('T', 'lead.created', 'l1', {});
    const r = runOf(s);
    expect(r.status).toBe('failed');
    const [x, y] = await Promise.all([s.engine.retry('T', r.id), s.engine.retry('T', r.id)]);
    expect([x.ok, y.ok].sort()).toEqual([false, true]);
    expect(flaky).toHaveBeenCalledTimes(2); // the first try plus exactly one retry
  });

  it('retrying an external step in ask mode reuses the answer already given for that step', async () => {
    let calls = 0;
    const ext = vi.fn(async () => { if (++calls === 1) throw new Error('boom'); return { summary: 'ok' }; });
    const s = setup(tpl([step('b', 'webhook.post', true)]), { 'webhook.post': ext });
    s.addAutomation({ approvalMode: 'ask' });
    await s.engine.processTrigger('T', 'lead.created', 'l1', {});
    const a = [...s.approvals.values()][0];
    a.status = 'approved';
    await s.engine.resume('T', a.id);
    expect(runOf(s).status).toBe('failed');
    await s.engine.retry('T', runOf(s).id);
    expect(runOf(s).status).toBe('succeeded');
    expect(s.approvals.size).toBe(1);
  });

  it('an approval nobody answered ends the run as rejected with "No answer in 7 days"', async () => {
    const s = setup(tpl([step('b', 'webhook.post', true)]), { 'webhook.post': ok() });
    s.addAutomation({ approvalMode: 'ask' });
    await s.engine.processTrigger('T', 'lead.created', 'l1', {});
    [...s.approvals.values()][0].expiresAt = 'past';
    expect(await s.engine.expireApprovals()).toBe(1);
    expect(runOf(s)).toMatchObject({ status: 'rejected', error: 'No answer in 7 days' });
    expect(await s.engine.expireApprovals()).toBe(0);
  });

  it('survives an executor that throws, times out, returns junk, or is missing', async () => {
    for (const exec of [
      async () => { throw new Error('kaboom'); },
      () => new Promise<never>(() => {}),
      async () => 'not an object' as any,
      async () => ({ summary: '' }) as any,
      async () => ({ summary: 'x', output: 'bad' }) as any,
      undefined,
    ]) {
      const s = setup(tpl([step('a', 'data.transform')]), exec ? { 'data.transform': exec as StepExecutor } : {}, 30);
      s.addAutomation();
      await expect(s.engine.processTrigger('T', 'lead.created', 'l1', {})).resolves.toBeUndefined();
      expect(runOf(s).status).toBe('failed');
      expect(runOf(s).steps[0].status).toBe('failed');
    }
  });

  it('a template that no longer exists fails a resumed run instead of crashing', async () => {
    const s = setup(tpl([step('b', 'webhook.post', true)]), { 'webhook.post': ok() });
    s.addAutomation({ approvalMode: 'ask' });
    await s.engine.processTrigger('T', 'lead.created', 'l1', {});
    const a = [...s.approvals.values()][0];
    a.status = 'approved';
    const gone = createEngine({ db: async () => ({ query: async () => ({ rows: [] }) }), store: s.store as any, getTemplate: () => undefined, listTemplates: () => [], getExecutor: () => undefined, ensureLoaded: async () => {} });
    const res = await gone.resume('T', a.id);
    expect(res.run?.status).toBe('failed');
  });
});
