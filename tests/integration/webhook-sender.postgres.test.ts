/**
 * Halla's outbound webhook SENDER on REAL PostgreSQL, checked against a faithful MODEL of Klaros's documented receiver.
 *
 * Real: PostgreSQL (webhooks, deliveries), the dispatch code, SSRF validation, signing, retry bookkeeping, logging.
 * Substituted: DNS (a fixed public address) and the TLS transport (safePostJson) — nothing leaves the machine.
 * MODEL (not Klaros): `receive()` re-implements the receiver pipeline Klaros documents in halla_webhook.py /
 * halla_webhooks.py (signature + freshness, tenant mapping, envelope validation, tenant match, de-duplication) so the
 * receiver-side rules can be exercised with the exact bytes Halla produces. Klaros itself was not touched or called.
 *
 * Ordering, DLQ, crash recovery and real-Redis retry are covered by klaros-ordered-delivery / klaros-e2e /
 * klaros-event-retry-dlq (real Redis); the ones that matter here are re-run in the full regression.
 *
 * Needs HALLA_TEST_DATABASE_URL.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import { createHmac } from 'crypto';

const DATABASE_URL = process.env.HALLA_TEST_DATABASE_URL;
const run = Boolean(DATABASE_URL);
if (DATABASE_URL) {
  process.env.GATEWAY_DATABASE_URL = DATABASE_URL;
  process.env.PGSSLMODE = 'disable';
}

vi.mock('../../apps/gateway/src/services/voice/redis.client.js', () => ({
  voiceRedis: { get: vi.fn(async () => null), set: vi.fn(async () => 'OK'), setex: vi.fn(async () => 'OK'), del: vi.fn(async () => 1), expire: vi.fn(async () => 1), publish: vi.fn(async () => 1) },
}));
vi.mock('node:dns/promises', () => ({ lookup: vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]) }));

type Sent = { url: string; body: string; headers: Record<string, string> };
const sent: Sent[] = [];
let respond: (call: Sent) => { status: number; body: string; headers?: Record<string, string> } = () => ({ status: 200, body: 'ok', headers: {} });
vi.mock('../../apps/gateway/src/security/safe-http.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../apps/gateway/src/security/safe-http.js')>();
  return {
    ...real,
    safePostJson: vi.fn(async (url: URL, _addresses: string[], opts: { headers: Record<string, string>; body: string }) => {
      const call = { url: url.toString(), body: opts.body, headers: opts.headers };
      sent.push(call);
      const r = respond(call);
      // the real transport allow-lists response headers before returning them (safe-http.ts); the stand-in must do the same
      return { status: r.status, body: r.body, headers: real.pickDiagnosticHeaders(r.headers) };
    }),
  };
});

const mods = run
  ? {
      pool: (await import('../../apps/gateway/src/services/db/pool.js')).pool,
      webhooks: (await import('../../apps/gateway/src/services/webhooks/webhooks.service.js')).customWebhooksService,
      logger: (await import('../../apps/gateway/src/services/logger.js')).logger,
      signing: await import('../../apps/gateway/src/security/webhook-signing.js'),
      http: await import('../../apps/gateway/src/security/safe-http.js'),
    }
  : (null as never);

// ---------------------------------------------------------------------------------------------------- receiver MODEL
const SUPPORTED = new Set(['call.started', 'call.completed', 'lead.created', 'lead.updated', 'lead.qualified', 'lead.escalated', 'appointment.confirmed', 'appointment.rescheduled', 'appointment.cancelled']);
interface Connection { secret: string | null; mappedHallaTenant: string }
type Reply = { status: number; reason: string };

function makeReceiver(connections: Map<string, Connection>) {
  const seen = new Set<string>();
  const receive = (kleTenantId: string, raw: string, h: { timestamp?: string; signature?: string }, nowSec = Math.floor(Date.now() / 1000)): Reply => {
    const conn = connections.get(kleTenantId);
    if (!conn || !conn.secret || !conn.mappedHallaTenant) return { status: 404, reason: 'not_found' }; // unknown tenant / no connection / no secret: indistinguishable on purpose
    if (Buffer.byteLength(raw) > 256 * 1024) return { status: 413, reason: 'body_too_large' };
    if (!h.signature?.trim()) return { status: 401, reason: 'signature_missing' };
    const v = mods.signing.verifyWebhookSignature({ secret: conn.secret, timestamp: h.timestamp ?? '', rawBody: raw, signatureHeader: h.signature, now: nowSec });
    if (!v.valid) return { status: 401, reason: v.reason };
    let doc: unknown;
    try { doc = JSON.parse(raw); } catch { return { status: 400, reason: 'body_not_json' }; }
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return { status: 400, reason: 'envelope_not_object' };
    const d = doc as Record<string, unknown>;
    if (typeof d.id !== 'string' || !d.id.trim() || d.id.length > 200) return { status: 400, reason: 'envelope_id_invalid' };
    if (typeof d.type !== 'string' || !d.type) return { status: 400, reason: 'envelope_type_invalid' };
    if (typeof d.tenant_id !== 'string' || !d.tenant_id.trim()) return { status: 400, reason: 'envelope_tenant_invalid' };
    if (d.data !== undefined && d.data !== null && (typeof d.data !== 'object' || Array.isArray(d.data))) return { status: 400, reason: 'envelope_data_invalid' };
    if (!SUPPORTED.has(d.type)) return { status: 400, reason: 'event_type_unsupported' };
    if (d.tenant_id !== conn.mappedHallaTenant) return { status: 403, reason: 'tenant_mismatch' };
    const key = `${kleTenantId}:${d.id}`;
    if (seen.has(key)) return { status: 200, reason: 'duplicate_ignored' };
    seen.add(key);
    return { status: 200, reason: 'ok' };
  };
  return receive;
}

const sign = (secret: string, ts: string, body: string) => `sha256=${createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex')}`;

describe.skipIf(!run)('Halla webhook sender (real PostgreSQL) against the receiver model', () => {
  const { pool } = mods ?? ({} as never);
  const q = (sql: string, params: unknown[] = []) => pool.query(sql, params);
  let tenantA: string;
  let tenantB: string;
  let hookA: { id: string; secret: string };
  let hookB: { id: string; secret: string };
  const logged: string[] = [];
  const spies: Array<{ mockRestore: () => void }> = [];

  const urlA = 'https://klaros-a.example.test/api/v1/webhooks/halla/4f5f6d5f-0ab0-4fbb-b8d7-2595277d0351';
  const urlB = 'https://klaros-b.example.test/api/v1/webhooks/halla/aaaaaaaa-0ab0-4fbb-b8d7-2595277d0351';
  const ALL_EVENTS = ['call.started', 'call.completed', 'lead.created', 'lead.updated', 'lead.qualified', 'lead.escalated', 'appointment.confirmed', 'appointment.rescheduled', 'appointment.cancelled'];

  async function seedTenant(label: string): Promise<string> {
    const user = await q(`INSERT INTO auth.users (email) VALUES ($1) RETURNING id`, [`${label}-${randomUUID()}@test.local`]);
    return (await q(`INSERT INTO public.voice_tenants (owner_user_id, company_name, phone_number) VALUES ($1,$2,$3) RETURNING id`, [user.rows[0].id, `Webhook sender ${label}`, `+1555${Math.floor(Math.random() * 1e7)}`])).rows[0].id;
  }

  beforeAll(async () => {
    tenantA = await seedTenant('a');
    tenantB = await seedTenant('b');
    const a = await mods.webhooks.create(tenantA, { name: 'Klaros A', url: urlA, events: ALL_EVENTS });
    const b = await mods.webhooks.create(tenantB, { name: 'Klaros B', url: urlB, events: ALL_EVENTS });
    hookA = { id: a.id, secret: a.secret! };
    hookB = { id: b.id, secret: b.secret! };
  });

  afterAll(async () => {
    spies.forEach((s) => s.mockRestore());
    await q(`DELETE FROM public.voice_tenants WHERE id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
    await pool.end();
  });

  beforeEach(() => {
    sent.length = 0;
    logged.length = 0;
    // the repo's vitest config restores spies between tests, so (re)install the log capture for every test
    spies.splice(0).forEach((s) => s.mockRestore());
    for (const level of ['info', 'warn', 'error', 'debug'] as const) {
      spies.push(vi.spyOn(mods.logger, level).mockImplementation(((...args: unknown[]) => { logged.push(JSON.stringify(args)); }) as never));
    }
    respond = () => ({ status: 200, body: 'ok', headers: {} });
  });

  const data = (type: string) => ({
    'lead.created': { leadId: 'L1', phone: '+971501234567', name: 'Jane Patient', klarosLeadId: 'K1' },
    'appointment.confirmed': { appointmentId: 'A1', scheduledTime: '2026-11-05T10:00:00Z', klarosLeadId: 'K1' },
  } as Record<string, Record<string, unknown>>)[type] ?? { callId: 'CA1', klarosLeadId: 'K1' };

  const receiverFor = () => makeReceiver(new Map([['klaros-tenant-a', { secret: hookA.secret, mappedHallaTenant: tenantA }]]));
  const asReceived = (call: Sent) => ({ raw: call.body, headers: { timestamp: call.headers['X-HallaAI-Timestamp'], signature: call.headers['X-HallaAI-Signature'] } });

  describe('every event Klaros relies on is delivered signed, in the agreed envelope, and accepted by the receiver', () => {
    it.each(ALL_EVENTS)('%s', async (type) => {
      const receive = receiverFor();
      const eventId = randomUUID();
      await mods.webhooks.dispatchKlarosSequence(tenantA, [{ type: type as never, eventId, data: data(type) }]);
      expect(sent).toHaveLength(1);
      expect(sent[0].url).toBe(urlA);
      const env = JSON.parse(sent[0].body);
      expect(env).toMatchObject({ id: eventId, type, tenant_id: tenantA });
      expect(Object.keys(env).sort()).toEqual(['data', 'id', 'tenant_id', 'timestamp', 'type']);
      const { raw, headers } = asReceived(sent[0]);
      expect(receive('klaros-tenant-a', raw, headers)).toEqual({ status: 200, reason: 'ok' });
      const row = await q(`SELECT delivered, response_status FROM public.webhook_deliveries WHERE webhook_id = $1 AND event_id = $2`, [hookA.id, eventId]);
      expect(row.rows[0]).toMatchObject({ delivered: true, response_status: 200 });
    });
  });

  describe('receiver rules, exercised with the exact bytes Halla produced', () => {
    const produce = async () => {
      await mods.webhooks.dispatchKlarosSequence(tenantA, [{ type: 'lead.created', eventId: randomUUID(), data: data('lead.created') }]);
      return sent[sent.length - 1];
    };

    it('valid signature -> accepted; invalid / tampered / wrong-secret / malformed / missing signature -> 401', async () => {
      const call = await produce();
      const { raw, headers } = asReceived(call);
      const receive = receiverFor();
      expect(receive('klaros-tenant-a', raw, headers).status).toBe(200);
      expect(receiverFor()('klaros-tenant-a', raw + ' ', headers)).toEqual({ status: 401, reason: 'signature_mismatch' }); // tampered body
      expect(receiverFor()('klaros-tenant-a', raw, { ...headers, signature: sign('a-different-secret', headers.timestamp!, raw) })).toEqual({ status: 401, reason: 'signature_mismatch' }); // wrong secret
      expect(receiverFor()('klaros-tenant-a', raw, { ...headers, signature: 'sha256=zzzz' })).toEqual({ status: 401, reason: 'malformed_signature' });
      expect(receiverFor()('klaros-tenant-a', raw, { ...headers, signature: '' })).toEqual({ status: 401, reason: 'signature_missing' });
    });

    it('stale or future timestamp -> 401 (replay window), but a fresh one -> accepted', async () => {
      const call = await produce();
      const { raw, headers } = asReceived(call);
      const now = Number(headers.timestamp);
      expect(receiverFor()('klaros-tenant-a', raw, headers, now).status).toBe(200);
      expect(receiverFor()('klaros-tenant-a', raw, headers, now + 301)).toEqual({ status: 401, reason: 'stale_timestamp' });
      expect(receiverFor()('klaros-tenant-a', raw, headers, now - 301)).toEqual({ status: 401, reason: 'stale_timestamp' });
      expect(receiverFor()('klaros-tenant-a', raw, { ...headers, timestamp: 'not-a-time' })).toMatchObject({ status: 401 });
    });

    it('unknown tenant, missing connection, missing secret -> 404 (indistinguishable)', async () => {
      const call = await produce();
      const { raw, headers } = asReceived(call);
      expect(receiverFor()('some-other-klaros-tenant', raw, headers)).toEqual({ status: 404, reason: 'not_found' });
      const noSecret = makeReceiver(new Map([['klaros-tenant-a', { secret: null, mappedHallaTenant: tenantA }]]));
      expect(noSecret('klaros-tenant-a', raw, headers)).toEqual({ status: 404, reason: 'not_found' });
      const noConn = makeReceiver(new Map());
      expect(noConn('klaros-tenant-a', raw, headers)).toEqual({ status: 404, reason: 'not_found' });
    });

    it("tenant mismatch: a delivery for Halla tenant A is refused by a Klaros tenant mapped to Halla tenant B (403)", async () => {
      const call = await produce();
      const { raw, headers } = asReceived(call);
      const mismatched = makeReceiver(new Map([['klaros-tenant-a', { secret: hookA.secret, mappedHallaTenant: tenantB }]]));
      expect(mismatched('klaros-tenant-a', raw, headers)).toEqual({ status: 403, reason: 'tenant_mismatch' });
    });

    it('malformed envelopes (correctly signed) are rejected with the specific reason', async () => {
      const ts = String(Math.floor(Date.now() / 1000));
      const recv = (obj: unknown) => {
        const raw = typeof obj === 'string' ? obj : JSON.stringify(obj);
        return receiverFor()('klaros-tenant-a', raw, { timestamp: ts, signature: sign(hookA.secret, ts, raw) });
      };
      expect(recv('not json at all')).toEqual({ status: 400, reason: 'body_not_json' });
      expect(recv([1, 2])).toEqual({ status: 400, reason: 'envelope_not_object' });
      expect(recv({ type: 'lead.created', tenant_id: tenantA, data: {} })).toEqual({ status: 400, reason: 'envelope_id_invalid' });
      expect(recv({ id: 'e', tenant_id: tenantA, data: {} })).toEqual({ status: 400, reason: 'envelope_type_invalid' });
      expect(recv({ id: 'e', type: 'lead.created', data: {} })).toEqual({ status: 400, reason: 'envelope_tenant_invalid' });
      expect(recv({ id: 'e', type: 'lead.created', tenant_id: tenantA, data: 'x' })).toEqual({ status: 400, reason: 'envelope_data_invalid' });
      expect(recv({ id: 'e', type: 'payment.captured', tenant_id: tenantA, data: {} })).toEqual({ status: 400, reason: 'event_type_unsupported' });
    });

    it('duplicate and replay: the same event delivered twice is accepted once; Halla itself never re-sends a delivered event', async () => {
      const eventId = randomUUID();
      const step = { type: 'lead.updated' as const, eventId, data: data('lead.updated') };
      await mods.webhooks.dispatchKlarosSequence(tenantA, [step]);
      await mods.webhooks.dispatchKlarosSequence(tenantA, [step]); // idempotent: delivered rows are skipped
      expect(sent.filter((s) => JSON.parse(s.body).id === eventId)).toHaveLength(1);
      const receive = receiverFor();
      const { raw, headers } = asReceived(sent[0]);
      expect(receive('klaros-tenant-a', raw, headers)).toEqual({ status: 200, reason: 'ok' });
      expect(receive('klaros-tenant-a', raw, headers)).toEqual({ status: 200, reason: 'duplicate_ignored' }); // a replayed request is ignored by the receiver
    });
  });

  describe('tenant isolation on the sender', () => {
    it("an event for tenant A is delivered ONLY to tenant A's webhook, with A's tenant id and A's signature", async () => {
      await mods.webhooks.dispatchKlarosSequence(tenantA, [{ type: 'lead.created', eventId: randomUUID(), data: data('lead.created') }]);
      expect(sent.map((s) => s.url)).toEqual([urlA]);
      expect(JSON.parse(sent[0].body).tenant_id).toBe(tenantA);
      expect(mods.signing.verifyWebhookSignature({ secret: hookB.secret, timestamp: sent[0].headers['X-HallaAI-Timestamp'], rawBody: sent[0].body, signatureHeader: sent[0].headers['X-HallaAI-Signature'] }).valid).toBe(false); // not B's secret
    });

    it('B receives only B events', async () => {
      await mods.webhooks.dispatchKlarosSequence(tenantB, [{ type: 'call.completed', eventId: randomUUID(), data: data('call.completed') }]);
      expect(sent.map((s) => s.url)).toEqual([urlB]);
      expect(JSON.parse(sent[0].body).tenant_id).toBe(tenantB);
    });

    it('an inactive webhook, an unsubscribed event type and a tenant with no webhook receive nothing', async () => {
      await q(`UPDATE public.custom_webhooks SET active = false WHERE id = $1`, [hookA.id]);
      await mods.webhooks.dispatchKlarosSequence(tenantA, [{ type: 'lead.created', eventId: randomUUID(), data: {} }]);
      await q(`UPDATE public.custom_webhooks SET active = true, events = ARRAY['lead.created'] WHERE id = $1`, [hookA.id]);
      await mods.webhooks.dispatchKlarosSequence(tenantA, [{ type: 'call.completed', eventId: randomUUID(), data: {} }]);
      await q(`UPDATE public.custom_webhooks SET events = $2::text[] WHERE id = $1`, [hookA.id, ALL_EVENTS]);
      const stranger = await seedTenant('stranger');
      await mods.webhooks.dispatchKlarosSequence(stranger, [{ type: 'lead.created', eventId: randomUUID(), data: {} }]);
      await q(`DELETE FROM public.voice_tenants WHERE id = $1`, [stranger]);
      expect(sent).toHaveLength(0);
    });
  });

  describe('fail closed', () => {
    it('a webhook row with NO signing secret is never sent unsigned: refused, recorded, and the bus is told to retry', async () => {
      await q(`UPDATE public.custom_webhooks SET secret = NULL WHERE id = $1`, [hookA.id]);
      const eventId = randomUUID();
      try {
        await expect(mods.webhooks.dispatchKlarosSequence(tenantA, [{ type: 'lead.created', eventId, data: data('lead.created') }])).rejects.toThrow(/no signing secret/);
        expect(sent).toHaveLength(0);
        const row = await q(`SELECT delivered, response_status, response_body FROM public.webhook_deliveries WHERE webhook_id = $1 AND event_id = $2`, [hookA.id, eventId]);
        expect(row.rows[0]).toMatchObject({ delivered: false, response_status: null });
        expect(String(row.rows[0].response_body)).toMatch(/refusing to send an unsigned delivery/);
      } finally {
        await q(`UPDATE public.custom_webhooks SET secret = $2 WHERE id = $1`, [hookA.id, hookA.secret]);
      }
    });

    it('the legacy dispatchEvent path no longer does a raw fetch: no network call, an internal destination is blocked, and it never sends unsigned', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      await q(`INSERT INTO public.custom_webhooks (tenant_id, name, url, events, secret) VALUES ($1,'internal','https://127.0.0.1/admin',ARRAY['test.ping'],NULL)`, [tenantA]);
      await q(`INSERT INTO public.custom_webhooks (tenant_id, name, url, events, secret) VALUES ($1,'safe-unsigned','https://klaros-a.example.test/x',ARRAY['test.ping'],NULL)`, [tenantA]);
      try {
        await mods.webhooks.dispatchEvent(tenantA, 'test.ping', { message: 'hello' });
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(sent).toHaveLength(0); // 127.0.0.1 is blocked by the SSRF guard; the other has no secret so it is refused
        const rows = await q(`SELECT delivered FROM public.webhook_deliveries WHERE tenant_id = $1 AND event_type = 'test.ping'`, [tenantA]);
        expect(rows.rows.length).toBe(2);
        expect(rows.rows.every((r: { delivered: boolean }) => r.delivered === false)).toBe(true);
      } finally {
        fetchSpy.mockRestore();
        await q(`DELETE FROM public.custom_webhooks WHERE tenant_id = $1 AND 'test.ping' = ANY(events)`, [tenantA]);
      }
    });
  });

  describe('retryable failure (the historical 429) and what is now recorded', () => {
    const SECRETS = () => [hookA.secret];
    const leadContent = ['Jane Patient', '+971501234567'];

    it('a 429 is a retryable failure: it throws (the bus retries), is recorded, and a later success delivers exactly once', async () => {
      const eventId = randomUUID();
      respond = () => ({ status: 429, body: 'Too Many Requests', headers: { 'retry-after': '30', server: 'cloudflare', 'cf-ray': 'r1', 'content-type': 'text/plain' } });
      await expect(mods.webhooks.dispatchKlarosSequence(tenantA, [{ type: 'lead.created', eventId, data: data('lead.created') }])).rejects.toThrow(/responded 429/);
      let row = await q(`SELECT delivered, response_status, response_body FROM public.webhook_deliveries WHERE webhook_id = $1 AND event_id = $2`, [hookA.id, eventId]);
      expect(row.rows[0]).toMatchObject({ delivered: false, response_status: 429, response_body: 'Too Many Requests' });
      respond = () => ({ status: 200, body: 'ok', headers: {} });
      await mods.webhooks.dispatchKlarosSequence(tenantA, [{ type: 'lead.created', eventId, data: data('lead.created') }]);
      row = await q(`SELECT delivered, response_status FROM public.webhook_deliveries WHERE webhook_id = $1 AND event_id = $2`, [hookA.id, eventId]);
      expect(row.rows[0]).toMatchObject({ delivered: true, response_status: 200 });
      expect(sent.filter((s) => JSON.parse(s.body).id === eventId)).toHaveLength(2); // the failed attempt and the successful one; same event id both times
      await mods.webhooks.dispatchKlarosSequence(tenantA, [{ type: 'lead.created', eventId, data: data('lead.created') }]);
      expect(sent.filter((s) => JSON.parse(s.body).id === eventId)).toHaveLength(2); // idempotent afterwards
    });

    it('the rejection log keeps safe metadata (status, content-type, retry-after, request id, server, via, user-agent) and a layer HINT', async () => {
      respond = () => ({ status: 429, body: 'Too Many Requests', headers: { 'retry-after': '30', server: 'cloudflare', 'cf-ray': 'r1', via: '1.1 proxy', 'content-type': 'text/plain', 'x-request-id': '', 'set-cookie': 'sid=SECRET' } });
      await expect(mods.webhooks.dispatchKlarosSequence(tenantA, [{ type: 'lead.updated', eventId: randomUUID(), data: data('lead.created') }])).rejects.toThrow();
      const line = logged.find((l) => l.includes('KLAROS_WEBHOOK_NON_SUCCESS_RESPONSE'));
      expect(line).toBeTruthy();
      const ctx = JSON.parse(line!)[1];
      expect(ctx).toMatchObject({ webhookId: hookA.id, status: 429, requestUserAgent: mods.http.WEBHOOK_USER_AGENT, layerHint: 'edge_or_proxy' });
      expect(ctx.responseHeaders).toEqual({ 'retry-after': '30', server: 'cloudflare', 'cf-ray': 'r1', via: '1.1 proxy', 'content-type': 'text/plain' });
    });

    it('NEVER logged: Authorization, the signing secret, the signature, the request body, lead content, phone, email, cookies', async () => {
      respond = (call) => ({
        status: 429, body: `Too Many Requests for ${call.body}`,
        headers: { 'retry-after': '5', server: 'x', 'set-cookie': 'sid=COOKIE-VALUE', authorization: 'Bearer RESPONSE-TOKEN', 'x-customer-email': 'jane@example.com' },
      });
      await expect(mods.webhooks.dispatchKlarosSequence(tenantA, [{ type: 'lead.created', eventId: randomUUID(), data: data('lead.created') }])).rejects.toThrow();
      expect(logged.some((l) => l.includes('KLAROS_WEBHOOK_NON_SUCCESS_RESPONSE')), 'log capture is live').toBe(true);
      const blob = logged.join('\n');
      const signature = sent[sent.length - 1].headers['X-HallaAI-Signature'];
      for (const secret of [...SECRETS(), signature, signature.replace('sha256=', ''), 'COOKIE-VALUE', 'RESPONSE-TOKEN', 'jane@example.com', ...leadContent, 'authorization', 'Bearer ']) {
        expect(blob.toLowerCase(), `leaked: ${secret}`).not.toContain(String(secret).toLowerCase());
      }
      expect(blob).not.toContain('"leadId"'); // no part of the request body
    });
  });

  describe('what the next 429 would prove (layer hint)', () => {
    const d = mods?.http?.diagnoseRejectionLayer;
    it('application-generated: JSON + request id + origin-server header', () => {
      expect(d(429, { 'content-type': 'application/json', 'x-request-id': 'abc', 'x-render-origin-server': 'uvicorn', 'retry-after': '12', server: 'cloudflare' })).toBe('application');
    });
    it('edge/proxy-generated: no origin-server header, no application request id, from a CDN; plain text or HTML', () => {
      expect(d(429, { 'content-type': 'text/plain', server: 'cloudflare', 'cf-ray': 'x' })).toBe('edge_or_proxy');
      expect(d(429, { 'content-type': 'text/html', via: '1.1 vegur' })).toBe('edge_or_proxy');
    });
    it('anything else is indeterminate: it is a hint, never a proof (partial markers, no headers, non-error status)', () => {
      expect(d(429, { 'content-type': 'application/json', server: 'cloudflare' })).toBe('indeterminate');
      expect(d(429, { 'x-request-id': 'abc', 'cf-ray': 'x' })).toBe('indeterminate');
      expect(d(429, undefined)).toBe('indeterminate');
      expect(d(200, { server: 'cloudflare', 'cf-ray': 'x' })).toBe('indeterminate');
      expect(d(429, {})).toBe('indeterminate');
    });
  });
});
