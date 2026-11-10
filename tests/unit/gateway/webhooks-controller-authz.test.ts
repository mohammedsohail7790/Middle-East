/**
 * Webhook management authorization. The real webhooks router and the REAL role resolver / permission table (enterprise/rbac.service)
 * run against a faked database and a faked auth step that sets the tenant context. Plan gating and the webhook service are stubbed.
 * It proves that only the recorded tenant OWNER may create / change / delete / test-fire a webhook as a signed-in user. It does not prove the SQL against a real database.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import http from 'http';
import type { AddressInfo } from 'net';

const TENANT = '11111111-1111-4111-8111-111111111111';
const OWNER = 'user-owner';
const OTHER_TENANT = '22222222-2222-4222-8222-222222222222';
const dbState: { teamRole: string | null; orgRole: string | null; owner: string | null; fail: boolean } = { teamRole: null, orgRole: null, owner: OWNER, fail: false };

vi.mock('../../../apps/gateway/src/services/voice/tenant-scope.js', () => ({
  voiceDb: {
    query: vi.fn(async (sql: string, params: unknown[]) => {
      if (dbState.fail) throw new Error('db down');
      const userId = String(params[1]);
      if (/FROM public\.org_members/i.test(sql)) return { rows: dbState.orgRole && userId.startsWith('user-org') ? [{ role: dbState.orgRole }] : [] };
      if (/FROM public\.voice_tenants/i.test(sql)) return { rows: String(params[0]) === TENANT && userId === dbState.owner ? [{ '?column?': 1 }] : [] };
      if (/FROM public\.team_members/i.test(sql)) return { rows: dbState.teamRole && userId.startsWith('user-team') ? [{ role: dbState.teamRole }] : [] };
      return { rows: [] };
    }),
  },
}));
vi.mock('../../../apps/gateway/src/services/logger.js', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../../../apps/gateway/src/middleware/plan-gating.js', () => ({ requireProfessionalOrHigher: () => (_q: any, _s: any, next: any) => next() }));
vi.mock('../../../apps/gateway/src/middleware/index.js', () => ({
  asyncHandler: (fn: any) => (req: any, res: any, next: any) => Promise.resolve(fn(req, res, next)).catch(next),
}));
const svc = {
  list: vi.fn(async () => []), create: vi.fn(async () => ({ id: 'w1' })), update: vi.fn(async () => ({ id: 'w1' })),
  delete: vi.fn(async () => undefined), getDeliveries: vi.fn(async () => []), dispatchEvent: vi.fn(async () => undefined),
};
vi.mock('../../../apps/gateway/src/services/webhooks/webhooks.service.js', () => ({ customWebhooksService: svc }));

let server: http.Server; let base = '';
beforeAll(async () => {
  const { createWebhooksRouter } = await import('../../../apps/gateway/src/services/webhooks/webhooks.controller.js');
  const app = express();
  app.use(express.json());
  // Stand-in for requireTenant: the real one derives the tenant and source from the credential; here headers drive it.
  app.use((req: any, _res, next) => {
    const source = req.header('x-test-source');
    if (source) req.tenant = { id: req.header('x-test-tenant') || TENANT, userId: req.header('x-test-user') || undefined, source };
    next();
  });
  app.use('/api/v1/webhooks', createWebhooksRouter());
  app.use((err: any, _req: any, res: any, _next: any) => res.status(500).json({ success: false, error: String(err?.message ?? err) }));
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/webhooks`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
beforeEach(() => { delete process.env.CALLIQ_ENTERPRISE_RBAC; Object.values(svc).forEach((f) => f.mockClear()); dbState.teamRole = null; dbState.orgRole = null; dbState.owner = OWNER; dbState.fail = false; });

const call = (method: string, path: string, headers: Record<string, string>, body?: unknown) =>
  fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const asUser = (user: string, source = 'user_jwt') => ({ 'x-test-source': source, 'x-test-user': user });
const MUTATIONS: Array<[string, string, unknown, keyof typeof svc]> = [
  ['POST', '/', { name: 'n', url: 'https://example.com/hook', events: ['lead.created'] }, 'create'],
  ['PUT', '/w1', { name: 'renamed' }, 'update'],
  ['DELETE', '/w1', undefined, 'delete'],
  ['POST', '/w1/test', {}, 'dispatchEvent'],
];

describe('who can change webhooks (signed-in users): the tenant owner only', () => {
  it.each(MUTATIONS)('the tenant OWNER can %s %s', async (method, path, body, fn) => {
    const r = await call(method, path, asUser(OWNER), body);
    expect(r.status).toBeLessThan(300);
    expect(svc[fn]).toHaveBeenCalledTimes(1);
  });

  it('the owner is also allowed on a legacy_jwt user session', async () => {
    expect((await call('POST', '/', asUser(OWNER, 'legacy_jwt'), MUTATIONS[0][2])).status).toBeLessThan(300);
  });

  it.each([['admin'], ['agent'], ['viewer'], ['intern-unknown-role']])('a team %s is refused on every mutation, and the service is never reached', async (role) => {
    dbState.teamRole = role;
    for (const [method, path, body, fn] of MUTATIONS) {
      const r = await call(method, path, asUser('user-team-member'), body);
      expect(r.status).toBe(403);
      expect(svc[fn]).not.toHaveBeenCalled();
    }
  });

  it('an org_members admin is refused too', async () => {
    dbState.orgRole = 'admin';
    for (const [method, path, body, fn] of MUTATIONS) {
      expect((await call(method, path, asUser('user-org-admin'), body)).status).toBe(403);
      expect(svc[fn]).not.toHaveBeenCalled();
    }
  });

  it('a team member invited with role "owner" (an admin can invite one) is NOT the tenant owner and is refused', async () => {
    dbState.teamRole = 'owner';
    for (const [method, path, body, fn] of MUTATIONS) {
      expect((await call(method, path, asUser('user-team-invited-owner'), body)).status).toBe(403);
      expect(svc[fn]).not.toHaveBeenCalled();
    }
  });

  it('an org_members "owner" who is not the recorded tenant owner is refused', async () => {
    dbState.orgRole = 'owner';
    expect((await call('POST', '/', asUser('user-org-owner'), MUTATIONS[0][2])).status).toBe(403);
    expect(svc.create).not.toHaveBeenCalled();
  });

  it('a signed-in user who is not in the tenant at all is refused', async () => {
    for (const [method, path, body, fn] of MUTATIONS) {
      expect((await call(method, path, asUser('user-stranger'), body)).status).toBe(403);
      expect(svc[fn]).not.toHaveBeenCalled();
    }
  });

  it('tenant mismatch: the owner of one tenant cannot manage webhooks of another', async () => {
    for (const [method, path, body, fn] of MUTATIONS) {
      const r = await call(method, path, { ...asUser(OWNER), 'x-test-tenant': OTHER_TENANT }, body);
      expect(r.status).toBe(403);
      expect(svc[fn]).not.toHaveBeenCalled();
    }
  });

  it('fails closed on a database error, a session with no user id (e.g. a stream token), and an empty user id', async () => {
    dbState.fail = true;
    expect((await call('POST', '/', asUser(OWNER), MUTATIONS[0][2])).status).toBe(403);
    dbState.fail = false;
    expect((await call('POST', '/', { 'x-test-source': 'user_jwt' }, MUTATIONS[0][2])).status).toBe(403);
    expect((await call('POST', '/', { 'x-test-source': 'legacy_jwt' }, MUTATIONS[0][2])).status).toBe(403);
    expect(svc.create).not.toHaveBeenCalled();
  });

  it('turning RBAC off (CALLIQ_ENTERPRISE_RBAC=false, dev only) does not open the route: nobody gets in, not even the owner', async () => {
    process.env.CALLIQ_ENTERPRISE_RBAC = 'false';
    for (const user of [OWNER, 'user-team-member', 'user-stranger']) {
      expect((await call('POST', '/', asUser(user), MUTATIONS[0][2])).status).toBe(403);
    }
    expect(svc.create).not.toHaveBeenCalled();
  });

  it('a request with no tenant context at all is refused', async () => {
    expect((await call('POST', '/', {}, MUTATIONS[0][2])).status).toBe(403);
    expect(svc.create).not.toHaveBeenCalled();
  });
});

describe('machine credentials and read access keep working exactly as before', () => {
  it.each(['tenant_api_key', 'internal_service'])('a %s caller is not affected by the role check (API keys stay limited by their own scope policy)', async (source) => {
    const r = await call('POST', '/', { 'x-test-source': source }, MUTATIONS[0][2]);
    expect(r.status).toBeLessThan(300);
    expect(svc.create).toHaveBeenCalledTimes(1);
  });

  it('listing and delivery history are unchanged: a plain team member can still read', async () => {
    dbState.teamRole = 'viewer';
    expect((await call('GET', '/', asUser('user-team-viewer'))).status).toBe(200);
    expect((await call('GET', '/w1/deliveries', asUser('user-team-viewer'))).status).toBe(200);
    expect(svc.list).toHaveBeenCalledTimes(1);
  });
});
