/**
 * GET /dashboard/bootstrap must work against a leads table whose number column is `phone` (what the live database has).
 * The fake database fails like Postgres does ("column phone_number does not exist") if the leads query names a column that is not there,
 * which is exactly how the endpoint used to return 400 on every dashboard load.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import express from 'express';
import http from 'http';
import type { AddressInfo } from 'net';

const TENANT = '11111111-1111-4111-8111-111111111111';
const LEAD_COLUMNS = ['id', 'tenant_id', 'phone', 'name', 'source', 'status', 'score', 'notes', 'created_at', 'email'];

vi.mock('../../../apps/gateway/src/services/voice/tenant-scope.js', () => ({
  voiceDb: {
    query: vi.fn(async (sql: string) => {
      if (/from public\.leads/i.test(sql) && /select id, name, phone_number/i.test(sql)) {
        throw new Error('error: column "phone_number" does not exist');
      }
      if (/from public\.calls/i.test(sql) && /count\(\*\)::int as total/i.test(sql)) {
        return { rows: [{ total: 0, successful: 0, failed: 0, avg_response_latency: 0, avg_call_duration: 0 }] };
      }
      if (/count\(\*\)::int as total from public\.leads/i.test(sql)) return { rows: [{ total: 1 }] };
      if (/from public\.leads/i.test(sql) && /group by/i.test(sql)) return { rows: [] }; // the 7-day chart query
      if (/from public\.leads/i.test(sql)) {
        // The preview query: the columns requested must all exist in the fake table.
        const cols = sql.match(/select\s+([\s\S]*?)\s+from public\.leads/i)?.[1].split(',').map((c) => c.trim()) ?? [];
        const missing = cols.filter((c) => !LEAD_COLUMNS.includes(c));
        if (missing.length) throw new Error(`error: column "${missing[0]}" does not exist`);
        return { rows: [{ id: 'l1', tenant_id: TENANT, phone: '+15550001234', name: 'Test Lead', source: 'dashboard', status: 'new', score: 20, created_at: '2026-11-10', email: null }] };
      }
      if (/from public\.voice_tenants/i.test(sql)) return { rows: [{ id: TENANT, company_name: 'Call IQ', phone_number: '+16467981317' }] };
      return { rows: [] };
    }),
  },
}));
vi.mock('../../../apps/gateway/src/services/leads/leads-schema.js', () => ({ getLeadSelectList: vi.fn(async () => LEAD_COLUMNS.join(', ')) }));
vi.mock('../../../apps/gateway/src/services/logger.js', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../../../apps/gateway/src/services/voice/security.js', () => ({ requireVoiceApiAccess: (_q: any, _s: any, next: any) => next() }));
vi.mock('../../../apps/gateway/src/services/voice/redis.client.js', () => ({ voiceRedis: {} }));
vi.mock('../../../apps/gateway/src/services/redis-connection.js', () => ({ createRedisClient: () => ({ on: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn() }) }));
vi.mock('../../../apps/gateway/src/services/redis-scan.js', () => ({ scanKeys: vi.fn(async () => ({ keys: [] })) }));
vi.mock('../../../apps/gateway/src/services/auth/tenant-context.js', () => ({ getTenantId: () => TENANT }));
vi.mock('../../../apps/gateway/src/security/sse-token.js', () => ({ verifySseDashboardToken: () => null, sseTokenTtlSeconds: () => 60, issueSseDashboardToken: () => 'tok' }));

let server: http.Server;
let base = '';
beforeAll(async () => {
  const { createDashboardRouter } = await import('../../../apps/gateway/src/services/dashboard/dashboard.controller.js');
  const app = express();
  app.use('/api/v1/dashboard', createDashboardRouter());
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/dashboard`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('GET /dashboard/bootstrap', () => {
  it('answers 200 with the leads preview even though the leads table has `phone`, not `phone_number`', async () => {
    const res = await fetch(`${base}/bootstrap`);
    const body = (await res.json()) as any;
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.leadsPreview).toHaveLength(1);
    expect(body.data.metrics.leads).toBe(1);
  });

  it('keeps the phone_number name the dashboard cache expects', async () => {
    const res = await fetch(`${base}/bootstrap`);
    const body = (await res.json()) as any;
    expect(body.data.leadsPreview[0].phone_number).toBe('+15550001234');
    expect(body.data.tenant.companyName).toBe('Call IQ');
  });
});
