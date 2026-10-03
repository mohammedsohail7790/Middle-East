/**
 * REAL PostgreSQL integration test for the Klaros contract.
 *
 * Runs only when HALLA_TEST_DATABASE_URL points at a disposable Postgres that
 * already has supabase/schema.sql + migrations 001..070 applied. Nothing is
 * mocked at the database layer: the actual services (api-key, webhooks, leads,
 * ai-config, ivr, outbound, voice storeCall, correlation) run against it.
 *
 * Still substituted: Twilio (no real call is placed), DNS and the TLS transport
 * for webhook delivery (no network), and the JWT/internal-auth modules.
 *
 * Redis note: the services' fire-and-forget event publishing uses REDIS_URL.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';

const DATABASE_URL = process.env.HALLA_TEST_DATABASE_URL;

if (DATABASE_URL) {
  process.env.GATEWAY_DATABASE_URL = DATABASE_URL;
  process.env.PGSSLMODE = 'disable';
}

vi.mock('twilio', () => ({
  default: () => ({ calls: { create: vi.fn(async () => ({ sid: `CA_PG_${Date.now()}` })) } }),
}));
vi.mock('../../apps/gateway/src/services/voice/redis.client.js', () => ({
  voiceRedis: {
    get: vi.fn(async () => null),
    set: vi.fn(async () => 'OK'),
    setex: vi.fn(async () => 'OK'),
    del: vi.fn(async () => 1),
    expire: vi.fn(async () => 1),
    hset: vi.fn(async () => 1),
    ping: vi.fn(async () => 'PONG'),
    publish: vi.fn(async () => 1),
  },
}));
vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]),
}));
const transportCalls: Array<{ url: string; body: string; headers: Record<string, string> }> = [];
vi.mock('../../apps/gateway/src/security/safe-http.js', () => ({
  safePostJson: vi.fn(async (url: URL, _addresses: string[], opts: any) => {
    transportCalls.push({ url: url.toString(), body: opts.body, headers: opts.headers });
    return { status: 200, body: 'ok' };
  }),
}));
vi.mock('../../apps/gateway/src/services/auth/jwt-tenant-verifier.js', () => ({ verifyUserBearerToken: vi.fn() }));
vi.mock('../../apps/gateway/src/services/auth/internal-service-auth.js', () => ({ verifyInternalServiceRequest: vi.fn() }));
vi.mock('../../apps/gateway/src/security/sse-token.js', () => ({ verifySseDashboardToken: vi.fn(() => null) }));

const mods = DATABASE_URL
  ? {
      pool: (await import('../../apps/gateway/src/services/db/pool.js')).pool,
      keys: (await import('../../apps/gateway/src/services/api-keys/apiKey.service.js')).tenantApiKeyService,
      webhooks: (await import('../../apps/gateway/src/services/webhooks/webhooks.service.js')).customWebhooksService,
      leads: (await import('../../apps/gateway/src/services/leads/leads.service.js')).leadsService,
      aiConfig: (await import('../../apps/gateway/src/services/ai-config/ai-config.service.js')).aiConfigService,
      ivr: (await import('../../apps/gateway/src/services/ivr/ivr.service.js')).ivrService,
      outbound: await import('../../apps/gateway/src/services/voice/outbound.service.js'),
      voice: await import('../../apps/gateway/src/services/voice/voice.controller.js'),
      correlation: await import('../../apps/gateway/src/services/klaros/correlation.js'),
      klaros: await import('../../apps/gateway/src/services/klaros/klaros.controller.js'),
      requireTenant: (await import('../../apps/gateway/src/middleware/require-tenant.js')).requireTenant,
      ctx: await import('../../apps/gateway/src/services/auth/tenant-context.js'),
    }
  : (null as any);

const run = Boolean(DATABASE_URL);

describe.skipIf(!run)('Klaros contract against REAL PostgreSQL', () => {
  const { pool } = mods ?? {};
  const q = (sql: string, params: any[] = []) => pool.query(sql, params);
  let tenantA: string;
  let tenantB: string;

  async function seedTenant(label: string): Promise<string> {
    const user = await q(`INSERT INTO auth.users (email) VALUES ($1) RETURNING id`, [`${label}-${randomUUID()}@test.local`]);
    const tenant = await q(
      `INSERT INTO public.voice_tenants (owner_user_id, company_name, phone_number) VALUES ($1, $2, $3) RETURNING id`,
      [user.rows[0].id, `Klaros PG test ${label}`, `+1555${Math.floor(Math.random() * 1e7)}`]
    );
    return tenant.rows[0].id;
  }

  beforeAll(async () => {
    tenantA = await seedTenant('a');
    tenantB = await seedTenant('b');
  });

  afterAll(async () => {
    await q(`DELETE FROM public.voice_tenants WHERE id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
    await pool.end();
  });

  it('runs against a supported PostgreSQL version', async () => {
    const v = await q('SHOW server_version');
    expect(Number(String(v.rows[0].server_version).split('.')[0])).toBeGreaterThanOrEqual(13);
  });

  describe('migration 070 schema', () => {
    it('adds the Klaros columns, the qualification check constraint and the unique delivery index', async () => {
      const cols = await q(
        `SELECT table_name, column_name, data_type FROM information_schema.columns
         WHERE table_schema='public' AND (
           (table_name='leads' AND column_name='klaros_lead_id') OR
           (table_name='calls' AND column_name IN ('klaros_lead_id','qualification_status','qualification_fields','qualification_missing','qualification_reason','qualification_confidence')) OR
           (table_name='webhook_deliveries' AND column_name='event_id'))`
      );
      expect(cols.rows.map((r: any) => `${r.table_name}.${r.column_name}`).sort()).toEqual([
        'calls.klaros_lead_id',
        'calls.qualification_confidence',
        'calls.qualification_fields',
        'calls.qualification_missing',
        'calls.qualification_reason',
        'calls.qualification_status',
        'leads.klaros_lead_id',
        'webhook_deliveries.event_id',
      ]);

      const idx = await q(
        `SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname IN
         ('idx_leads_klaros_lead_id','idx_calls_klaros_lead_id','idx_webhook_deliveries_webhook_event')`
      );
      expect(idx.rows).toHaveLength(3);

      const scopesType = await q(
        `SELECT data_type FROM information_schema.columns WHERE table_name='tenant_api_keys' AND column_name='scopes'`
      );
      const eventsType = await q(
        `SELECT data_type FROM information_schema.columns WHERE table_name='custom_webhooks' AND column_name='events'`
      );
      expect(scopesType.rows[0].data_type).toBe('ARRAY');
      expect(eventsType.rows[0].data_type).toBe('ARRAY');
    });

    it('is idempotent: re-running migration 070 changes nothing and errors on nothing', async () => {
      const fs = await import('fs');
      const sql = fs.readFileSync('supabase/migrations/070_klaros_integration.sql', 'utf8');
      await expect(q(sql)).resolves.toBeTruthy();
    });

    it('enforces the qualification status check constraint', async () => {
      const sid = `CA_CHECK_${randomUUID()}`;
      await q(`INSERT INTO public.calls (tenant_id, call_sid, transcript) VALUES ($1,$2,'')`, [tenantA, sid]);
      await expect(q(`UPDATE public.calls SET qualification_status='definitely' WHERE call_sid=$1`, [sid])).rejects.toThrow(/check constraint/);
      const def = await q(`SELECT qualification_status FROM public.calls WHERE call_sid=$1`, [sid]);
      expect(def.rows[0].qualification_status).toBe('unknown');
      for (const status of ['qualified', 'not_qualified', 'needs_human_review', 'unknown']) {
        await expect(q(`UPDATE public.calls SET qualification_status=$1 WHERE call_sid=$2`, [status, sid])).resolves.toBeTruthy();
      }
    });
  });

  describe('API-key provisioning (the JS-array binding fix)', () => {
    it('proves the OLD binding was invalid: a JSON.stringify string is not a text[] literal', async () => {
      await expect(
        q(`INSERT INTO public.tenant_api_keys (tenant_id,name,key_hash,key_prefix,scopes) VALUES ($1,'old','h-old','p',$2)`, [
          tenantA,
          JSON.stringify(['read']),
        ])
      ).rejects.toThrow(/malformed array literal/);
    });

    it('createKey persists scopes as a real text[] (including awkward characters) and the key authenticates', async () => {
      const scopes = ['leads.write', 'workforce.read', 'a,b', 'x"y', '{brace}', 'with space'];
      const created = await mods.keys.createKey(tenantA, 'klaros', scopes);
      expect(created.key).toMatch(/^sk_calliq_[0-9a-f]{64}$/);

      const row = await q(
        `SELECT scopes, pg_typeof(scopes)::text AS t, array_length(scopes,1) AS n, key_hash FROM public.tenant_api_keys WHERE id=$1`,
        [created.id]
      );
      expect(row.rows[0].t).toBe('text[]');
      expect(row.rows[0].n).toBe(scopes.length);
      expect(row.rows[0].scopes).toEqual(scopes);
      expect(row.rows[0].key_hash).not.toBe(created.key); // only the hash is stored
      expect(JSON.stringify(row.rows[0])).not.toContain(created.key);

      expect(await mods.keys.validateKey(created.key)).toEqual({ tenantId: tenantA, scopes });
    });

    it('rejects revoked, expired and unknown keys; listing never exposes key material', async () => {
      const revoked = await mods.keys.createKey(tenantA, 'to-revoke', ['read']);
      await mods.keys.revokeKey(tenantA, revoked.id);
      expect(await mods.keys.validateKey(revoked.key)).toBeNull();

      const expired = await mods.keys.createKey(tenantA, 'to-expire', ['read'], new Date(Date.now() + 60_000));
      await q(`UPDATE public.tenant_api_keys SET expires_at = now() - interval '1 minute' WHERE id=$1`, [expired.id]);
      expect(await mods.keys.validateKey(expired.key)).toBeNull();
      expect(await mods.keys.validateKey('sk_calliq_' + '0'.repeat(64))).toBeNull();

      const listed = await mods.keys.listKeys(tenantA);
      expect(listed.length).toBeGreaterThan(0);
      for (const k of listed) {
        expect(k).not.toHaveProperty('key');
        expect(JSON.stringify(k)).not.toMatch(/sk_calliq_[0-9a-f]{64}/);
      }
    });

    it('tenant isolation: tenant B cannot list, revoke or delete tenant A keys', async () => {
      const a = await mods.keys.createKey(tenantA, 'iso', ['read']);
      expect((await mods.keys.listKeys(tenantB)).some((k: any) => k.id === a.id)).toBe(false);
      await mods.keys.revokeKey(tenantB, a.id);
      await mods.keys.deleteKey(tenantB, a.id);
      expect(await mods.keys.validateKey(a.key)).toEqual({ tenantId: tenantA, scopes: ['read'] });
    });

    it('end to end: a database-backed key passes requireTenant with DB scopes and the default-deny policy', async () => {
      const key = await mods.keys.createKey(tenantA, 'e2e', ['leads.read']);
      const call = async (method: string, url: string, extra: Record<string, string> = {}) => {
        const headers: Record<string, string> = { authorization: `Bearer ${key.key}`, ...extra };
        const req: any = { method, originalUrl: url, header: (n: string) => headers[n.toLowerCase()], headers: { ...headers } };
        const res: any = { statusCode: 200, body: undefined, status(c: number) { this.statusCode = c; return this; }, json(b: any) { this.body = b; return this; }, setHeader() {} };
        let nexted = false;
        await mods.requireTenant(req, res, () => { nexted = true; });
        return { req, res, nexted };
      };

      const ok = await call('GET', '/api/v1/leads');
      expect(ok.nexted).toBe(true);
      expect(mods.ctx.getTenantContext(ok.req)).toMatchObject({ id: tenantA, source: 'tenant_api_key' });

      expect((await call('POST', '/api/v1/leads')).res.statusCode).toBe(403);
      expect((await call('GET', '/api/v1/dashboard/stats')).res.statusCode).toBe(403);
      expect((await call('GET', '/api/v1/leads', { 'x-tenant-id': tenantB })).res.statusCode).toBe(403);
    });
  });

  describe('webhook provisioning and delivery', () => {
    const SAFE = 'https://klaros.pg-test.example.com/hook';

    it('create persists events as text[], a 64-hex secret, and the dispatch query matches on it', async () => {
      const created = await mods.webhooks.create(tenantA, { name: 'klaros', url: SAFE, events: ['call.completed', 'lead.created'] });
      expect(created.events).toEqual(['call.completed', 'lead.created']);
      expect(created.secret).toMatch(/^[0-9a-f]{64}$/);

      const row = await q(`SELECT events, pg_typeof(events)::text AS t, secret, active FROM public.custom_webhooks WHERE id=$1`, [created.id]);
      expect(row.rows[0].t).toBe('text[]');
      expect(row.rows[0].events).toEqual(['call.completed', 'lead.created']);
      expect(row.rows[0].secret).toBe(created.secret);

      const match = await q(
        `SELECT id FROM public.custom_webhooks WHERE tenant_id=$1 AND active=true AND events @> ARRAY[$2]::TEXT[]`,
        [tenantA, 'lead.created']
      );
      expect(match.rows.map((r: any) => r.id)).toContain(created.id);
      const none = await q(`SELECT id FROM public.custom_webhooks WHERE tenant_id=$1 AND events @> ARRAY[$2]::TEXT[]`, [tenantA, 'call.started']);
      expect(none.rows.map((r: any) => r.id)).not.toContain(created.id);
    });

    it('the signing secret is stored for signing but returned only by create(): list() and update() omit it', async () => {
      const created = await mods.webhooks.create(tenantA, { name: 'secret-once', url: SAFE, events: ['call.completed'] });
      expect(created.secret).toMatch(/^[0-9a-f]{64}$/);

      const stored = await q(`SELECT secret FROM public.custom_webhooks WHERE id=$1`, [created.id]);
      expect(stored.rows[0].secret).toBe(created.secret); // still persisted: HMAC signing needs it server-side

      const listed = (await mods.webhooks.list(tenantA)).find((w: any) => w.id === created.id);
      expect(listed).toBeTruthy();
      expect(listed).not.toHaveProperty('secret');
      expect(JSON.stringify(await mods.webhooks.list(tenantA))).not.toContain(created.secret);

      const updated = await mods.webhooks.update(tenantA, created.id, { name: 'renamed' });
      expect(updated).not.toHaveProperty('secret');
    });

    it('update persists a new events array; unsafe URLs and unknown events are rejected before any write', async () => {
      const created = await mods.webhooks.create(tenantA, { name: 'upd', url: SAFE, events: ['call.completed'] });
      const updated = await mods.webhooks.update(tenantA, created.id, { events: ['lead.updated', 'appointment.cancelled'] });
      expect(updated.events).toEqual(['lead.updated', 'appointment.cancelled']);

      const before = (await q(`SELECT count(*)::int AS n FROM public.custom_webhooks WHERE tenant_id=$1`, [tenantA])).rows[0].n;
      await expect(mods.webhooks.create(tenantA, { name: 'bad', url: 'https://127.0.0.1/x', events: ['call.completed'] })).rejects.toThrow();
      await expect(mods.webhooks.create(tenantA, { name: 'bad', url: 'http://klaros.pg-test.example.com/x', events: ['call.completed'] })).rejects.toThrow();
      await expect(mods.webhooks.create(tenantA, { name: 'bad', url: SAFE, events: ['nope'] })).rejects.toThrow();
      const after = (await q(`SELECT count(*)::int AS n FROM public.custom_webhooks WHERE tenant_id=$1`, [tenantA])).rows[0].n;
      expect(after).toBe(before);
    });

    it('dispatch writes real delivery rows, signs the body, is idempotent via the unique index, and stays tenant-scoped', async () => {
      transportCalls.length = 0;
      await q(`DELETE FROM public.custom_webhooks WHERE tenant_id = ANY($1::uuid[])`, [[tenantA, tenantB]]); // isolate from earlier tests
      const wa = await mods.webhooks.create(tenantA, { name: 'a', url: SAFE, events: ['call.completed'] });
      const wb = await mods.webhooks.create(tenantB, { name: 'b', url: SAFE, events: ['call.completed'] });
      const eventId = randomUUID();

      await mods.webhooks.dispatchKlarosEvent(tenantA, 'call.completed', eventId, { callId: 'CA1' });
      await mods.webhooks.dispatchKlarosEvent(tenantA, 'call.completed', eventId, { callId: 'CA1' });

      const sentToA = transportCalls.filter((c) => JSON.parse(c.body).id === eventId);
      expect(sentToA).toHaveLength(1);
      expect(JSON.parse(sentToA[0].body).tenant_id).toBe(tenantA);
      expect(sentToA[0].headers['X-HallaAI-Signature']).toMatch(/^sha256=[0-9a-f]{64}$/);

      const rows = await q(`SELECT webhook_id, delivered, response_status, event_id FROM public.webhook_deliveries WHERE event_id=$1`, [eventId]);
      expect(rows.rows).toEqual([{ webhook_id: wa.id, delivered: true, response_status: 200, event_id: eventId }]);
      expect(rows.rows.some((r: any) => r.webhook_id === wb.id)).toBe(false); // tenant B's hook not touched

      // the database itself refuses a second logical delivery for the pair
      await expect(
        q(`INSERT INTO public.webhook_deliveries (webhook_id, tenant_id, event_type, event_id, payload) VALUES ($1,$2,'call.completed',$3,'{}'::jsonb)`, [wa.id, tenantA, eventId])
      ).rejects.toThrow(/duplicate key|unique/);
      // while legacy rows without an event_id remain unconstrained
      await expect(
        q(`INSERT INTO public.webhook_deliveries (webhook_id, tenant_id, event_type, payload) VALUES ($1,$2,'x','{}'::jsonb), ($1,$2,'x','{}'::jsonb)`, [wa.id, tenantA])
      ).resolves.toBeTruthy();
    });

    it('records a failed delivery then flips it to delivered on retry (upsert), updating the webhook status columns', async () => {
      await q(`DELETE FROM public.custom_webhooks WHERE tenant_id = $1`, [tenantA]); // isolate from earlier tests
      const w = await mods.webhooks.create(tenantA, { name: 'retry', url: SAFE, events: ['lead.created'] });
      const eventId = randomUUID();
      const safeHttp: any = await import('../../apps/gateway/src/security/safe-http.js');
      (safeHttp.safePostJson as any).mockResolvedValueOnce({ status: 503, body: 'down' });

      await expect(mods.webhooks.dispatchKlarosEvent(tenantA, 'lead.created', eventId, { leadId: 'l1' })).rejects.toThrow(/503/);
      let d = await q(`SELECT delivered, response_status FROM public.webhook_deliveries WHERE webhook_id=$1 AND event_id=$2`, [w.id, eventId]);
      expect(d.rows).toEqual([{ delivered: false, response_status: 503 }]);
      let hook = await q(`SELECT failure_count, last_error FROM public.custom_webhooks WHERE id=$1`, [w.id]);
      expect(hook.rows[0].failure_count).toBe(1);

      await mods.webhooks.dispatchKlarosEvent(tenantA, 'lead.created', eventId, { leadId: 'l1' });
      d = await q(`SELECT delivered, response_status FROM public.webhook_deliveries WHERE webhook_id=$1 AND event_id=$2`, [w.id, eventId]);
      expect(d.rows).toEqual([{ delivered: true, response_status: 200 }]); // one row, upserted
      hook = await q(`SELECT failure_count, last_error FROM public.custom_webhooks WHERE id=$1`, [w.id]);
      expect(hook.rows[0]).toEqual({ failure_count: 0, last_error: null });
    });
  });

  describe('lead persistence', () => {
    it('creates a lead with klarosLeadId, returns it, preserves it through update, and isolates tenants', async () => {
      const klarosId = `kl-${randomUUID()}`;
      const phone = `+1555${Math.floor(Math.random() * 1e7)}`;
      const lead = await mods.leads.createLead(tenantA, phone, 'klaros_inbound', { name: 'Ada', klarosLeadId: klarosId });
      expect(lead.klarosLeadId).toBe(klarosId);

      const raw = await q(`SELECT klaros_lead_id FROM public.leads WHERE id=$1`, [lead.id]);
      expect(raw.rows[0].klaros_lead_id).toBe(klarosId);

      expect((await mods.leads.getLead(tenantA, lead.id)).klarosLeadId).toBe(klarosId);

      const updated = await mods.leads.updateLead(tenantA, lead.id, { notes: 'called back' });
      expect(updated.klarosLeadId).toBe(klarosId); // untouched by an update that omits it
      expect(updated.notes).toBe('called back');

      const reassigned = await mods.leads.updateLead(tenantA, lead.id, { klarosLeadId: `${klarosId}-v2` });
      expect(reassigned.klarosLeadId).toBe(`${klarosId}-v2`);

      await expect(mods.leads.getLead(tenantB, lead.id)).rejects.toThrow(/not found/i);
    });

    it('a lead created without klarosLeadId stays valid (backward compatible)', async () => {
      const lead = await mods.leads.createLead(tenantA, `+1555${Math.floor(Math.random() * 1e7)}`, 'klaros_inbound', { name: 'No ref' });
      expect(lead.klarosLeadId).toBeUndefined();
      expect((await mods.leads.getLead(tenantA, lead.id)).id).toBe(lead.id);
    });

    it('the phone-dedupe path updates the existing lead and applies the Klaros reference', async () => {
      const phone = `+1555${Math.floor(Math.random() * 1e7)}`;
      const first = await mods.leads.createLead(tenantA, phone, 'klaros_inbound', { name: 'First' });
      const again = await mods.leads.createLead(tenantA, phone, 'klaros_inbound', { name: 'Again', klarosLeadId: 'kl-dedupe' });
      expect(again.id).toBe(first.id);
      expect(again.klarosLeadId).toBe('kl-dedupe');
    });
  });

  describe('outbound call persistence and post-call SQL', () => {
    it('initiateOutboundCall inserts the call row with klaros_lead_id (Twilio stubbed)', async () => {
      const { callSid } = await mods.outbound.initiateOutboundCall({
        tenantId: tenantA, toNumber: '+15557654321', fromNumber: '+15551234567', reason: 'click_to_call', klarosLeadId: 'kl-out-1',
      });
      const row = await q(`SELECT direction, from_number, to_number, outbound_reason, klaros_lead_id, qualification_status FROM public.calls WHERE call_sid=$1`, [callSid]);
      expect(row.rows[0]).toEqual({
        direction: 'outbound', from_number: '+15551234567', to_number: '+15557654321',
        outbound_reason: 'click_to_call', klaros_lead_id: 'kl-out-1', qualification_status: 'unknown',
      });
    });

    it('an outbound call without klarosLeadId still inserts (backward compatible)', async () => {
      const { callSid } = await mods.outbound.initiateOutboundCall({ tenantId: tenantA, toNumber: '+15550000001', fromNumber: '+15551234567', reason: 'follow_up' });
      const row = await q(`SELECT klaros_lead_id FROM public.calls WHERE call_sid=$1`, [callSid]);
      expect(row.rows[0].klaros_lead_id).toBeNull();
    });

    // Needs calls.config_hash, which no repo SQL creates (pre-existing drift) — the scratch DB adds it.
    it('storeCall (the real post-call upsert) keeps klaros_lead_id when it updates the outbound row', async () => {
      const { callSid } = await mods.outbound.initiateOutboundCall({
        tenantId: tenantA, toNumber: '+15557770001', fromNumber: '+15551234567', reason: 'x', klarosLeadId: 'kl-keep',
      });
      await mods.voice.storeCall({ tenantId: tenantA, callSid, transcript: 'hello', latency: 0, durationMs: 4200, outcome: 'completed' });
      const row = await q(`SELECT klaros_lead_id, transcript, duration_ms, outcome FROM public.calls WHERE call_sid=$1`, [callSid]);
      expect(row.rows[0]).toEqual({ klaros_lead_id: 'kl-keep', transcript: 'hello', duration_ms: 4200, outcome: 'completed' });
    });

    it('post-call qualification SQL (copied from realtime.post-call.ts) persists and reads back; correlation resolves ids', async () => {
      const { callSid } = await mods.outbound.initiateOutboundCall({
        tenantId: tenantA, toNumber: '+15557770002', fromNumber: '+15551234567', reason: 'x', klarosLeadId: 'kl-corr',
      });
      const callRow = await q(`SELECT id FROM public.calls WHERE call_sid=$1`, [callSid]);
      const lead = await mods.leads.createLead(tenantA, `+1555${Math.floor(Math.random() * 1e7)}`, 'klaros_inbound', { name: 'Corr', callId: callRow.rows[0].id });

      await q(
        `UPDATE public.calls SET qualification_status=$1, qualification_fields=$2::jsonb, qualification_missing=$3::jsonb,
           qualification_reason=$4, qualification_confidence=$5 WHERE call_sid=$6 AND tenant_id=$7`,
        ['qualified', JSON.stringify({ name: 'Corr' }), JSON.stringify([]), 'Booked', 0.9, callSid, tenantA]
      );
      const final = await q(`SELECT klaros_lead_id, qualification_status, transfer_target FROM public.calls WHERE call_sid=$1 AND tenant_id=$2 LIMIT 1`, [callSid, tenantA]);
      expect(final.rows[0]).toEqual({ klaros_lead_id: 'kl-corr', qualification_status: 'qualified', transfer_target: null });

      expect(await mods.correlation.resolveCallCorrelation(tenantA, callSid)).toEqual({ leadId: lead.id, klarosLeadId: 'kl-corr' });
      expect(await mods.correlation.resolveCallCorrelation(tenantB, callSid)).toEqual({ leadId: undefined, klarosLeadId: undefined });
    });

    it('appointment correlation resolves via the phone only when exactly one lead matches', async () => {
      const phone = `+1555${Math.floor(Math.random() * 1e7)}`;
      const lead = await mods.leads.createLead(tenantA, phone, 'klaros_inbound', { name: 'Appt', klarosLeadId: 'kl-appt' });
      const appt = await q(
        `INSERT INTO public.appointments (tenant_id, name, phone, service, scheduled_time, status) VALUES ($1,'Appt',$2,'svc', now() + interval '1 day','booked') RETURNING id`,
        [tenantA, phone]
      );
      expect(await mods.correlation.resolveAppointmentCorrelation(tenantA, appt.rows[0].id)).toEqual({ leadId: lead.id, klarosLeadId: 'kl-appt' });
      expect(await mods.correlation.resolveAppointmentCorrelation(tenantB, appt.rows[0].id)).toEqual({});
    });
  });

  describe('workforce API against a seeded ai_agent_configs row', () => {
    it('GET reflects the seeded config, PUT changes real database state, agents come from ai_agents', async () => {
      await mods.aiConfig.upsertConfig(tenantA, {
        businessDescription: 'Seeded plumbing business', servicesOffered: ['drain cleaning'], serviceAreas: ['Dubai'],
        requiredFields: ['name', 'phone'], qualificationQuestions: ['What is the problem?'],
      });
      const before = mods.klaros.toKlarosWorkforceOutput(await mods.aiConfig.getConfig(tenantA));
      expect(before).toMatchObject({
        businessDescription: 'Seeded plumbing business', services: ['drain cleaning'], markets: ['Dubai'],
        requiredCustomerInformation: ['name', 'phone'], qualificationQuestions: ['What is the problem?'],
      });

      const put = mods.klaros.fromKlarosWorkforceInput({
        businessDescription: 'Updated by Klaros', services: ['boilers', 'leaks'], markets: ['Abu Dhabi'],
        requiredCustomerInformation: ['name', 'phone', 'service'], operatingInstructions: 'Be brief', tone: 'calm',
      });
      await mods.aiConfig.upsertConfig(tenantA, put);

      const raw = await q(
        `SELECT business_description, services_offered, service_areas, required_fields, system_instructions, tone FROM public.ai_agent_configs WHERE tenant_id=$1`,
        [tenantA]
      );
      expect(raw.rows[0]).toMatchObject({
        business_description: 'Updated by Klaros', services_offered: ['boilers', 'leaks'], service_areas: ['Abu Dhabi'],
        required_fields: ['name', 'phone', 'service'], system_instructions: 'Be brief', tone: 'calm',
      });
      // qualification questions were not in the PUT and must be preserved
      expect(mods.klaros.toKlarosWorkforceOutput(await mods.aiConfig.getConfig(tenantA)).qualificationQuestions).toEqual(['What is the problem?']);

      // tenant B never saw tenant A's configuration
      expect(mods.klaros.toKlarosWorkforceOutput(await mods.aiConfig.getConfig(tenantB)).businessDescription).not.toBe('Updated by Klaros');

      // Seeded with typed SQL: ivrService.createAgent cannot insert (see the it.fails test below).
      await q(`INSERT INTO public.ai_agents (tenant_id, name, role, system_prompt) VALUES ($1,'Receptionist','front desk','Answer calls')`, [tenantA]);
      const agents = await mods.ivr.listAgents(tenantA);
      expect(agents.map((a: any) => a.name)).toEqual(['Receptionist']);
      expect(agents[0]).toMatchObject({ tenantId: tenantA, role: 'front desk', services: [], active: true });
      expect(await mods.ivr.listAgents(tenantB)).toEqual([]);
    });

    // KNOWN PRE-EXISTING DEFECT, outside the Klaros work: ai_agents.services is TEXT[] (migrations 012/021)
    // but IVRService.createAgent/updateAgent bind JSON.stringify(services) — the same invalid-array-literal
    // bug fixed for api keys and webhooks. it.fails passes while the defect exists and turns red once fixed.
    it.fails('KNOWN DEFECT: ivrService.createAgent binds services as a JSON string and Postgres rejects it', async () => {
      await mods.ivr.createAgent(tenantA, { name: 'Broken', role: 'x', systemPrompt: 'y' });
    });

    it('the health check inputs are real: tenant row exists and config is readable', async () => {
      const t = await q(`SELECT id FROM public.voice_tenants WHERE id=$1 LIMIT 1`, [tenantA]);
      expect(t.rows).toHaveLength(1);
      await expect(mods.aiConfig.getConfig(tenantA)).resolves.toBeTruthy();
      const ghost = await q(`SELECT id FROM public.voice_tenants WHERE id=$1 LIMIT 1`, [randomUUID()]);
      expect(ghost.rows).toHaveLength(0);
    });
  });
});
