/**
 * apps/dashboard/src/lib/klaros-pilot-setup.ts against a FAKE API client. This proves the safeguards and failure handling of the
 * logic behind the owner-only dashboard page. It does not render the page and does not talk to a real gateway.
 */
import { describe, it, expect } from 'vitest';
import {
  ACKNOWLEDGEMENT, NEVER_TOUCH_TENANTS, PILOT_EVENTS, RUNTIME_SCOPES, buildPlan, createRuntimeKey, registerPilotWebhook,
  discardKey, discardWebhook, type ApiLike, type PilotKey,
} from '../../../apps/dashboard/src/lib/klaros-pilot-setup';

const TENANT = '5b1f0c3e-1111-4222-8333-444455556666';
const NAME = 'Test Clinic Ltd';
const ESCALATION = '+14155550142';
const OK = { tenantId: TENANT, tenantName: NAME, acknowledge: ACKNOWLEDGEMENT };
const MT_URL = 'https://klaros-halla-pilot.onrender.com/api/v1/webhooks/halla/c14d42d1-4c63-46c1-bdc3-89d4dc2b7b7b';
const DS_URL = 'https://klaros-halla-pilot.onrender.com/api/v1/webhooks/halla/8f3a3df4-b999-4d72-8d17-667c91edf494';

interface Opts {
  tenantId?: string; name?: string; transfer?: string | null; keys?: any[]; hooks?: any[];
  keyPost?: 'ok' | 'throw' | 'bad_body' | 'bad_format'; hookPost?: 'ok' | 'throw' | 'bad_body' | 'short_secret';
  revoke?: 'ok' | 'throw'; webhookDelete?: 'ok' | 'throw';
}
function fake(o: Opts = {}) {
  const calls: Array<{ method: string; path: string; body?: any }> = [];
  const state = { keys: o.keys ?? [], hooks: o.hooks ?? [] };
  const made = { key: null as string | null, secret: null as string | null };
  const api: ApiLike = {
    async get(path: string) {
      calls.push({ method: 'GET', path });
      if (path === '/tenants/me') return { id: o.tenantId ?? TENANT, companyName: o.name ?? NAME, transferNumber: o.transfer === undefined ? ESCALATION : o.transfer } as any;
      if (path === '/api-keys') return state.keys.map((k) => ({ ...k })) as any;
      if (path === '/webhooks') return state.hooks.map((h) => ({ ...h })) as any;
      throw new Error('unexpected GET ' + path);
    },
    async post(path: string, body: any) {
      calls.push({ method: 'POST', path, body });
      if (path === '/api-keys') {
        made.key = 'sk_calliq_' + 'ab12cd34'.repeat(8);
        const row = { id: 'key-1', name: body.name, keyPrefix: made.key.slice(0, 16) + '...', scopes: body.scopes, expiresAt: body.expiresAt };
        state.keys.push({ ...row });
        if (o.keyPost === 'throw') throw new Error('network dropped after the server processed the request');
        if (o.keyPost === 'bad_body') return undefined as any;
        return { ...row, key: o.keyPost === 'bad_format' ? 'not-a-real-key' : made.key } as any;
      }
      if (/^\/api-keys\/[^/]+\/revoke$/.test(path)) {
        if (o.revoke === 'throw') throw new Error('boom');
        state.keys.forEach((k) => { k.revokedAt = new Date().toISOString(); });
        return {} as any;
      }
      if (path === '/webhooks') {
        made.secret = 'f0'.repeat(32);
        state.hooks.push({ id: 'hook-1', name: body.name, url: body.url, events: body.events });
        if (o.hookPost === 'throw') throw new Error('network dropped after the server processed the request');
        if (o.hookPost === 'bad_body') return undefined as any;
        return { id: 'hook-1', secret: o.hookPost === 'short_secret' ? 'short' : made.secret } as any;
      }
      throw new Error('unexpected POST ' + path);
    },
    async del(path: string) {
      calls.push({ method: 'DELETE', path });
      if (o.webhookDelete === 'throw') throw new Error('boom');
      state.hooks.length = 0;
      return {} as any;
    },
  };
  return { api, calls, state, made, mutating: () => calls.filter((c) => c.method !== 'GET') };
}
const keyFor = (pilot: PilotKey) => ({ id: 'pre-key', name: pilot === 'medical_tourism' ? 'klaros-pilot-runtime (medical tourism)' : 'klaros-pilot-runtime (dropshipping)', keyPrefix: 'sk_calliq_pre1...', revokedAt: null, expiresAt: null });
const fails = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { return e as Error; } };

describe('tenant guard', () => {
  it.each(NEVER_TOUCH_TENANTS.map((id) => [id]))('REFUSES the existing tenant %s on every entry point, with no mutation', async (id) => {
    const f = fake({ tenantId: id });
    const c = { ...OK, tenantId: id };
    for (const fn of [() => buildPlan(f.api, 'medical_tourism'), () => createRuntimeKey(f.api, 'medical_tourism', c), () => registerPilotWebhook(f.api, 'dropshipping', c), () => discardKey(f.api, 'k', c), () => discardWebhook(f.api, 'h', c)]) {
      expect((await fails(fn()))?.message).toMatch(/REFUSING/);
    }
    expect(f.mutating()).toHaveLength(0);
  });

  it('rejects an unknown pilot name (including prototype keys)', async () => {
    const f = fake();
    for (const bad of ['plumbing', '__proto__', 'constructor']) expect((await fails(buildPlan(f.api, bad as PilotKey)))?.message).toMatch(/Unknown pilot/);
  });
});

describe('buildPlan is read-only and reveals no contact data', () => {
  it('shows exactly what would be created and never returns the escalation number', async () => {
    const f = fake();
    const plan = await buildPlan(f.api, 'medical_tourism');
    expect(f.mutating()).toHaveLength(0);
    expect(plan.tenant).toEqual({ id: TENANT, name: NAME, escalationNumberSet: true });
    expect(JSON.stringify(plan)).not.toContain(ESCALATION);
    expect(plan.scopes).toEqual(['workforce.read', 'workforce.write', 'leads.read', 'leads.write']);
    expect(plan.webhookUrl).toBe(MT_URL);
    expect(plan.events).toEqual(PILOT_EVENTS);
    expect(plan.events).not.toContain('appointment.requested');
    expect(plan.keyExists).toBeNull();
    expect(plan.webhookExists).toBeNull();
  });

  it('flags a missing escalation number, and existing objects', async () => {
    const f = fake({ transfer: null, keys: [keyFor('dropshipping')], hooks: [{ id: 'h0', url: DS_URL }] });
    const plan = await buildPlan(f.api, 'dropshipping');
    expect(plan.tenant.escalationNumberSet).toBe(false);
    expect(plan.keyExists?.id).toBe('pre-key');
    expect(plan.webhookExists?.id).toBe('h0');
  });

  it('the two pilots use different keys, env variables, Klaros tenants and URLs', async () => {
    const f = fake();
    const a = await buildPlan(f.api, 'medical_tourism'); const b = await buildPlan(f.api, 'dropshipping');
    expect(new Set([a.keyName, b.keyName]).size).toBe(2);
    expect(new Set([a.keyEnv, b.keyEnv]).size).toBe(2);
    expect(new Set([a.secretEnv, b.secretEnv]).size).toBe(2);
    expect(a.webhookUrl).not.toBe(b.webhookUrl);
  });
});

describe('createRuntimeKey', () => {
  it.each([
    ['no confirmation', undefined],
    ['wrong tenant id', { ...OK, tenantId: '99999999-9999-4999-8999-999999999999' }],
    ['wrong name', { ...OK, tenantName: 'Other Co' }],
    ['different case', { ...OK, tenantName: 'test clinic ltd' }],
    ['no acknowledgement', { ...OK, acknowledge: '' }],
  ])('creates nothing without exact confirmation (%s)', async (_n, c) => {
    const f = fake();
    expect((await fails(createRuntimeKey(f.api, 'medical_tourism', c as any)))?.message).toMatch(/Not confirmed/);
    expect(f.mutating()).toHaveLength(0);
  });

  it('creates ONE key with the 4 minimum scopes and a ~90-day expiry, and returns the value only to the caller', async () => {
    const f = fake();
    const r = await createRuntimeKey(f.api, 'medical_tourism', OK);
    expect(r.status).toBe('created');
    const posts = f.mutating();
    expect(posts).toHaveLength(1);
    expect(posts[0].body.scopes).toEqual([...RUNTIME_SCOPES]);
    expect(posts[0].body.scopes).not.toContain('webhooks.manage');
    expect(posts[0].body.scopes).not.toContain('calls.write');
    expect(new Date(posts[0].body.expiresAt).getTime()).toBeGreaterThan(Date.now() + 80 * 86400000);
    expect(r.status === 'created' && r.value).toMatch(/^sk_calliq_[0-9a-f]{64}$/);
  });

  it('is idempotent (an existing active key is never duplicated); a revoked or expired one does not block', async () => {
    const f = fake({ keys: [keyFor('medical_tourism')] });
    expect((await createRuntimeKey(f.api, 'medical_tourism', OK)).status).toBe('exists');
    expect(f.mutating()).toHaveLength(0);
    const g = fake({ keys: [{ ...keyFor('medical_tourism'), revokedAt: '2026-01-01' }, { ...keyFor('medical_tourism'), id: 'k2', expiresAt: '2020-01-01' }] });
    expect((await createRuntimeKey(g.api, 'medical_tourism', OK)).status).toBe('created');
  });

  it.each(['throw', 'bad_body'] as const)('leaves no orphan when the create result is lost (%s): the key is found by name and revoked', async (mode) => {
    const f = fake({ keyPost: mode });
    const e = await fails(createRuntimeKey(f.api, 'medical_tourism', OK));
    expect(e).not.toBeNull();
    expect(e?.message).toMatch(/The key was revoked/);
    expect(f.state.keys.length).toBe(1);
    expect(f.state.keys.every((k: any) => k.revokedAt)).toBe(true);
  });

  it('revokes a key that came back in an unexpected format', async () => {
    const f = fake({ keyPost: 'bad_format' });
    const e = await fails(createRuntimeKey(f.api, 'medical_tourism', OK));
    expect(e?.message).toMatch(/Unexpected key format/);
    expect(f.state.keys.every((k: any) => k.revokedAt)).toBe(true);
  });

  it('never claims a revoke that did not happen: it says so, with the key id and prefix, and no value', async () => {
    const f = fake({ keyPost: 'bad_body', revoke: 'throw' });
    const e = await fails(createRuntimeKey(f.api, 'medical_tourism', OK));
    expect(e?.message).toMatch(/THE REVOKE FAILED/);
    expect(e?.message).toContain('key-1');
    expect(e?.message).not.toMatch(/was revoked, so nothing/);
    expect(e?.message).not.toContain(f.made.key as string);
  });
});

describe('registerPilotWebhook', () => {
  it('refuses until the owner-gated runtime key exists', async () => {
    const f = fake();
    expect((await fails(registerPilotWebhook(f.api, 'medical_tourism', OK)))?.message).toMatch(/Create the runtime key first/);
    expect(f.mutating()).toHaveLength(0);
  });

  it('does nothing without exact confirmation', async () => {
    const f = fake({ keys: [keyFor('dropshipping')] });
    expect((await fails(registerPilotWebhook(f.api, 'dropshipping', { ...OK, tenantName: 'x' })))?.message).toMatch(/Not confirmed/);
    expect(f.mutating()).toHaveLength(0);
  });

  it.each([['medical_tourism', MT_URL], ['dropshipping', DS_URL]] as const)('registers ONE webhook for %s at the right Klaros URL with the 8 verified events', async (pilot, url) => {
    const f = fake({ keys: [keyFor(pilot)] });
    const r = await registerPilotWebhook(f.api, pilot, OK);
    expect(r.status).toBe('registered');
    const posts = f.mutating();
    expect(posts).toHaveLength(1);
    expect(posts[0].body.url).toBe(url);
    expect(posts[0].body.events).toEqual([...PILOT_EVENTS]);
    expect(posts[0].body.events).not.toContain('appointment.requested');
    expect(r.status === 'registered' && r.secret).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is idempotent', async () => {
    const f = fake({ keys: [keyFor('medical_tourism')], hooks: [{ id: 'h0', url: MT_URL }] });
    expect((await registerPilotWebhook(f.api, 'medical_tourism', OK)).status).toBe('exists');
    expect(f.mutating()).toHaveLength(0);
  });

  it.each(['throw', 'bad_body'] as const)('leaves no orphan when the register result is lost (%s)', async (mode) => {
    const f = fake({ keys: [keyFor('medical_tourism')], hookPost: mode });
    const e = await fails(registerPilotWebhook(f.api, 'medical_tourism', OK));
    expect(e?.message).toMatch(/The webhook was deleted/);
    expect(f.state.hooks).toHaveLength(0);
  });

  it('deletes a webhook that came back without a usable secret, and never claims a failed delete', async () => {
    const a = fake({ keys: [keyFor('medical_tourism')], hookPost: 'short_secret' });
    expect((await fails(registerPilotWebhook(a.api, 'medical_tourism', OK)))?.message).toMatch(/Unexpected response.*deleted/);
    expect(a.state.hooks).toHaveLength(0);
    const b = fake({ keys: [keyFor('medical_tourism')], hookPost: 'short_secret', webhookDelete: 'throw' });
    const e = await fails(registerPilotWebhook(b.api, 'medical_tourism', OK));
    expect(e?.message).toMatch(/THE DELETE FAILED/);
    expect(e?.message).toContain('hook-1');
  });
});

describe('discard helpers need the same confirmation', () => {
  it('revokes / deletes only when confirmed', async () => {
    const f = fake();
    expect((await fails(discardKey(f.api, 'key-1', { ...OK, tenantName: 'x' })))?.message).toMatch(/Not confirmed/);
    expect(f.mutating()).toHaveLength(0);
    await discardKey(f.api, 'key-1', OK);
    await discardWebhook(f.api, 'hook-1', OK);
    expect(f.mutating().map((c) => c.method + ' ' + c.path)).toEqual(['POST /api-keys/key-1/revoke', 'DELETE /webhooks/hook-1']);
  });
});
