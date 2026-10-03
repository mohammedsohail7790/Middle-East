import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../apps/gateway/src/services/api-keys/apiKey.service.js', () => ({
  tenantApiKeyService: { validateKey: vi.fn() },
}));
vi.mock('../../../apps/gateway/src/services/auth/jwt-tenant-verifier.js', () => ({
  verifyUserBearerToken: vi.fn(),
}));
vi.mock('../../../apps/gateway/src/services/auth/internal-service-auth.js', () => ({
  verifyInternalServiceRequest: vi.fn(),
}));
vi.mock('../../../apps/gateway/src/security/sse-token.js', () => ({
  verifySseDashboardToken: vi.fn(() => null),
}));

import { requireTenant } from '../../../apps/gateway/src/middleware/require-tenant.js';
import { tenantApiKeyService } from '../../../apps/gateway/src/services/api-keys/apiKey.service.js';
import { verifyUserBearerToken } from '../../../apps/gateway/src/services/auth/jwt-tenant-verifier.js';
import { getTenantContext } from '../../../apps/gateway/src/services/auth/tenant-context.js';

const UUID = '123e4567-e89b-42d3-a456-426614174000';

function mockReqRes(method: string, url: string, headers: Record<string, string>) {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  const req: any = {
    method,
    originalUrl: url,
    header: (name: string) => lower[name.toLowerCase()],
    headers: { ...lower },
  };
  const res: any = {
    statusCode: 200,
    body: undefined as any,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    setHeader() {},
  };
  return { req, res, next: vi.fn() };
}

const withKey = (scopes: string[], tenantId = 'tenant-a') =>
  (tenantApiKeyService.validateKey as any).mockResolvedValue({ tenantId, scopes });

async function call(method: string, url: string, headers: Record<string, string> = {}) {
  const ctx = mockReqRes(method, url, { authorization: 'Bearer sk_calliq_testkey', ...headers });
  await requireTenant(ctx.req, ctx.res, ctx.next);
  return ctx;
}

describe('requireTenant — tenant API key credential, default deny', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('allowed with the right scope', () => {
    it('1. workforce.read can GET workforce, agents and health', async () => {
      withKey(['workforce.read']);
      for (const path of ['workforce', 'agents', 'health']) {
        const { next } = await call('GET', `/api/v1/integrations/klaros/${path}`);
        expect(next).toHaveBeenCalledOnce();
      }
    });

    it('3. workforce.write can PUT workforce', async () => {
      withKey(['workforce.write']);
      const { next } = await call('PUT', '/api/v1/integrations/klaros/workforce');
      expect(next).toHaveBeenCalledOnce();
    });

    it('4. leads.write can POST and PUT leads', async () => {
      withKey(['leads.write']);
      expect((await call('POST', '/api/v1/leads')).next).toHaveBeenCalledOnce();
      expect((await call('PUT', `/api/v1/leads/${UUID}`)).next).toHaveBeenCalledOnce();
    });

    it('5. calls.write can POST outbound calls', async () => {
      withKey(['calls.write']);
      expect((await call('POST', '/api/v1/calls/outbound')).next).toHaveBeenCalledOnce();
    });

    it('attaches tenant context from the key row, with its scopes', async () => {
      withKey(['leads.write', 'leads.read'], 'tenant-from-db');
      const { req } = await call('GET', '/api/v1/leads?limit=5');
      const ctx = getTenantContext(req);
      expect(ctx).toMatchObject({ id: 'tenant-from-db', source: 'tenant_api_key' });
      expect(ctx?.scopes).toEqual(['leads.write', 'leads.read']);
      expect(req.headers['x-tenant-id']).toBe('tenant-from-db');
    });
  });

  describe('missing scope -> 403', () => {
    it('2. workforce.read cannot PUT workforce', async () => {
      withKey(['workforce.read']);
      const { res, next } = await call('PUT', '/api/v1/integrations/klaros/workforce');
      expect(res.statusCode).toBe(403);
      expect(res.body.error).toBe('Missing required scope: workforce.write');
      expect(next).not.toHaveBeenCalled();
    });

    it.each([
      ['6. GET /leads', 'GET', '/api/v1/leads', 'leads.read'],
      ['7. GET /calls', 'GET', '/api/v1/calls', 'calls.read'],
      ['8. GET /appointments', 'GET', '/api/v1/appointments', 'appointments.read'],
    ])('%s is denied to a read-only key and allowed once the explicit scope is granted', async (_n, method, url, scope) => {
      withKey(['read']);
      const denied = await call(method, url);
      expect(denied.res.statusCode).toBe(403);
      expect(denied.res.body.error).toBe(`Missing required scope: ${scope}`);
      expect(denied.next).not.toHaveBeenCalled();

      withKey([scope]);
      expect((await call(method, url)).next).toHaveBeenCalledOnce();
    });

    it('a write scope does not imply the read scope', async () => {
      withKey(['leads.write']);
      expect((await call('GET', '/api/v1/leads')).res.statusCode).toBe(403);
    });
  });

  describe('unclassified routes are denied even for a key holding every known scope', () => {
    const everyScope = [
      'read',
      'write',
      'workforce.read',
      'workforce.write',
      'leads.read',
      'leads.write',
      'calls.read',
      'calls.write',
      'appointments.read',
      'webhooks.manage',
    ];

    it.each([
      ['9. /dashboard', 'GET', '/api/v1/dashboard/stats'],
      ['10. /team', 'GET', '/api/v1/team'],
      ['11. /webhooks/:id/test', 'POST', `/api/v1/webhooks/${UUID}/test`],
      ['12. an unlisted route', 'GET', '/api/v1/some-future-route'],
      ['/api-keys (a key must never mint keys)', 'POST', '/api/v1/api-keys'],
      ['/billing', 'GET', '/api/v1/billing/status'],
      ['/knowledge', 'GET', '/api/v1/knowledge'],
      ['/recordings', 'GET', '/api/v1/recordings'],
      ['/integrations (non-klaros)', 'GET', '/api/v1/integrations'],
      ['/leads/stats (not a UUID)', 'GET', '/api/v1/leads/stats'],
      ['DELETE /leads/:id', 'DELETE', `/api/v1/leads/${UUID}`],
      ['POST /appointments', 'POST', '/api/v1/appointments'],
      ['PATCH /leads/:id/status', 'PATCH', `/api/v1/leads/${UUID}/status`],
      ['HEAD on a GET route', 'HEAD', '/api/v1/leads'],
    ])('%s', async (_name, method, url) => {
      withKey(everyScope);
      const { res, next } = await call(method, url);
      expect(res.statusCode).toBe(403);
      expect(res.body.error).toBe('API key is not permitted to access this route');
      expect(next).not.toHaveBeenCalled();
    });

    it('is not bypassed by path casing, trailing slash or the /api alias', async () => {
      withKey(['read']);
      for (const url of ['/API/V1/Dashboard', '/api/v1/dashboard/', '/api/dashboard', '/api/v1/DASHBOARD/stats?x=1']) {
        const { res, next } = await call('GET', url);
        expect(res.statusCode, url).toBe(403);
        expect(next).not.toHaveBeenCalled();
      }
    });

    it('webhooks.manage is the only scope that opens webhook registration', async () => {
      withKey(['workforce.write', 'leads.write', 'calls.write']);
      expect((await call('POST', '/api/v1/webhooks')).res.statusCode).toBe(403);
      withKey(['webhooks.manage']);
      expect((await call('POST', '/api/v1/webhooks')).next).toHaveBeenCalledOnce();
    });
  });

  describe('tenant identity and credential validity', () => {
    it('invalid or revoked key -> 401', async () => {
      (tenantApiKeyService.validateKey as any).mockResolvedValue(null);
      const { res, next } = await call('GET', '/api/v1/leads');
      expect(res.statusCode).toBe(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('14. a client x-tenant-id that differs from the key tenant -> 403', async () => {
      withKey(['leads.read'], 'tenant-a');
      const { res, next } = await call('GET', '/api/v1/leads', { 'x-tenant-id': 'tenant-b' });
      expect(res.statusCode).toBe(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('a matching x-tenant-id is accepted', async () => {
      withKey(['leads.read'], 'tenant-a');
      expect((await call('GET', '/api/v1/leads', { 'x-tenant-id': 'tenant-a' })).next).toHaveBeenCalledOnce();
    });

    it("tenant B's key resolves only to tenant B, never tenant A", async () => {
      withKey(['leads.read'], 'tenant-b');
      const { req } = await call('GET', '/api/v1/leads');
      expect(getTenantContext(req)?.id).toBe('tenant-b');
    });

    it('a forged x-internal-scopes header cannot grant anything', async () => {
      withKey(['read']);
      const { res, next } = await call('PUT', '/api/v1/integrations/klaros/workforce', {
        'x-internal-scopes': 'workforce.write,leads.write,calls.write',
      });
      expect(res.statusCode).toBe(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('a forged x-dashboard-role header cannot grant anything', async () => {
      withKey(['read']);
      const { res } = await call('POST', '/api/v1/leads', { 'x-dashboard-role': 'owner' });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('13. dashboard JWT authorization is unchanged', () => {
    it('a user JWT reaches routes the API-key policy does not list, with no scope check', async () => {
      (verifyUserBearerToken as any).mockResolvedValue({ tenantId: 'tenant-a', userId: 'user-1' });
      const ctx = mockReqRes('GET', '/api/v1/dashboard/stats', { authorization: 'Bearer eyJhbGciOi.jwt.token' });
      await requireTenant(ctx.req, ctx.res, ctx.next);

      expect(ctx.next).toHaveBeenCalledOnce();
      expect(getTenantContext(ctx.req)).toMatchObject({ id: 'tenant-a', source: 'user_jwt', userId: 'user-1' });
      expect(tenantApiKeyService.validateKey).not.toHaveBeenCalled();
    });

    it('a user JWT with a mismatching x-tenant-id is still rejected', async () => {
      (verifyUserBearerToken as any).mockResolvedValue({ tenantId: 'tenant-a', userId: 'user-1' });
      const ctx = mockReqRes('GET', '/api/v1/leads', {
        authorization: 'Bearer eyJhbGciOi.jwt.token',
        'x-tenant-id': 'tenant-b',
      });
      await requireTenant(ctx.req, ctx.res, ctx.next);
      expect(ctx.res.statusCode).toBe(403);
    });

    it('an invalid JWT is still rejected with the verifier status', async () => {
      (verifyUserBearerToken as any).mockResolvedValue({ error: 'Invalid token', status: 401 });
      const ctx = mockReqRes('GET', '/api/v1/leads', { authorization: 'Bearer not-a-jwt' });
      await requireTenant(ctx.req, ctx.res, ctx.next);
      expect(ctx.res.statusCode).toBe(401);
    });
  });
});
