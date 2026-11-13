/**
 * Regression tests for a slow Redis connection leak: helpers that run on every request or every call used to build a new CacheManager each time, and every
 * CacheManager opens its own Redis connection that nothing closes. These count how many connections get opened, with Redis itself stubbed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ created: 0, store: new Map<string, string>() }));

vi.mock('../../../apps/gateway/src/services/redis-connection.js', () => ({
  createRedisClient: vi.fn(() => {
    h.created++;
    return {
      get: vi.fn(async (k: string) => h.store.get(k) ?? null),
      setex: vi.fn(async (k: string, _ttl: number, v: string) => { h.store.set(k, v); return 'OK'; }),
      set: vi.fn(async (k: string, v: string) => { h.store.set(k, v); return 'OK'; }),
      del: vi.fn(async () => 1),
      sadd: vi.fn(async () => 1),
      expire: vi.fn(async () => 1),
      pipeline: vi.fn(() => ({ exec: async () => [] })),
    };
  }),
}));
vi.mock('../../../apps/gateway/src/services/redis-scan.js', () => ({ scanKeys: vi.fn(async () => []), deleteByPattern: vi.fn(async () => ({ deleted: 0 })) }));
vi.mock('../../../apps/gateway/src/services/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { CacheHelpers, CacheManager } from '../../../apps/gateway/src/services/cache.js';
import { registerHealthRoutes } from '../../../apps/gateway/src/routes/register-health-routes.js';

beforeEach(() => {
  h.created = 0;
  h.store.clear();
});

describe('cacheDatabaseQuery (runs on every incoming call)', () => {
  it('opens one Redis connection no matter how many calls use it', async () => {
    const query = vi.fn(async () => ({ ok: true }));
    for (let i = 0; i < 40; i++) await CacheHelpers.cacheDatabaseQuery(`billing:active-sub:t${i}`, query, { ttl: 15 });
    expect(h.created).toBeLessThanOrEqual(1);
    expect(query).toHaveBeenCalledTimes(40);
  });

  it('still caches: a repeat within the window is answered without running the query again', async () => {
    const query = vi.fn(async () => ({ n: 1 }));
    await CacheHelpers.cacheDatabaseQuery('k', query, { ttl: 15 });
    await CacheHelpers.cacheDatabaseQuery('k', query, { ttl: 15 });
    expect(query).toHaveBeenCalledTimes(1);
  });
});

describe('/ready (an outside monitor calls it every few minutes)', () => {
  function readyHandler(shared: CacheManager) {
    const routes: Record<string, (req: unknown, res: unknown, next: (e?: unknown) => void) => unknown> = {};
    registerHealthRoutes({ get: (path: string, handler: never) => { routes[path] = handler; } } as never, shared);
    return routes['/ready'];
  }
  /** Runs the route and waits until it has actually answered (the route wrapper does not hand back its promise). */
  const call = (handler: ReturnType<typeof readyHandler>) =>
    new Promise<{ status: number; body: { checks?: Record<string, { ok: boolean }> } }>((resolve, reject) => {
      let status = 0;
      const res = {
        status: (s: number) => { status = s; return res; },
        json: (body: { checks?: Record<string, { ok: boolean }> }) => { resolve({ status, body }); return res; },
      };
      void handler({}, res, (e) => reject(e));
    });

  it('does not open a new Redis connection per request', async () => {
    vi.doMock('../../../apps/gateway/src/services/voice/tenant-scope.js', () => ({ voiceDb: { query: vi.fn(async () => ({ rows: [{ '?column?': 1 }] })) } }));
    const shared = new CacheManager();
    const openedByTheSharedOne = h.created;
    const handler = readyHandler(shared);
    let last: Awaited<ReturnType<typeof call>> = { status: 0, body: {} };
    for (let i = 0; i < 30; i++) last = await call(handler);
    // the handler really ran its Redis check (a silent early exit would make the count below meaningless)
    expect(last.body.checks?.redis?.ok).toBe(true);
    expect(h.created).toBe(openedByTheSharedOne);
  });
});
