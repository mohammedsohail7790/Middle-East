/**
 * Ordering guarantee for the events Klaros consumes: lead.qualified is NEVER delivered after
 * call.completed, whatever fails, retries, races or crashes.
 *
 * Drives the REAL event consumer (retry / reclaim / DLQ), the REAL Klaros handler and the REAL
 * webhook service. Substituted: Redis Streams (in-memory fake with a controllable clock),
 * Postgres (in-memory mirror of the SQL the service issues), DNS and the TLS transport.
 * The same flow against real Redis 7 + real PostgreSQL 16 is in klaros-e2e.integration.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FakeRedisStreams } from '../helpers/fake-redis-streams.js';
import { createPlatformEvent } from '../../infrastructure/events/event-envelope.js';
import { encodeEventEnvelope, decodeEventEnvelope } from '../../infrastructure/events/event-codecs.js';
import { ensureConsumerGroups, readAndProcessBatch, type ConsumerOptions } from '../../infrastructure/events/event-consumer.js';
import { DLQ_STREAM_KEY, streamKey } from '../../infrastructure/events/event-types.js';

interface Hook {
  id: string;
  tenant_id: string;
  url: string;
  secret: string;
  active: boolean;
  events: string[];
}
const hooks = new Map<string, Hook>();
const deliveries = new Map<string, { delivered: boolean; status: number | null }>();

vi.mock('../../apps/gateway/src/services/db/pool.js', () => ({
  pool: {
    query: vi.fn(async (sql: string, params: any[]) => {
      const text = sql.replace(/\s+/g, ' ').trim();
      if (text.startsWith('SELECT id, url, secret, events FROM public.custom_webhooks')) {
        const [tenantId, types] = params as [string, string[]];
        return { rows: [...hooks.values()].filter((h) => h.tenant_id === tenantId && h.active && h.events.some((e) => types.includes(e))) };
      }
      if (text.startsWith('SELECT delivered FROM public.webhook_deliveries')) {
        const row = deliveries.get(`${params[0]}:${params[1]}`);
        return { rows: row ? [{ delivered: row.delivered }] : [] };
      }
      if (text.startsWith('INSERT INTO public.webhook_deliveries')) {
        const [webhookId, , , eventId, , status, , delivered] = params;
        deliveries.set(`${webhookId}:${eventId}`, { delivered, status });
        return { rows: [] };
      }
      if (text.startsWith('UPDATE public.custom_webhooks')) return { rows: [] };
      throw new Error(`unexpected query: ${text}`);
    }),
  },
}));
vi.mock('node:dns/promises', () => ({ lookup: vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]) }));

/** What each receiver actually got, in arrival order. */
const received: Array<{ host: string; type: string; id: string }> = [];
/** `${host}|${type}` -> remaining forced failures (Infinity = permanent). */
const failures = new Map<string, number>();
vi.mock('../../apps/gateway/src/security/safe-http.js', () => ({
  safePostJson: vi.fn(async (url: URL, _addresses: string[], opts: { body: string }) => {
    const env = JSON.parse(opts.body);
    const key = `${url.hostname}|${env.type}`;
    const remaining = failures.get(key) ?? 0;
    if (remaining > 0) {
      failures.set(key, remaining - 1);
      return { status: 503, body: 'unavailable' };
    }
    received.push({ host: url.hostname, type: env.type, id: env.id });
    return { status: 200, body: 'ok' };
  }),
}));

import { handleKlarosWebhookEvent } from '../../apps/gateway/src/events/consumers/klaros-webhook.consumer.js';

const TENANT = 'tenant-1';
const GROUP = 'klaros-group';
const BASE_MS = 1000;
const STREAM = streamKey('call-events');

const typesFor = (host: string) => received.filter((r) => r.host === host).map((r) => r.type);
const indexOf = (host: string, type: string) => received.findIndex((r) => r.host === host && r.type === type);

describe('Klaros ordered delivery: lead.qualified is never delivered after call.completed', () => {
  let redis: FakeRedisStreams;
  let tick: (consumer?: string, extra?: Partial<ConsumerOptions>) => Promise<number>;

  const addHook = (host: string, events: string[] = ['lead.qualified', 'call.completed']) =>
    hooks.set(host, { id: host, tenant_id: TENANT, url: `https://${host}/hook`, secret: 'a'.repeat(64), active: true, events });

  async function publishCallEnded(opts: { qualified?: boolean; eventId?: string } = {}) {
    const event = createPlatformEvent(
      'CALL_ENDED' as any,
      {
        callSid: 'CA1',
        durationMs: 4200,
        klarosLeadId: 'kl-1',
        qualificationStatus: opts.qualified === false ? 'unknown' : 'qualified',
        ...(opts.qualified === false
          ? {}
          : { qualificationEvent: { callId: 'CA1', leadId: 'lead-1', klarosLeadId: 'kl-1', status: 'qualified', fields: {}, missingFields: [], reason: 'ok', confidence: 0.9 } }),
      },
      { tenantId: TENANT, callSid: 'CA1' }
    );
    if (opts.eventId) event.eventId = opts.eventId;
    await redis.xadd(STREAM, '*', ...Object.entries(encodeEventEnvelope(event)).flat());
    return event;
  }

  beforeEach(async () => {
    hooks.clear();
    deliveries.clear();
    received.length = 0;
    failures.clear();
    redis = new FakeRedisStreams();
    await ensureConsumerGroups(redis as any, [STREAM], GROUP);
    tick = (consumer = 'worker-a', extra = {}) =>
      readAndProcessBatch(
        {
          redis: redis as any, streams: [STREAM], groupName: GROUP, consumerName: consumer, maxRetries: 8, blockMs: 0,
          retryBaseDelayMs: BASE_MS, retryMaxDelayMs: 8000, reclaimIntervalMs: 0, ...extra,
        },
        handleKlarosWebhookEvent as any
      );
  });

  it('A. a qualified call delivers lead.qualified before call.completed', async () => {
    addHook('w1.example.com');
    await publishCallEnded();
    await tick();
    expect(typesFor('w1.example.com')).toEqual(['lead.qualified', 'call.completed']);
  });

  it('B. when lead.qualified fails and is retried, call.completed WAITS — it is never delivered ahead of it', async () => {
    addHook('w1.example.com');
    failures.set('w1.example.com|lead.qualified', 2);
    await publishCallEnded();

    await tick(); // attempt 1: qualified -> 503
    expect(typesFor('w1.example.com')).toEqual([]); // completed must NOT have overtaken it

    redis.advance(BASE_MS);
    await tick(); // attempt 2: qualified -> 503
    expect(typesFor('w1.example.com')).toEqual([]);

    redis.advance(BASE_MS * 2);
    await tick(); // attempt 3: qualified succeeds, then completed
    expect(typesFor('w1.example.com')).toEqual(['lead.qualified', 'call.completed']);
    expect(redis.pendingCount(STREAM, GROUP)).toBe(0);
  });

  it('C. an unqualified/unknown call delivers just call.completed carrying the persisted status', async () => {
    addHook('w1.example.com');
    await publishCallEnded({ qualified: false });
    await tick();
    expect(typesFor('w1.example.com')).toEqual(['call.completed']);
  });

  it('D. a permanently failing lead.qualified cannot hold call.completed hostage, and never arrives after it', async () => {
    addHook('w1.example.com');
    failures.set('w1.example.com|lead.qualified', Infinity);
    const event = await publishCallEnded();

    for (let i = 0; i < 8; i++) {
      await tick('worker-a', { maxRetries: 3 });
      redis.advance(8000);
    }

    // The final attempt delivered call.completed; lead.qualified was never delivered at all.
    expect(typesFor('w1.example.com')).toEqual(['call.completed']);
    expect(deliveries.get(`w1.example.com:${event.eventId}:lead.qualified`)).toEqual({ delivered: false, status: 503 });
    expect(deliveries.get(`w1.example.com:${event.eventId}`)?.delivered).toBe(true);

    // The failure stays visible in the DLQ, and nothing is retried afterwards.
    const dlq = (await redis.xrange(DLQ_STREAM_KEY)).map(([, f]) => decodeEventEnvelope(f));
    expect(dlq.map((e) => e!.eventId)).toEqual([event.eventId]);
    failures.clear(); // even once Klaros recovers, nothing late is delivered
    redis.advance(60_000);
    await tick('worker-a', { maxRetries: 3 });
    expect(typesFor('w1.example.com')).toEqual(['call.completed']);
  });

  it('E. duplicate processing: the same finalization published twice is delivered once', async () => {
    addHook('w1.example.com');
    await publishCallEnded({ eventId: 'evt-dup' });
    await publishCallEnded({ eventId: 'evt-dup' });
    await tick();
    expect(typesFor('w1.example.com')).toEqual(['lead.qualified', 'call.completed']);
  });

  it('E2. a lost ACK after full delivery re-runs nothing on reclaim', async () => {
    addHook('w1.example.com');
    await publishCallEnded();
    const realAck = redis.xack.bind(redis);
    redis.xack = async () => 0; // delivered, but the ACK never reached Redis
    await tick();
    redis.xack = realAck;

    redis.advance(BASE_MS);
    await tick();
    expect(typesFor('w1.example.com')).toEqual(['lead.qualified', 'call.completed']);
    expect(redis.pendingCount(STREAM, GROUP)).toBe(0);
  });

  it('F. concurrent workers racing for a pending event deliver each step exactly once, in order', async () => {
    addHook('w1.example.com');
    failures.set('w1.example.com|lead.qualified', 1);
    await publishCallEnded();
    await tick('worker-a');
    redis.advance(BASE_MS);

    await Promise.all([tick('worker-a'), tick('worker-b'), tick('worker-c')]);

    expect(typesFor('w1.example.com')).toEqual(['lead.qualified', 'call.completed']);
    expect(redis.pendingCount(STREAM, GROUP)).toBe(0);
  });

  it('G. recovery after a worker crash between the two steps keeps the order and sends nothing twice', async () => {
    addHook('w1.example.com');
    failures.set('w1.example.com|call.completed', 1); // lead.qualified lands, then the worker "dies" at completed
    await publishCallEnded();
    await tick('worker-a');
    expect(typesFor('w1.example.com')).toEqual(['lead.qualified']);

    redis.advance(BASE_MS);
    await tick('worker-b'); // a different worker takes over
    expect(typesFor('w1.example.com')).toEqual(['lead.qualified', 'call.completed']); // qualified NOT repeated
  });

  it('G2. recovery after a crash that left the processing claim behind waits for the claim to lapse, then delivers in order', async () => {
    addHook('w1.example.com');
    const event = await publishCallEnded();
    await redis.xreadgroup('GROUP', GROUP, 'dead-worker', 'COUNT', 10, 'BLOCK', 0, 'STREAMS', STREAM, '>');
    await redis.set(`calliq:event:processed:${GROUP}:${event.eventId}`, 'processing', 'EX', 300, 'NX');

    redis.advance(BASE_MS);
    await tick('worker-b');
    expect(received).toHaveLength(0); // claim still held

    redis.advance(301_000);
    await tick('worker-b');
    expect(typesFor('w1.example.com')).toEqual(['lead.qualified', 'call.completed']);
  });

  it('H. replay safety: if call.completed already went out, a late lead.qualified is skipped, never sent after it', async () => {
    addHook('w1.example.com');
    const event = await publishCallEnded();
    deliveries.set(`w1.example.com:${event.eventId}`, { delivered: true, status: 200 }); // completed already delivered
    await tick();
    expect(typesFor('w1.example.com')).toEqual([]);
  });

  it('I. webhooks are independent: one failing receiver does not reorder or block another', async () => {
    addHook('w1.example.com');
    addHook('w2.example.com');
    failures.set('w1.example.com|lead.qualified', 1);
    await publishCallEnded();

    await tick();
    expect(typesFor('w2.example.com')).toEqual(['lead.qualified', 'call.completed']); // unaffected
    expect(typesFor('w1.example.com')).toEqual([]); // waiting for its own qualified to succeed

    redis.advance(BASE_MS);
    await tick();
    expect(typesFor('w1.example.com')).toEqual(['lead.qualified', 'call.completed']);
    expect(typesFor('w2.example.com')).toEqual(['lead.qualified', 'call.completed']); // not sent twice
  });

  it('J. a webhook subscribed only to call.completed is unaffected by lead.qualified failures elsewhere', async () => {
    addHook('w1.example.com');
    addHook('w3.example.com', ['call.completed']);
    failures.set('w1.example.com|lead.qualified', Infinity);
    await publishCallEnded();
    await tick();
    expect(typesFor('w3.example.com')).toEqual(['call.completed']);
    expect(indexOf('w3.example.com', 'lead.qualified')).toBe(-1);
  });

  it('K. every delivered event keeps a stable id across retries (idempotency key)', async () => {
    addHook('w1.example.com');
    failures.set('w1.example.com|lead.qualified', 1);
    const event = await publishCallEnded();
    await tick();
    redis.advance(BASE_MS);
    await tick();
    expect(received.map((r) => r.id)).toEqual([`${event.eventId}:lead.qualified`, event.eventId]);
  });
});
