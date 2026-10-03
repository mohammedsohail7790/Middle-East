/**
 * Complete route audit for tenant API keys (default-deny).
 *
 * Enumerates EVERY route registered on the real /api/v1 router and evaluates the API-key policy
 * for a key that holds EVERY scope the policy knows. The set of reachable routes must be exactly
 * the intended allowlist — so a newly added route is denied until it is classified, and a policy
 * entry that matches no real route (dead entry) is caught.
 *
 * Set DUMP_ROUTE_MATRIX=<file> to write the full matrix as JSON.
 */
import { describe, it, expect, vi } from 'vitest';
import { writeFileSync } from 'fs';

// Inert placeholders: some modules build a Supabase client at import time. Nothing connects.
for (const name of ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL']) process.env[name] ||= 'http://127.0.0.1:54321';
for (const name of ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY', 'SUPABASE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']) process.env[name] ||= 'test-placeholder-key';

vi.mock('../../apps/gateway/src/services/voice/redis.client.js', () => {
  const stub: any = new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === 'duplicate') return () => stub;
        if (prop === 'then') return undefined;
        return vi.fn(async () => null);
      },
    }
  );
  return { voiceRedis: stub };
});

vi.mock('bullmq', () => {
  class Stub {
    constructor(..._a: unknown[]) {}
    on() { return this; }
    add = vi.fn(async () => ({}));
    close = vi.fn(async () => undefined);
    getJobCounts = vi.fn(async () => ({}));
    waitUntilReady = vi.fn(async () => undefined);
  }
  return { Queue: Stub, Worker: Stub, QueueEvents: Stub, QueueScheduler: Stub, FlowProducer: Stub };
});

const { createApiRouter } = await import('../../apps/gateway/src/routes/register-api-routes.js');
const { API_KEY_ROUTE_POLICY, evaluateApiKeyPolicy } = await import('../../apps/gateway/src/security/api-key-scope-policy.js');

const UUID = '123e4567-e89b-42d3-a456-426614174000';

interface Route {
  method: string;
  path: string;
}

function mountPath(layer: any): string {
  if (layer.regexp?.fast_slash) return '';
  const source: string = layer.regexp?.source ?? '';
  return source
    .replace(/^\^/, '')
    .replace(/\\\/\?\(\?=\\\/\|\$\)$/, '')
    .replace(/\\\//g, '/');
}

function listRoutes(router: any, prefix: string, out: Route[], unparsed: string[]): void {
  for (const layer of router.stack ?? []) {
    if (layer.route) {
      const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
      for (const p of paths) {
        if (typeof p !== 'string') {
          unparsed.push(`${prefix} <non-string route path>`);
          continue;
        }
        for (const method of Object.keys(layer.route.methods)) {
          if (layer.route.methods[method]) out.push({ method: method.toUpperCase(), path: `${prefix}${p === '/' ? '' : p}` || '/' });
        }
      }
    } else if (layer.handle?.stack) {
      listRoutes(layer.handle, prefix + mountPath(layer), out, unparsed);
    }
  }
}

const router = createApiRouter();
const routes: Route[] = [];
const unparsed: string[] = [];
listRoutes(router, '/api/v1', routes, unparsed);
const concrete = (r: Route) => ({ ...r, concretePath: r.path.replace(/:[A-Za-z0-9_]+/g, UUID) });
const allRoutes = routes.map(concrete);

const ALL_SCOPES = [...new Set(API_KEY_ROUTE_POLICY.map((p) => p.scope))];

/** The complete, intended set of routes a tenant API key may reach — everything else must be denied. */
const EXPECTED_ALLOWED = [
  'GET /api/v1/integrations/klaros/workforce',
  'PUT /api/v1/integrations/klaros/workforce',
  'GET /api/v1/integrations/klaros/agents',
  'GET /api/v1/integrations/klaros/health',
  'POST /api/v1/leads',
  'PUT /api/v1/leads/:leadId',
  'GET /api/v1/leads',
  'GET /api/v1/leads/:leadId',
  'POST /api/v1/calls/outbound',
  'GET /api/v1/calls',
  'GET /api/v1/calls/:id',
  'GET /api/v1/appointments',
  'GET /api/v1/appointments/:id',
  'GET /api/v1/webhooks',
  'POST /api/v1/webhooks',
  'PUT /api/v1/webhooks/:id',
  'DELETE /api/v1/webhooks/:id',
  'GET /api/v1/webhooks/:id/deliveries',
].sort();

describe('tenant API key route matrix (default deny) — audited against the real router', () => {
  it('discovers the real route table', () => {
    expect(unparsed).toEqual([]);
    expect(allRoutes.length).toBeGreaterThan(150);
    expect(allRoutes.some((r) => r.method === 'POST' && r.path === '/api/v1/leads')).toBe(true);
    expect(allRoutes.some((r) => r.method === 'GET' && r.path === '/api/v1/integrations/klaros/workforce')).toBe(true);
  });

  it('a key holding EVERY scope can reach exactly the intended allowlist and nothing else', () => {
    const reachable = allRoutes
      .filter((r) => evaluateApiKeyPolicy(r.method, r.concretePath, ALL_SCOPES).allowed)
      .map((r) => `${r.method} ${r.path}`)
      .sort();
    expect(reachable).toEqual(EXPECTED_ALLOWED);
  });

  it('every reachable route requires a scope, and a key with no matching scope is denied with the scope named', () => {
    for (const r of allRoutes) {
      const withAll = evaluateApiKeyPolicy(r.method, r.concretePath, ALL_SCOPES);
      if (!withAll.allowed) {
        expect(withAll.reason).toBe('unclassified_route');
        continue;
      }
      const withNone = evaluateApiKeyPolicy(r.method, r.concretePath, ['read']);
      expect(withNone.allowed).toBe(false);
      expect(withNone.reason).toBe('missing_scope');
      expect(typeof withNone.scope).toBe('string');
    }
  });

  it('every other route (dashboard, team, billing, api-keys, knowledge, ...) is denied even with every scope', () => {
    const forbiddenPrefixes = ['/api/v1/dashboard', '/api/v1/team', '/api/v1/billing', '/api/v1/api-keys', '/api/v1/knowledge', '/api/v1/recordings', '/api/v1/sso', '/api/v1/msp', '/api/v1/ip-allowlist', '/api/v1/audit-logs'];
    const checked = allRoutes.filter((r) => forbiddenPrefixes.some((p) => r.path.startsWith(p)));
    expect(checked.length).toBeGreaterThan(20);
    for (const r of checked) {
      expect(evaluateApiKeyPolicy(r.method, r.concretePath, ALL_SCOPES).allowed, `${r.method} ${r.path}`).toBe(false);
    }
  });

  it('no dead policy entries: every policy entry matches at least one real route', () => {
    for (const entry of API_KEY_ROUTE_POLICY) {
      const hit = allRoutes.find(
        (r) => r.method === entry.method && entry.pattern.test(r.concretePath.replace(/^\/api\/v1/, ''))
      );
      expect(hit, `${entry.method} ${entry.pattern}`).toBeTruthy();
    }
  });

  it('the policy never maps one route to more than one scope', () => {
    const seen = new Map<string, string>();
    for (const r of allRoutes) {
      const d = evaluateApiKeyPolicy(r.method, r.concretePath, ALL_SCOPES);
      if (d.allowed) {
        const key = `${r.method} ${r.path}`;
        expect(seen.has(key)).toBe(false);
        seen.set(key, d.scope!);
      }
    }
  });

  it('writes the matrix when DUMP_ROUTE_MATRIX is set (used for the report)', () => {
    const target = process.env.DUMP_ROUTE_MATRIX;
    if (!target) return;
    const matrix = allRoutes
      .map((r) => {
        const d = evaluateApiKeyPolicy(r.method, r.concretePath, ALL_SCOPES);
        return { method: r.method, route: r.path, apiKeyAllowed: d.allowed, requiredScope: d.scope ?? null };
      })
      .sort((a, b) => a.route.localeCompare(b.route) || a.method.localeCompare(b.method));
    writeFileSync(target, JSON.stringify(matrix, null, 2));
  });
});
