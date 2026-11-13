/**
 * The automation engine's shared foundation: settings validation, the template registry, and the business-facing API (permissions, validation and error answers).
 * The data layer is stubbed here; automation-engine-pg.test.ts runs it for real against Postgres.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

const s = vi.hoisted(() => ({
  listAutomations: vi.fn(), getAutomation: vi.fn(), upsertAutomation: vi.fn(), listRuns: vi.fn(), getRun: vi.fn(),
  listApprovals: vi.fn(), decideApproval: vi.fn(), stats: vi.fn(),
}));
vi.mock('../../apps/gateway/src/services/automation-engine/store.js', () => s);

import { createAutomationEngineRouter } from '../../apps/gateway/src/services/automation-engine/automation.router.js';
import { validateConfig } from '../../apps/gateway/src/services/automation-engine/config-validation.js';
import { getTemplate, listTemplates, registerExecutor, getExecutor, registerTemplate, resetRegistry } from '../../apps/gateway/src/services/automation-engine/registry.js';
import type { AutomationTemplate } from '../../apps/gateway/src/services/automation-engine/types.js';

const T = '11111111-1111-4111-8111-111111111111';
const RUN = '22222222-2222-4222-8222-222222222222';
const APPR = '33333333-3333-4333-8333-333333333333';

const template: AutomationTemplate = {
  key: 'lead-to-crm', name: 'Add new leads to my CRM', description: 'Every lead the receptionist captures goes into your CRM.', trigger: 'lead.created', minutesSavedPerRun: 4,
  steps: [{ key: 'push', kind: 'crm.push_lead', title: 'Add the lead to your CRM', external: true }],
  config: [
    { key: 'notifyEmail', label: 'Team email', type: 'email', required: true },
    { key: 'minScore', label: 'Lowest score', type: 'number', default: 0 },
    { key: 'tag', label: 'Tag', type: 'text' },
    { key: 'channel', label: 'Channel', type: 'select', options: [{ value: 'email', label: 'Email' }, { value: 'sms', label: 'SMS' }], default: 'email' },
    { key: 'hook', label: 'Webhook', type: 'url' },
    { key: 'loud', label: 'Loud', type: 'boolean' },
  ],
};

beforeEach(() => {
  resetRegistry();
  registerTemplate(template);
  Object.values(s).forEach((f) => f.mockReset());
});

describe('settings validation', () => {
  it('fills defaults and keeps valid values', () => {
    const r = validateConfig(template, { notifyEmail: ' Team@Halla.com ', tag: ' vip ' }, { enabling: true });
    expect(r).toEqual({ ok: true, config: { notifyEmail: 'team@halla.com', minScore: 0, tag: 'vip', channel: 'email' } });
  });
  it('requires the required settings only when switching on', () => {
    expect(validateConfig(template, {}, { enabling: true }).ok).toBe(false);
    expect(validateConfig(template, {}, { enabling: false }).ok).toBe(true);
  });
  it('refuses unknown settings and wrong types instead of changing them', () => {
    const r = validateConfig(template, { notifyEmail: 'not an email', minScore: 'many', channel: 'fax', hook: 'http://plain.example', loud: 'yes', extra: 1 }, { enabling: true });
    expect(r.ok).toBe(false);
    const errors = (r as { errors: string[] }).errors.join(' | ');
    for (const part of ['email address', 'must be a number', 'listed choices', 'https://', 'yes or no', 'Unknown setting "extra"']) expect(errors).toContain(part);
  });
  it('accepts a number typed as text and a valid https web address', () => {
    const r = validateConfig(template, { notifyEmail: 'a@b.co', minScore: '40', hook: 'https://hooks.example/abc' }, { enabling: true });
    expect(r).toMatchObject({ ok: true, config: { minScore: 40, hook: 'https://hooks.example/abc' } });
  });
  it('limits the length of text', () => {
    expect(validateConfig(template, { notifyEmail: 'a@b.co', tag: 'x'.repeat(501) }, { enabling: true }).ok).toBe(false);
  });
  it('ignores a settings value that is not an object', () => {
    expect(validateConfig(template, 'nope', { enabling: false })).toMatchObject({ ok: true });
    expect(validateConfig(template, ['a'], { enabling: false })).toMatchObject({ ok: true });
  });
});

describe('the template registry', () => {
  it('lists, finds and refuses duplicates', () => {
    expect(listTemplates().map((t) => t.key)).toEqual(['lead-to-crm']);
    expect(getTemplate('lead-to-crm')?.name).toBe('Add new leads to my CRM');
    expect(getTemplate('nope')).toBeUndefined();
    expect(() => registerTemplate(template)).toThrow(/already registered/);
  });
  it('refuses a template with two steps of the same key', () => {
    expect(() => registerTemplate({ ...template, key: 'dup', steps: [template.steps[0], template.steps[0]] })).toThrow(/two steps/);
  });
  it('stores one executor per kind of step', async () => {
    const fn = vi.fn(async () => ({ summary: 'ok' }));
    registerExecutor('email.send', fn);
    expect(getExecutor('email.send')).toBe(fn);
    expect(getExecutor('webhook.post')).toBeUndefined();
  });
});

describe('the business-facing API', () => {
  let server: Server;
  let base: string;
  const engine = { resumeAfterDecision: vi.fn(), retryRun: vi.fn() };
  let allowed = true;
  let tenant: string | undefined = T;

  beforeEach(async () => {
    allowed = true;
    tenant = T;
    engine.resumeAfterDecision.mockReset();
    engine.retryRun.mockReset();
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      if (tenant) req.tenant = { id: tenant, userId: 'user-1', source: 'user_jwt' };
      next();
    });
    app.use('/automations', createAutomationEngineRouter({ pool: { query: vi.fn() } as never, canWrite: async () => allowed, engine }));
    await new Promise<void>((r) => { server = app.listen(0, '127.0.0.1', () => r()); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/automations`;
  });
  afterEach(() => new Promise<void>((r) => server.close(() => r())));

  const call = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, json: (await res.json()) as any };
  };

  it('needs a business on every route', async () => {
    tenant = undefined;
    for (const [m, p] of [['GET', '/'], ['PUT', '/lead-to-crm'], ['GET', '/runs'], ['GET', '/approvals'], ['GET', '/stats']] as const) expect((await call(m, p, m === 'PUT' ? {} : undefined)).status).toBe(400);
  });

  it('lists the library with this business\'s copy of each template', async () => {
    s.listAutomations.mockResolvedValue([{ id: 'a1', templateKey: 'lead-to-crm', enabled: true }]);
    const r = await call('GET', '/');
    expect(r.status).toBe(200);
    expect(r.json.data.templates[0]).toMatchObject({ key: 'lead-to-crm', automation: { id: 'a1', enabled: true } });
    expect(s.listAutomations.mock.calls[0][1]).toBe(T);
  });

  it('refuses an unknown automation and a user who may not change automations', async () => {
    expect((await call('PUT', '/nope', { enabled: true })).status).toBe(404);
    allowed = false;
    expect((await call('PUT', '/lead-to-crm', { enabled: true })).status).toBe(403);
    expect(s.upsertAutomation).not.toHaveBeenCalled();
  });

  it('refuses to switch on without the required settings, and says what is missing', async () => {
    s.getAutomation.mockResolvedValue(null);
    const r = await call('PUT', '/lead-to-crm', { enabled: true });
    expect(r.status).toBe(400);
    expect(r.json.details.join(' ')).toContain('Team email is required');
    expect(s.upsertAutomation).not.toHaveBeenCalled();
  });

  it('switches on with valid settings, saving the checked settings for this business only', async () => {
    s.getAutomation.mockResolvedValue(null);
    s.upsertAutomation.mockResolvedValue({ id: 'a1', enabled: true });
    const r = await call('PUT', '/lead-to-crm', { enabled: true, approvalMode: 'auto', config: { notifyEmail: 'Boss@Halla.com' } });
    expect(r.status).toBe(200);
    const [, tenantId, key, patch] = s.upsertAutomation.mock.calls[0];
    expect(tenantId).toBe(T);
    expect(key).toBe('lead-to-crm');
    expect(patch).toMatchObject({ enabled: true, approvalMode: 'auto', config: { notifyEmail: 'boss@halla.com', minScore: 0, channel: 'email' } });
  });

  it('switching off needs no settings and keeps the saved ones', async () => {
    s.getAutomation.mockResolvedValue({ config: { notifyEmail: 'a@b.co' } });
    s.upsertAutomation.mockResolvedValue({ id: 'a1', enabled: false });
    expect((await call('PUT', '/lead-to-crm', { enabled: false })).status).toBe(200);
    expect(s.upsertAutomation.mock.calls[0][3].config).toBeUndefined();
  });

  it('refuses an invalid approval mode', async () => {
    expect((await call('PUT', '/lead-to-crm', { approvalMode: 'whenever' })).status).toBe(400);
  });

  it('validates run filters and ids', async () => {
    expect((await call('GET', '/runs?status=weird')).status).toBe(400);
    expect((await call('GET', '/runs?automation=not-a-uuid')).status).toBe(400);
    expect((await call('GET', '/runs/not-a-uuid')).status).toBe(404);
    s.getRun.mockResolvedValue(null);
    expect((await call('GET', `/runs/${RUN}`)).status).toBe(404);
    s.listRuns.mockResolvedValue([]);
    expect((await call('GET', '/runs?status=failed')).status).toBe(200);
    expect(s.listRuns.mock.calls[0][1]).toBe(T);
  });

  it('runs a failed run again, and only a failed one', async () => {
    s.getRun.mockResolvedValue({ id: RUN, status: 'succeeded' });
    expect((await call('POST', `/runs/${RUN}/retry`)).status).toBe(409);
    s.getRun.mockResolvedValue({ id: RUN, status: 'failed' });
    engine.retryRun.mockResolvedValue({ ok: false, reason: 'not_implemented' });
    expect((await call('POST', `/runs/${RUN}/retry`)).status).toBe(501);
    engine.retryRun.mockResolvedValue({ ok: true, run: { id: RUN, status: 'running' } });
    const r = await call('POST', `/runs/${RUN}/retry`);
    expect(r.status).toBe(200);
    expect(engine.retryRun).toHaveBeenLastCalledWith(T, RUN);
    allowed = false;
    expect((await call('POST', `/runs/${RUN}/retry`)).status).toBe(403);
  });

  it('records an approval decision, answers clearly when it cannot, and never lets the engine change the answer', async () => {
    expect((await call('POST', `/approvals/${APPR}/decide`, { decision: 'maybe' })).status).toBe(400);
    s.decideApproval.mockResolvedValue({ ok: false, reason: 'not_found' });
    expect((await call('POST', `/approvals/${APPR}/decide`, { decision: 'approve' })).status).toBe(404);
    s.decideApproval.mockResolvedValue({ ok: false, reason: 'already_decided' });
    expect((await call('POST', `/approvals/${APPR}/decide`, { decision: 'approve' })).json.error).toMatch(/already answered/);
    s.decideApproval.mockResolvedValue({ ok: false, reason: 'expired' });
    expect((await call('POST', `/approvals/${APPR}/decide`, { decision: 'reject' })).json.error).toMatch(/expired/);
    s.decideApproval.mockResolvedValue({ ok: true, approval: { id: APPR, status: 'approved' } });
    engine.resumeAfterDecision.mockRejectedValue(new Error('engine down'));
    const r = await call('POST', `/approvals/${APPR}/decide`, { decision: 'approve' });
    expect(r.status).toBe(200);
    expect(r.json.data).toMatchObject({ approval: { status: 'approved' }, resumed: false });
    expect(s.decideApproval).toHaveBeenLastCalledWith(expect.anything(), T, APPR, 'approved', 'user-1');
    allowed = false;
    expect((await call('POST', `/approvals/${APPR}/decide`, { decision: 'approve' })).status).toBe(403);
  });

  it('reads stats and approvals scoped to the business', async () => {
    s.stats.mockResolvedValue({ runs: 0 });
    s.listApprovals.mockResolvedValue([]);
    expect((await call('GET', '/stats?days=7')).status).toBe(200);
    expect(s.stats).toHaveBeenCalledWith(expect.anything(), T, 7);
    expect((await call('GET', '/approvals?status=pending')).status).toBe(200);
    expect(s.listApprovals.mock.calls[0][1]).toBe(T);
    expect((await call('GET', '/approvals?status=odd')).status).toBe(400);
  });
});
