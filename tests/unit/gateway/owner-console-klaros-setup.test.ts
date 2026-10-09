/**
 * scripts/owner-console/klaros-pilot-setup.js, executed for real inside an isolated vm context against a SIMULATED gateway.
 * No network is used: `fetch`, the cookie jar, `copy()` and the clipboard are all fakes. This proves the snippet's logic and its
 * safeguards. It does NOT prove behaviour against the real gateway, a real Supabase session cookie, or a real DevTools console
 * (those remain NOT VALIDATED until a real owner account exists).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import vm from 'vm';

const CODE = readFileSync(path.resolve(__dirname, '../../../scripts/owner-console/klaros-pilot-setup.js'), 'utf8');

const REF = 'xzhxnxxlbiiidipcgfrv';
const TOKEN = 'eyJTEST.TOKEN.SHOULD_NEVER_APPEAR_ANYWHERE';
const NEW_TENANT = '5b1f0c3e-1111-4222-8333-444455556666';
const CALL_IQ = 'ad9c3394-f7ab-42af-aa74-43f2b0d8b52c';
const HALLA_AI = 'f90e10ca-e975-4bf6-bc8d-97d7318cd9da';
const ESCALATION = '+14155550142';
const OK = { tenantId: NEW_TENANT, tenantName: 'Test Clinic Ltd', acknowledge: 'I reviewed preview()' };

const b64url = (s: string) => Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const session = (over: Record<string, unknown> = {}) => JSON.stringify({ access_token: TOKEN, refresh_token: 'refresh-XYZ', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1' }, ...over });
const cookie = {
  single: (ref = REF, s = session()) => `sb-${ref}-auth-token=base64-${b64url(s)}`,
  chunked: (ref = REF, s = session()) => { const v = `base64-${b64url(s)}`; const h = Math.floor(v.length / 2); return `sb-${ref}-auth-token.1=${v.slice(h)}; sb-${ref}-auth-token.0=${v.slice(0, h)}`; },
  rawJson: (ref = REF, s = session()) => `sb-${ref}-auth-token=${encodeURIComponent(s)}`,
};

interface Opts {
  cookie?: string; tenantId?: string; name?: string; transfer?: string | null; owner?: boolean;
  keys?: any[]; hooks?: any[]; copy?: 'ok' | 'none'; clipboard?: 'ok' | 'fail';
}
function world(o: Opts = {}) {
  const logs: string[] = []; const calls: Array<{ method: string; url: string; headers: Record<string, string>; body: any; init: any }> = [];
  const copied: string[] = []; const created = { key: null as string | null, secret: null as string | null };
  const state = { keys: o.keys ?? [], hooks: o.hooks ?? [] };
  const tenantId = o.tenantId ?? NEW_TENANT;
  const fetchMock = async (url: string, init: any) => {
    const headers = init.headers || {}; const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, url, headers, body, init });
    const reply = (status: number, json: unknown) => ({ status, json: async () => json });
    if (headers.Authorization !== `Bearer ${TOKEN}`) return reply(401, { success: false, error: 'Unauthorized' });
    if (headers['x-tenant-id'] && headers['x-tenant-id'] !== tenantId) return reply(403, { success: false, error: 'Tenant scope mismatch' });
    const p = url.replace('https://gateway.hallaai.com/api/v1', '');
    if (method === 'GET' && p === '/tenants/me') return reply(200, { success: true, data: { id: tenantId, companyName: o.name ?? 'Test Clinic Ltd', transferNumber: o.transfer === undefined ? ESCALATION : o.transfer } });
    if (method === 'GET' && p === '/api-keys') return reply(200, { success: true, data: state.keys });
    if (method === 'POST' && p === '/api-keys') {
      if (o.owner === false) return reply(403, { success: false, error: 'Forbidden' });
      created.key = 'sk_calliq_' + 'ab12cd34'.repeat(8);
      const k = { id: 'key-1', name: body.name, keyPrefix: created.key.slice(0, 16) + '...', scopes: body.scopes, expiresAt: body.expiresAt, key: created.key };
      state.keys.push({ ...k, key: undefined });
      return reply(201, { success: true, data: k });
    }
    if (method === 'POST' && /^\/api-keys\/[^/]+\/revoke$/.test(p)) { state.keys.forEach((k: any) => { k.revokedAt = new Date().toISOString(); }); return reply(200, { success: true }); }
    if (method === 'GET' && p === '/webhooks') return reply(200, { success: true, data: state.hooks });
    if (method === 'POST' && p === '/webhooks') { created.secret = 'f0'.repeat(32); const h = { id: 'hook-1', name: body.name, url: body.url, events: body.events, secret: created.secret }; state.hooks.push({ ...h, secret: undefined }); return reply(201, { success: true, data: h }); }
    if (method === 'DELETE' && /^\/webhooks\/[^/]+$/.test(p)) { state.hooks.length = 0; return reply(200, { success: true }); }
    return reply(404, { success: false, error: 'not found' });
  };
  const sandbox: Record<string, unknown> = {
    console: { log: (...a: unknown[]) => logs.push(a.map(String).join(' ')), error: (...a: unknown[]) => logs.push(a.map(String).join(' ')) },
    document: { cookie: o.cookie ?? cookie.single() },
    fetch: fetchMock, atob, TextDecoder,
    navigator: { clipboard: { writeText: async (v: string) => { if (o.clipboard === 'fail') throw new Error('not focused'); copied.push(v); } } },
  };
  if ((o.copy ?? 'ok') === 'ok') sandbox.copy = (v: string) => { copied.push(v); };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(CODE, ctx);
  const api = (ctx as any).hallaSetup;
  return { api, logs, calls, copied, created, state, all: () => logs.join('\n') };
}
const mutating = (calls: Array<{ method: string }>) => calls.filter((c) => c.method !== 'GET');
const run = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { return e as Error; } };

describe('session and identity guards', () => {
  it('without a dashboard session it fails before any request', async () => {
    const w = world({ cookie: 'theme=dark; other=1' });
    const e = await run(w.api.preview('medical_tourism'));
    expect(e?.message).toMatch(/No dashboard session/);
    expect(w.calls).toHaveLength(0);
  });

  it('refuses a session from a different Supabase project, and an expired session, before any request', async () => {
    const wrongRef = world({ cookie: cookie.single('someotherproject123') });
    expect((await run(wrongRef.api.preview('medical_tourism')))?.message).toMatch(/different Supabase project/);
    const expired = world({ cookie: cookie.single(REF, session({ expires_at: Math.floor(Date.now() / 1000) - 5 })) });
    expect((await run(expired.api.preview('medical_tourism')))?.message).toMatch(/expire/);
    expect(wrongRef.calls.length + expired.calls.length).toBe(0);
  });

  it.each([['single', cookie.single()], ['chunked (reassembled in order)', cookie.chunked()], ['raw JSON', cookie.rawJson()]])('reads the %s session cookie format', async (_n, c) => {
    const w = world({ cookie: c });
    expect(await run(w.api.preview('medical_tourism'))).toBeNull();
    expect(w.calls.length).toBeGreaterThan(0);
  });

  it.each([[CALL_IQ, 'Call IQ'], [HALLA_AI, 'Halla AI']])('REFUSES the existing %s tenant on every entry point and changes nothing', async (id) => {
    const w = world({ tenantId: id, name: 'Existing Co' });
    for (const fn of [() => w.api.preview('medical_tourism'), () => w.api.createKey('medical_tourism', { ...OK, tenantId: id, tenantName: 'Existing Co' }), () => w.api.registerWebhook('dropshipping', { ...OK, tenantId: id, tenantName: 'Existing Co' }), () => w.api.revokeKey('k', { ...OK, tenantId: id, tenantName: 'Existing Co' }), () => w.api.deleteWebhook('h', { ...OK, tenantId: id, tenantName: 'Existing Co' })]) {
      expect((await run(fn()))?.message).toMatch(/REFUSING/);
    }
    expect(w.calls.every((c) => c.url.endsWith('/tenants/me'))).toBe(true);
    expect(w.copied).toHaveLength(0);
  });

  it('rejects an unknown pilot name', async () => {
    const w = world();
    expect((await run(w.api.preview('plumbing')))?.message).toMatch(/pilot must be one of/);
  });
});

describe('preview() is read-only and leaks nothing', () => {
  it('only GETs, shows tenant id/name and the plan, never the token, a key, or the escalation number', async () => {
    const w = world();
    await w.api.preview('medical_tourism');
    expect(mutating(w.calls)).toHaveLength(0);
    const out = w.all();
    expect(out).toContain(NEW_TENANT);
    expect(out).toContain('Test Clinic Ltd');
    expect(out).toContain('workforce.read, workforce.write, leads.read, leads.write');
    expect(out).toContain('https://klaros-halla-pilot.onrender.com/api/v1/webhooks/halla/c14d42d1-4c63-46c1-bdc3-89d4dc2b7b7b');
    expect(out).toContain('Human escalation number configured: yes');
    expect(out).not.toContain(ESCALATION);
    expect(out).not.toContain(TOKEN);
    expect(out).not.toContain('sk_calliq_');
  });

  it('warns when no escalation number is set', async () => {
    const w = world({ transfer: null });
    await w.api.preview('dropshipping');
    expect(w.all()).toMatch(/NO - set it in Business Profile/);
  });

  it('every request goes to the one gateway origin, with the token only there, no cookies, no redirects', async () => {
    const w = world();
    await w.api.preview('medical_tourism');
    await w.api.createKey('medical_tourism', OK);
    await w.api.registerWebhook('medical_tourism', OK);
    expect(w.calls.length).toBeGreaterThan(5);
    for (const c of w.calls) {
      expect(c.url.startsWith('https://gateway.hallaai.com/api/v1/')).toBe(true);
      expect(c.init.credentials).toBe('omit');
      expect(c.init.redirect).toBe('error');
      expect(c.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    }
  });
});

describe('createKey', () => {
  it.each([
    ['no confirmation', undefined],
    ['wrong tenant id', { ...OK, tenantId: '99999999-9999-4999-8999-999999999999' }],
    ['wrong tenant name', { ...OK, tenantName: 'Other Co' }],
    ['name in a different case', { ...OK, tenantName: 'test clinic ltd' }],
    ['missing acknowledgement', { tenantId: NEW_TENANT, tenantName: 'Test Clinic Ltd' }],
  ])('does nothing without exact confirmation (%s)', async (_n, c) => {
    const w = world();
    expect((await run(w.api.createKey('medical_tourism', c)))?.message).toMatch(/Not confirmed/);
    expect(mutating(w.calls)).toHaveLength(0);
    expect(w.copied).toHaveLength(0);
  });

  it('creates exactly one key with the 4 minimum scopes, copies it, and never shows or re-sends it', async () => {
    const w = world();
    await w.api.createKey('medical_tourism', OK);
    const posts = w.calls.filter((c) => c.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0].url).toBe('https://gateway.hallaai.com/api/v1/api-keys');
    expect(posts[0].body.scopes).toEqual(['workforce.read', 'workforce.write', 'leads.read', 'leads.write']);
    expect(posts[0].body.scopes).not.toContain('webhooks.manage');
    expect(posts[0].body.scopes).not.toContain('calls.write');
    expect(new Date(posts[0].body.expiresAt).getTime()).toBeGreaterThan(Date.now() + 80 * 86400000);
    expect(w.copied).toEqual([w.created.key]);
    expect(w.copied[0]).toMatch(/^sk_calliq_[0-9a-f]{64}$/);
    expect(w.all()).not.toContain(w.created.key as string);
    expect(w.all()).not.toContain(TOKEN);
    expect(w.all()).toContain('HALLA_API_KEY_MT');
    expect(w.calls.some((c) => JSON.stringify(c.body ?? '').includes(w.created.key as string))).toBe(false);
  });

  it('uses the dropshipping names and env var for that pilot', async () => {
    const w = world();
    await w.api.createKey('dropshipping', OK);
    expect(w.calls.find((c) => c.method === 'POST')!.body.name).toContain('dropshipping');
    expect(w.all()).toContain('HALLA_API_KEY_DS');
  });

  it('is idempotent: an existing active key with that name is never duplicated', async () => {
    const w = world({ keys: [{ id: 'k0', name: 'klaros-pilot-runtime (medical tourism)', keyPrefix: 'sk_calliq_abcd...', revokedAt: null, expiresAt: null }] });
    await w.api.createKey('medical_tourism', OK);
    expect(mutating(w.calls)).toHaveLength(0);
    expect(w.copied).toHaveLength(0);
    expect(w.all()).toMatch(/already exists/);
  });

  it('a revoked or expired key with the same name does not block creating a new one', async () => {
    const w = world({ keys: [{ id: 'k0', name: 'klaros-pilot-runtime (medical tourism)', revokedAt: '2026-01-01', expiresAt: null }, { id: 'k1', name: 'klaros-pilot-runtime (medical tourism)', revokedAt: null, expiresAt: '2020-01-01' }] });
    await w.api.createKey('medical_tourism', OK);
    expect(w.calls.filter((c) => c.method === 'POST')).toHaveLength(1);
  });

  it('REVOKES the key when it cannot be copied (a value nobody saw must not stay valid) and still prints nothing secret', async () => {
    const w = world({ copy: 'none', clipboard: 'fail' });
    const e = await run(w.api.createKey('medical_tourism', OK));
    expect(e?.message).toMatch(/REVOKED/);
    expect(w.calls.some((c) => c.method === 'POST' && c.url.endsWith('/revoke'))).toBe(true);
    expect(w.all()).not.toContain(w.created.key as string);
  });

  it('falls back to the clipboard API when DevTools copy() is unavailable', async () => {
    const w = world({ copy: 'none', clipboard: 'ok' });
    await w.api.createKey('medical_tourism', OK);
    expect(w.copied).toEqual([w.created.key]);
  });

  it('a non-owner is refused by the server: no copy, no webhook call, clear error', async () => {
    const w = world({ owner: false });
    const e = await run(w.api.createKey('medical_tourism', OK));
    expect(e?.message).toMatch(/NOT created/);
    expect(w.copied).toHaveLength(0);
    expect(w.calls.some((c) => c.url.endsWith('/webhooks'))).toBe(false);
  });
});

describe('registerWebhook', () => {
  it('does nothing without exact confirmation', async () => {
    const w = world();
    expect((await run(w.api.registerWebhook('dropshipping', { ...OK, tenantName: 'x' })))?.message).toMatch(/Not confirmed/);
    expect(mutating(w.calls)).toHaveLength(0);
  });

  it.each([['medical_tourism', 'c14d42d1-4c63-46c1-bdc3-89d4dc2b7b7b', 'HALLA_WEBHOOK_SECRET_MT'], ['dropshipping', '8f3a3df4-b999-4d72-8d17-667c91edf494', 'HALLA_WEBHOOK_SECRET_DS']])('registers one webhook for %s at the right Klaros tenant URL with the 8 verified events only', async (pilot, klarosId, envName) => {
    const w = world();
    await w.api.registerWebhook(pilot, OK);
    const posts = w.calls.filter((c) => c.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0].url).toBe('https://gateway.hallaai.com/api/v1/webhooks');
    expect(posts[0].body.url).toBe(`https://klaros-halla-pilot.onrender.com/api/v1/webhooks/halla/${klarosId}`);
    expect(posts[0].body.events).toEqual(['lead.created', 'lead.updated', 'lead.qualified', 'lead.escalated', 'call.completed', 'appointment.confirmed', 'appointment.rescheduled', 'appointment.cancelled']);
    expect(posts[0].body.events).not.toContain('appointment.requested');
    expect(w.copied).toEqual([w.created.secret]);
    expect(w.all()).not.toContain(w.created.secret as string);
    expect(w.all()).not.toContain(TOKEN);
    expect(w.all()).toContain(envName);
  });

  it('is idempotent: an existing webhook for the URL is never duplicated, and its secret is never requested', async () => {
    const w = world({ hooks: [{ id: 'h0', url: 'https://klaros-halla-pilot.onrender.com/api/v1/webhooks/halla/c14d42d1-4c63-46c1-bdc3-89d4dc2b7b7b' }] });
    await w.api.registerWebhook('medical_tourism', OK);
    expect(mutating(w.calls)).toHaveLength(0);
    expect(w.copied).toHaveLength(0);
  });

  it('DELETES the webhook when the secret cannot be copied', async () => {
    const w = world({ copy: 'none', clipboard: 'fail' });
    const e = await run(w.api.registerWebhook('medical_tourism', OK));
    expect(e?.message).toMatch(/DELETED/);
    expect(w.calls.some((c) => c.method === 'DELETE')).toBe(true);
    expect(w.all()).not.toContain(w.created.secret as string);
  });
});

describe('the two pilots never share anything', () => {
  it('different key names, env variables, Klaros tenant ids and webhook URLs', async () => {
    const a = world(); const b = world();
    await a.api.preview('medical_tourism'); await b.api.preview('dropshipping');
    const ua = a.all().match(/halla\/[0-9a-f-]{36}/)![0]; const ub = b.all().match(/halla\/[0-9a-f-]{36}/)![0];
    expect(ua).not.toBe(ub);
    expect(a.all()).toContain('medical tourism');
    expect(b.all()).toContain('dropshipping');
  });
});
