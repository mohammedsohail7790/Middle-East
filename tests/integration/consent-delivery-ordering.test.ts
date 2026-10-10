/**
 * Consent-change delivery ordering through Halla's real event consumer (retry / reclaim / DLQ / idempotency marker) and the real Klaros
 * webhook handler. The point: events are at-least-once and each publish has its own random event id, so a failed delivery is retried
 * AFTER later events were already sent. The consumer therefore re-reads the stored consent at delivery time, and a retried event can
 * never deliver an older state than the one stored now.
 *
 * Substituted: Redis Streams (tests/helpers/fake-redis-streams.ts, controllable clock), PostgreSQL (the single consent SELECT and the
 * webhook tables are in-memory emulations; the SQL itself is NOT run against a database), DNS and the TLS transport. What Klaros does
 * with these events is not exercised here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FakeRedisStreams } from '../helpers/fake-redis-streams.js';
import { createPlatformEvent } from '../../infrastructure/events/event-envelope.js';
import { encodeEventEnvelope, decodeEventEnvelope } from '../../infrastructure/events/event-codecs.js';
import { ensureConsumerGroups, readAndProcessBatch } from '../../infrastructure/events/event-consumer.js';
import { routeEventToStream } from '../../infrastructure/events/event-router.js';
import { DLQ_STREAM_KEY } from '../../infrastructure/events/event-types.js';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const HOST = 'klaros.example.com';
const SECRET = 'f'.repeat(64);

interface Stored { tenant_id: string; lead_id: string; scope: string; granted: boolean; at: number; seq: number }
const stored: Stored[] = [];
const state = { failReads: 0 };
const deliveries = new Map<string, boolean>();

vi.mock('../../apps/gateway/src/services/db/pool.js', () => ({
  pool: {
    query: vi.fn(async (sql: string, params: any[]) => {
      const t = sql.replace(/\s+/g, ' ').trim();
      if (t.startsWith('SELECT scope, granted, method, wording_version, recorded_at FROM public.lead_consents')) {
        if (state.failReads > 0) { state.failReads--; throw new Error('connection terminated unexpectedly'); }
        return {
          rows: stored.filter((r) => r.tenant_id === params[0] && r.lead_id === params[1]).sort((a, b) => a.at - b.at || a.seq - b.seq)
            .map((r) => ({ scope: r.scope, granted: r.granted, method: 'voice_ai_verbal', wording_version: 'MT-CONSENT-v1', recorded_at: new Date(r.at) })),
        };
      }
      if (t.startsWith('SELECT id, url, secret, events FROM public.custom_webhooks')) {
        const [tenantId] = params as [string];
        return { rows: tenantId === A ? [{ id: 'wh-a', tenant_id: A, url: `https://${HOST}/hook`, secret: SECRET, active: true, events: ['lead.updated', 'lead.created'] }] : [] };
      }
      if (t.startsWith('SELECT delivered FROM public.webhook_deliveries')) {
        const d = deliveries.get(`${params[0]}:${params[1]}`);
        return { rows: d === undefined ? [] : [{ delivered: d }] };
      }
      if (t.startsWith('INSERT INTO public.webhook_deliveries')) { deliveries.set(`${params[0]}:${params[3]}`, params[7]); return { rows: [] }; }
      if (t.startsWith('UPDATE public.custom_webhooks')) return { rows: [] };
      throw new Error(`unexpected query: ${t}`);
    }),
  },
}));
vi.mock('node:dns/promises', () => ({ lookup: vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]) }));
vi.mock('../../apps/gateway/src/services/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const received: Array<{ id: string; consent: any }> = [];
let failNext = 0;
vi.mock('../../apps/gateway/src/security/safe-http.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../apps/gateway/src/security/safe-http.js')>()),
  safePostJson: vi.fn(async (_url: URL, _addresses: string[], opts: { body: string }) => {
    if (failNext > 0) { failNext--; return { status: 503, body: 'unavailable' }; }
    const env = JSON.parse(opts.body);
    received.push({ id: env.id, consent: env.data.consent });
    return { status: 200, body: 'ok' };
  }),
}));

import { handleKlarosWebhookEvent } from '../../apps/gateway/src/events/consumers/klaros-webhook.consumer.js';

const STREAM = routeEventToStream('LEAD_UPDATED' as never);
const GROUP = 'klaros-group';
const BASE_MS = 1000;
const T0 = Date.parse('2026-10-09T10:00:00.000Z');
const iso = (s: number) => new Date(T0 + s * 1000).toISOString();

describe('consent change delivery: a retried or delayed event never delivers an older state', () => {
  let redis: FakeRedisStreams;
  const tick = (extra: Record<string, unknown> = {}) =>
    readAndProcessBatch(
      { redis: redis as any, streams: [STREAM], groupName: GROUP, consumerName: 'w1', maxRetries: 5, blockMs: 0, retryBaseDelayMs: BASE_MS, retryMaxDelayMs: 8000, reclaimIntervalMs: 0, ...extra } as any,
      handleKlarosWebhookEvent as any
    );
  const decide = (tenant: string, scope: string, granted: boolean, s: number) => stored.push({ tenant_id: tenant, lead_id: 'L1', scope, granted, at: T0 + s * 1000, seq: stored.length });
  /** what the producer puts on the bus: a trigger carrying the evidence it saw at publish time */
  const publish = async (snapshot: Record<string, unknown>, tenant = A) => {
    const event = createPlatformEvent('LEAD_UPDATED' as never, { leadId: 'L1', consent: snapshot }, { tenantId: tenant });
    await redis.xadd(STREAM, '*', ...Object.entries(encodeEventEnvelope(event)).flat());
    return event;
  };
  const snap = (granted: boolean, scope: string[], s: number) => ({ granted, scope, method: 'voice_ai_verbal', wording_version: 'MT-CONSENT-v1', recorded_at: iso(s) });

  beforeEach(async () => {
    stored.length = 0; state.failReads = 0; failNext = 0; deliveries.clear(); received.length = 0;
    redis = new FakeRedisStreams();
    await ensureConsumerGroups(redis as any, [STREAM], GROUP);
  });

  it('in-order delivery: each event arrives with the state stored when it is delivered', async () => {
    decide(A, 'contact', true, 1);
    await publish(snap(true, ['contact'], 1));
    await tick();
    decide(A, 'contact', false, 2);
    await publish(snap(false, ['contact'], 2));
    await tick();
    expect(received.map((r) => r.consent)).toEqual([snap(true, ['contact'], 1), snap(false, ['contact'], 2)]);
  });

  it('E1 fails once and is retried after E2 and E3 were delivered: the retry carries the newest state, never the stale one', async () => {
    decide(A, 'contact', true, 1); decide(A, 'store_personal_data', true, 1);
    await publish(snap(true, ['contact', 'store_personal_data'], 1)); // E1
    failNext = 1;
    await tick(); // E1 -> 503, stays pending
    expect(received).toHaveLength(0);

    decide(A, 'contact', false, 2); // partial withdrawal
    await publish(snap(true, ['store_personal_data'], 2)); // E2
    await tick(); // E2 delivered
    decide(A, 'contact', true, 3); // re-grant
    await publish(snap(true, ['contact', 'store_personal_data'], 3)); // E3
    redis.advance(BASE_MS * 4);
    await tick(); // E3 delivered and E1 retried

    const stamps = received.map((r) => r.consent.recorded_at);
    expect([...stamps].sort()).toEqual(stamps); // a non-decreasing sequence at the receiver
    expect(stamps).not.toContain(iso(1)); // the stale first state was never sent
    expect(received.at(-1)!.consent).toEqual(snap(true, ['contact', 'store_personal_data'], 3));
    expect(redis.pendingCount(STREAM, GROUP)).toBe(0);
  });

  it('a withdrawal whose own event is delayed is still delivered, and an older grant event behind it cannot undo it', async () => {
    decide(A, 'contact', true, 1);
    const e1 = await publish(snap(true, ['contact'], 1));
    decide(A, 'contact', false, 2);
    await publish(snap(false, ['contact'], 2));
    // the older grant event is delivered LAST (re-queued): it must still report the withdrawal
    await redis.xadd(STREAM, '*', ...Object.entries(encodeEventEnvelope({ ...e1, eventId: 'late-copy-of-e1' })).flat());
    await tick();
    for (const r of received) expect(r.consent).toEqual(snap(false, ['contact'], 2));
    expect(received.length).toBe(3);
  });

  it('the same event delivered twice reaches Klaros once; a lost ACK is not re-sent on reclaim', async () => {
    decide(A, 'contact', true, 1);
    const e = await publish(snap(true, ['contact'], 1));
    await redis.xadd(STREAM, '*', ...Object.entries(encodeEventEnvelope(e)).flat()); // duplicate entry, same id
    const realAck = redis.xack.bind(redis);
    redis.xack = async () => 0;
    await tick();
    redis.xack = realAck;
    redis.advance(BASE_MS);
    await tick();
    expect(received).toHaveLength(1);
  });

  it('a read error is retried (not skipped, not sent stale) and the retry delivers the current state', async () => {
    decide(A, 'contact', false, 2);
    await publish(snap(true, ['contact'], 1)); // the event still carries an old grant
    state.failReads = 1;
    await tick();
    expect(received).toHaveLength(0);
    redis.advance(BASE_MS);
    await tick();
    expect(received).toHaveLength(1);
    expect(received[0].consent).toEqual(snap(false, ['contact'], 2));
  });

  it('a database that stays down: bounded retries, then the dead-letter stream; never delivered stale', async () => {
    decide(A, 'contact', false, 2);
    await publish(snap(true, ['contact'], 1));
    state.failReads = 1000;
    for (let i = 0; i < 8; i++) { await tick({ maxRetries: 3 }); redis.advance(8000); }
    expect(received).toHaveLength(0);
    const dlq = (await redis.xrange(DLQ_STREAM_KEY)).map(([, f]) => decodeEventEnvelope(f));
    expect(dlq).toHaveLength(1);
    expect(dlq[0]!.tenantId).toBe(A);
  });

  it('tenant isolation: another tenant\'s decisions for the same lead id never appear in this tenant\'s event', async () => {
    decide(B, 'store_medical_information', true, 5);
    decide(A, 'contact', true, 1);
    await publish(snap(true, ['contact'], 1));
    await tick();
    expect(received[0].consent).toEqual(snap(true, ['contact'], 1));
  });
});
