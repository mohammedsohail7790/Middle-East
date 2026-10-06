/**
 * END-TO-END Klaros <-> Halla flow on REAL Redis (Streams) + REAL PostgreSQL.
 *
 *   API key (DB-backed) -> default-deny gate -> webhook registration -> lead with klarosLeadId
 *   -> outbound call with klarosLeadId -> transfer + post-call persistence -> qualification
 *   -> ordered finalization (lead.qualified, call.completed) -> real Redis Stream consumer
 *   -> signed delivery -> retry / reclaim / DLQ -> tenant-isolated persisted delivery rows.
 *
 * Runs only when HALLA_TEST_DATABASE_URL points at a disposable Postgres (schema + migrations
 * applied) AND REDIS_URL points at Redis >= 5. Otherwise it is skipped (never faked).
 *
 * Still substituted: Twilio (no call is placed), DNS and the TLS transport (no public endpoint
 * to call — deliveries are captured and their signatures verified), and the JWT modules.
 * The post-call closures (persist qualification / read final state) are the same SQL that
 * realtime.post-call.ts runs; finalizeRuntimeSession itself needs a live realtime session.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';

const DATABASE_URL = process.env.HALLA_TEST_DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
if (DATABASE_URL) {
  process.env.GATEWAY_DATABASE_URL = DATABASE_URL;
  process.env.PGSSLMODE = 'disable';
}

async function redisSupportsStreams(): Promise<boolean> {
  const probe = new Redis(REDIS_URL, { maxRetriesPerRequest: 1, connectTimeout: 3000, lazyConnect: true });
  try {
    await probe.connect();
    const m = (await probe.info('server')).match(/redis_version:(\d+)\./);
    return Boolean(m && Number(m[1]) >= 5);
  } catch {
    return false;
  } finally {
    await probe.quit().catch(() => {});
  }
}
const run = Boolean(DATABASE_URL) && (await redisSupportsStreams());
if (!run) {
  // eslint-disable-next-line no-console
  console.warn('KLAROS_E2E_SKIPPED: needs HALLA_TEST_DATABASE_URL and Redis >= 5 — NOT VALIDATED (environment unavailable).');
}

vi.mock('twilio', () => ({
  default: () => ({ calls: { create: vi.fn(async () => ({ sid: `CA_E2E_${Date.now()}_${Math.floor(Math.random() * 1e6)}` })) } }),
}));
vi.mock('../../apps/gateway/src/services/voice/redis.client.js', () => ({
  voiceRedis: {
    get: vi.fn(async () => null), set: vi.fn(async () => 'OK'), setex: vi.fn(async () => 'OK'), del: vi.fn(async () => 1),
    expire: vi.fn(async () => 1), hset: vi.fn(async () => 1), ping: vi.fn(async () => 'PONG'), publish: vi.fn(async () => 1),
  },
}));
vi.mock('node:dns/promises', () => ({ lookup: vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]) }));
vi.mock('../../apps/gateway/src/services/auth/jwt-tenant-verifier.js', () => ({ verifyUserBearerToken: vi.fn() }));
vi.mock('../../apps/gateway/src/services/auth/internal-service-auth.js', () => ({ verifyInternalServiceRequest: vi.fn() }));
vi.mock('../../apps/gateway/src/security/sse-token.js', () => ({ verifySseDashboardToken: vi.fn(() => null) }));

interface Received { host: string; type: string; id: string; tenantId: string; data: any; headers: Record<string, string>; body: string }
const received: Received[] = [];
const failures = new Map<string, number>(); // `${host}|${type}` -> remaining forced 503s (Infinity = permanent)
vi.mock('../../apps/gateway/src/security/safe-http.js', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../apps/gateway/src/security/safe-http.js')>()),
  safePostJson: vi.fn(async (url: URL, _addresses: string[], opts: { body: string; headers: Record<string, string> }) => {
    // Other suites share this Redis/Postgres and run in parallel: their tenants' events legitimately
    // flow through this consumer, but only this file's own webhook hosts are recorded and failure-injected.
    if (!url.hostname.endsWith('.e2e.example.com')) return { status: 200, body: 'ok' };
    const env = JSON.parse(opts.body);
    const key = `${url.hostname}|${env.type}`;
    const remaining = failures.get(key) ?? 0;
    if (remaining > 0) {
      failures.set(key, remaining - 1);
      return { status: 503, body: 'unavailable' };
    }
    received.push({ host: url.hostname, type: env.type, id: env.id, tenantId: env.tenant_id, data: env.data, headers: opts.headers, body: opts.body });
    return { status: 200, body: 'ok' };
  }),
}));

const mods = run
  ? {
      pool: (await import('../../apps/gateway/src/services/db/pool.js')).pool,
      keys: (await import('../../apps/gateway/src/services/api-keys/apiKey.service.js')).tenantApiKeyService,
      webhooks: (await import('../../apps/gateway/src/services/webhooks/webhooks.service.js')).customWebhooksService,
      leads: (await import('../../apps/gateway/src/services/leads/leads.service.js')).leadsService,
      outbound: await import('../../apps/gateway/src/services/voice/outbound.service.js'),
      voice: await import('../../apps/gateway/src/services/voice/voice.controller.js'),
      correlation: await import('../../apps/gateway/src/services/klaros/correlation.js'),
      completion: await import('../../apps/gateway/src/services/realtime/post-call-completion.js'),
      mapper: await import('../../apps/gateway/src/services/realtime/qualification-mapper.js'),
      requireTenant: (await import('../../apps/gateway/src/middleware/require-tenant.js')).requireTenant,
      handler: (await import('../../apps/gateway/src/events/consumers/klaros-webhook.consumer.js')).handleKlarosWebhookEvent,
      consumer: await import('../../infrastructure/events/event-consumer.js'),
      envelope: await import('../../infrastructure/events/event-envelope.js'),
      publisher: await import('../../infrastructure/events/event-publisher.js'),
      codecs: await import('../../infrastructure/events/event-codecs.js'),
      types: await import('../../infrastructure/events/event-types.js'),
      signing: await import('../../apps/gateway/src/security/webhook-signing.js'),
    }
  : (null as any);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!run)('Klaros <-> Halla end to end (real Redis + real PostgreSQL)', { timeout: 30_000 }, () => {
  const q = (sql: string, params: any[] = []) => mods.pool.query(sql, params);
  let redis: Redis;
  let tenantA: string;
  let tenantB: string;
  const STREAMS = () => ['call-events', 'lead-events', 'appointment-events'].map((n) => mods.types.streamKey(n));

  async function seedTenant(label: string): Promise<string> {
    const user = await q(`INSERT INTO auth.users (email) VALUES ($1) RETURNING id`, [`${label}-${randomUUID()}@e2e.local`]);
    const t = await q(
      `INSERT INTO public.voice_tenants (owner_user_id, company_name, phone_number) VALUES ($1,$2,$3) RETURNING id`,
      [user.rows[0].id, `E2E ${label}`, `+1555${Math.floor(Math.random() * 1e7)}`]
    );
    return t.rows[0].id;
  }

  const addWebhook = (tenant: string, host: string, events = ['lead.qualified', 'call.completed', 'lead.escalated', 'appointment.confirmed']) =>
    mods.webhooks.create(tenant, { name: host, url: `https://${host}/hook`, events });

  /** A fresh consumer group per scenario, starting at the current end of each real stream. */
  async function newGroup(): Promise<string> {
    const group = `e2e-${randomUUID()}`;
    for (const s of STREAMS()) await redis.xgroup('CREATE', s, group, '$', 'MKSTREAM');
    return group;
  }

  /** Drives the REAL consumer until `done()` or the deadline. */
  async function drain(group: string, done: () => boolean, opts: { maxRetries?: number; ms?: number } = {}) {
    const deadline = Date.now() + (opts.ms ?? 8000);
    while (Date.now() < deadline) {
      await mods.consumer.readAndProcessBatch(
        {
          redis, streams: STREAMS(), groupName: group, consumerName: `e2e-${process.pid}`, blockMs: 30,
          maxRetries: opts.maxRetries ?? 8, retryBaseDelayMs: 100, retryMaxDelayMs: 400, reclaimIntervalMs: 0,
        },
        mods.handler as any
      );
      if (done()) return;
      await sleep(40);
    }
  }

  const pendingFor = async (group: string) => {
    let n = 0;
    for (const s of STREAMS()) n += Number(((await redis.xpending(s, group)) as any)[0] ?? 0);
    return n;
  };

  /** Production-equivalent post-call run: same SQL as realtime.post-call.ts, finalization published to REAL Redis. */
  async function finalizeCall(opts: { tenantId: string; callSid: string; evaluation?: { callSuccess: boolean; leadQuality: 'high' | 'medium' | 'low'; summary: string; degraded?: boolean }; eventId?: string }) {
    const { tenantId, callSid } = opts;
    const fields = { name: 'Ada', phone: '+15550001111', service: 'boiler repair' };
    const published: any[] = [];
    await mods.completion.runPostCallCompletion({
      evaluate: async () =>
        mods.mapper.mapEvaluationToQualification(opts.evaluation ?? { callSuccess: true, leadQuality: 'high', summary: 'Booked a boiler repair' }, { missingFields: [], escalated: false }),
      claim: async () => true,
      persistQualification: async (qual: any) => {
        await q(
          `UPDATE public.calls SET qualification_status=$1, qualification_fields=$2::jsonb, qualification_missing=$3::jsonb,
             qualification_reason=$4, qualification_confidence=$5 WHERE call_sid=$6 AND tenant_id=$7`,
          [qual.status, JSON.stringify(fields), JSON.stringify(qual.missingFields), qual.reason, qual.confidence, callSid, tenantId]
        );
      },
      buildQualificationEvent: async (qual: any) => ({
        callId: callSid, ...(await mods.correlation.resolveCallCorrelation(tenantId, callSid)),
        status: qual.status, fields, missingFields: qual.missingFields, reason: qual.reason, confidence: qual.confidence,
      }),
      readFinalState: async () => {
        const r = await q(`SELECT klaros_lead_id, qualification_status, transfer_target FROM public.calls WHERE call_sid=$1 AND tenant_id=$2 LIMIT 1`, [callSid, tenantId]);
        const row = r.rows[0] ?? {};
        return { klarosLeadId: row.klaros_lead_id ?? undefined, qualificationStatus: row.qualification_status ?? 'unknown', escalation: row.transfer_target ?? undefined };
      },
      publishCompleted: async (state: any, qualificationEvent: any) => {
        const event = mods.envelope.createPlatformEvent(
          'CALL_ENDED' as any,
          { callSid, durationMs: 4200, callerPhone: '+15550001111', hasTranscript: true, klarosLeadId: state.klarosLeadId, qualificationStatus: state.qualificationStatus, escalation: state.escalation, ...(qualificationEvent ? { qualificationEvent } : {}) },
          { tenantId, callSid }
        );
        if (opts.eventId) event.eventId = opts.eventId;
        await mods.publisher.publishToStream(redis, event);
        published.push(event);
      },
      onError: () => {},
    });
    return published;
  }

  async function newOutboundCall(tenantId: string, klarosLeadId: string, opts: { transferTarget?: string } = {}) {
    const phone = `+1555${Math.floor(Math.random() * 1e7)}`;
    const { callSid } = await mods.outbound.initiateOutboundCall({ tenantId, toNumber: phone, fromNumber: '+15551234567', reason: 'follow_up', klarosLeadId });
    const call = await q(`SELECT id FROM public.calls WHERE call_sid=$1`, [callSid]);
    const lead = await mods.leads.createLead(tenantId, phone, 'klaros_inbound', { name: 'Ada', klarosLeadId, callId: call.rows[0].id });
    await mods.voice.storeCall({ tenantId, callSid, transcript: 'hello', latency: 0, durationMs: 4200, outcome: opts.transferTarget ? 'transferred' : 'completed', transferTarget: opts.transferTarget });
    return { callSid, callId: call.rows[0].id as string, lead };
  }

  beforeAll(async () => {
    redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 2, connectTimeout: 5000 });
    tenantA = await seedTenant('a');
    tenantB = await seedTenant('b');
  });

  afterAll(async () => {
    await q(`DELETE FROM public.voice_tenants WHERE id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
    await redis.quit();
    await mods.pool.end();
  });

  beforeEach(async () => {
    received.length = 0;
    failures.clear();
    await q(`DELETE FROM public.custom_webhooks WHERE tenant_id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
  });

  it('authenticates with a DB-backed API key under the default-deny policy', async () => {
    const key = await mods.keys.createKey(tenantA, 'klaros-e2e', ['workforce.read', 'leads.write', 'calls.write', 'webhooks.manage']);
    const call = async (method: string, url: string) => {
      const headers: Record<string, string> = { authorization: `Bearer ${key.key}` };
      const req: any = { method, originalUrl: url, header: (n: string) => headers[n.toLowerCase()], headers: { ...headers } };
      const res: any = { statusCode: 200, status(c: number) { this.statusCode = c; return this; }, json() { return this; }, setHeader() {} };
      let nexted = false;
      await mods.requireTenant(req, res, () => { nexted = true; });
      return { nexted, status: res.statusCode, tenant: req.headers['x-tenant-id'] };
    };
    expect(await call('POST', '/api/v1/leads')).toMatchObject({ nexted: true, tenant: tenantA });
    expect(await call('POST', '/api/v1/calls/outbound')).toMatchObject({ nexted: true });
    expect(await call('POST', '/api/v1/webhooks')).toMatchObject({ nexted: true });
    expect((await call('GET', '/api/v1/leads')).status).toBe(403); // no leads.read
    expect((await call('GET', '/api/v1/dashboard/stats')).status).toBe(403);
  });

  it('1. a qualified, escalated outbound call: lead.qualified then call.completed, with correlated ids, signed, tenant-isolated', async () => {
    const wA = await addWebhook(tenantA, 'a1.e2e.example.com');
    await addWebhook(tenantB, 'b1.e2e.example.com');
    const group = await newGroup();
    const { callSid, lead } = await newOutboundCall(tenantA, 'kl-e2e-1', { transferTarget: '+15559990000' });

    await finalizeCall({ tenantId: tenantA, callSid, eventId: 'evt-e2e-1' });
    await drain(group, () => received.length >= 2);

    const mine = received.filter((r) => r.host === 'a1.e2e.example.com');
    expect(mine.map((r) => r.type)).toEqual(['lead.qualified', 'call.completed']); // ordered
    expect(mine.map((r) => r.id)).toEqual(['evt-e2e-1:lead.qualified', 'evt-e2e-1']);
    expect(mine.every((r) => r.tenantId === tenantA)).toBe(true);

    expect(mine[0].data).toMatchObject({ callId: callSid, leadId: lead.id, klarosLeadId: 'kl-e2e-1', status: 'qualified' });
    expect(mine[1].data).toMatchObject({ callId: callSid, klarosLeadId: 'kl-e2e-1', qualificationStatus: 'qualified', escalation: '+15559990000' });
    expect(JSON.stringify(mine[1].data)).not.toContain('+15550001111'); // caller phone never forwarded

    for (const r of mine) {
      const sig = mods.signing.verifyWebhookSignature({ secret: wA.secret, timestamp: r.headers['X-HallaAI-Timestamp'], rawBody: r.body, signatureHeader: r.headers['X-HallaAI-Signature'] });
      expect(sig.valid).toBe(true);
    }

    expect(received.some((r) => r.host.startsWith('b1.'))).toBe(false); // tenant B received nothing
    const rows = await q(`SELECT webhook_id, event_id, delivered FROM public.webhook_deliveries WHERE event_id LIKE 'evt-e2e-1%' ORDER BY event_id`, []);
    expect(rows.rows.map((r: any) => [r.event_id, r.delivered])).toEqual([['evt-e2e-1', true], ['evt-e2e-1:lead.qualified', true]]);
    expect(rows.rows.every((r: any) => r.webhook_id === wA.id)).toBe(true);
    expect(await pendingFor(group)).toBe(0);
  });

  it('2. a transiently failing lead.qualified is retried through real Redis; call.completed waits and the order holds', async () => {
    await addWebhook(tenantA, 'a2.e2e.example.com');
    failures.set('a2.e2e.example.com|lead.qualified', 2);
    const group = await newGroup();
    const { callSid } = await newOutboundCall(tenantA, 'kl-e2e-2');

    await finalizeCall({ tenantId: tenantA, callSid, eventId: 'evt-e2e-2' });
    await drain(group, () => received.length >= 2);

    expect(received.map((r) => r.type)).toEqual(['lead.qualified', 'call.completed']);
    expect(failures.get('a2.e2e.example.com|lead.qualified')).toBe(0); // both forced failures were consumed first
    expect(await pendingFor(group)).toBe(0);
  });

  it('3. a permanently failing lead.qualified: call.completed is still delivered, the failure reaches the real DLQ, nothing arrives late', async () => {
    await addWebhook(tenantA, 'a3.e2e.example.com');
    failures.set('a3.e2e.example.com|lead.qualified', Infinity);
    const group = await newGroup();
    const { callSid } = await newOutboundCall(tenantA, 'kl-e2e-3');

    const [event] = await finalizeCall({ tenantId: tenantA, callSid, eventId: `evt-e2e-3-${randomUUID()}` });
    await drain(group, () => false, { maxRetries: 3, ms: 4000 });

    expect(received.map((r) => r.type)).toEqual(['call.completed']);
    const dlq = (await redis.xrange(mods.types.DLQ_STREAM_KEY, '-', '+')).map(([, f]) => mods.codecs.decodeEventEnvelope(f)).filter((e: any) => e?.eventId === event.eventId);
    expect(dlq).toHaveLength(1);
    expect(await pendingFor(group)).toBe(0);

    const rows = await q(`SELECT event_id, delivered FROM public.webhook_deliveries WHERE event_id LIKE $1 ORDER BY event_id`, [`${event.eventId}%`]);
    expect(rows.rows.map((r: any) => [r.event_id, r.delivered])).toEqual([[event.eventId, true], [`${event.eventId}:lead.qualified`, false]]);

    failures.clear(); // Klaros recovers later: still nothing late
    await drain(group, () => false, { maxRetries: 3, ms: 1200 });
    expect(received.map((r) => r.type)).toEqual(['call.completed']);
  });

  it('4. every real determination is announced with its status; a degraded evaluation is never turned into one', async () => {
    await addWebhook(tenantA, 'a4.e2e.example.com');
    const group = await newGroup();
    const one = await newOutboundCall(tenantA, 'kl-e2e-4a');
    const two = await newOutboundCall(tenantA, 'kl-e2e-4b');

    await finalizeCall({ tenantId: tenantA, callSid: one.callSid, eventId: 'evt-e2e-4a', evaluation: { callSuccess: false, leadQuality: 'low', summary: 'Hung up' } });
    await finalizeCall({ tenantId: tenantA, callSid: two.callSid, eventId: 'evt-e2e-4b', evaluation: { callSuccess: true, leadQuality: 'low', summary: 'x', degraded: true } });
    await drain(group, () => received.length >= 3);

    const forCall = (id: string) => received.filter((r) => r.id === id || r.id === `${id}:lead.qualified`);
    // not_qualified is a real result: announced (lead.qualified with status) BEFORE call.completed
    expect(forCall('evt-e2e-4a').map((r) => r.type)).toEqual(['lead.qualified', 'call.completed']);
    expect(forCall('evt-e2e-4a')[0].data.status).toBe('not_qualified');
    expect(forCall('evt-e2e-4a')[1].data.qualificationStatus).toBe('not_qualified');
    // a degraded evaluation yields NO lead.qualified and an honest "unknown"
    expect(forCall('evt-e2e-4b').map((r) => r.type)).toEqual(['call.completed']);
    expect(forCall('evt-e2e-4b')[0].data.qualificationStatus).toBe('unknown');
  });

  it('5. duplicate publication of the same finalization is delivered once', async () => {
    await addWebhook(tenantA, 'a5.e2e.example.com');
    const group = await newGroup();
    const { callSid } = await newOutboundCall(tenantA, 'kl-e2e-5');

    await finalizeCall({ tenantId: tenantA, callSid, eventId: 'evt-e2e-5' });
    await finalizeCall({ tenantId: tenantA, callSid, eventId: 'evt-e2e-5' });
    await drain(group, () => received.length >= 2);
    await drain(group, () => false, { ms: 600 });

    expect(received.map((r) => r.type)).toEqual(['lead.qualified', 'call.completed']);
    expect(await pendingFor(group)).toBe(0);
  });

  it('6. appointment events carry the correlated lead ids, resolved from real rows, and only to the owning tenant', async () => {
    await addWebhook(tenantA, 'a6.e2e.example.com');
    await addWebhook(tenantB, 'b6.e2e.example.com');
    const group = await newGroup();
    const phone = `+1555${Math.floor(Math.random() * 1e7)}`;
    const lead = await mods.leads.createLead(tenantA, phone, 'klaros_inbound', { name: 'Appt', klarosLeadId: 'kl-e2e-6' });
    const appt = await q(`INSERT INTO public.appointments (tenant_id, name, phone, service, scheduled_time, status) VALUES ($1,'Appt',$2,'svc', now() + interval '1 day','booked') RETURNING id, scheduled_time`, [tenantA, phone]);

    const correlation = await mods.correlation.resolveAppointmentCorrelation(tenantA, appt.rows[0].id);
    const event = mods.envelope.createPlatformEvent('APPOINTMENT_CREATED' as any, { appointmentId: appt.rows[0].id, scheduledTime: appt.rows[0].scheduled_time.toISOString(), phone, ...correlation }, { tenantId: tenantA });
    await mods.publisher.publishToStream(redis, event);
    await drain(group, () => received.length >= 1);

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ host: 'a6.e2e.example.com', type: 'appointment.confirmed', tenantId: tenantA });
    expect(received[0].data).toMatchObject({ appointmentId: appt.rows[0].id, leadId: lead.id, klarosLeadId: 'kl-e2e-6' });
    expect(JSON.stringify(received[0].data)).not.toContain(phone);
  });
});
