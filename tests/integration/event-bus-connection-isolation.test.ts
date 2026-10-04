/**
 * Event bus connection isolation + tick re-entrancy (infrastructure/events/event-bus.ts).
 *
 * A Redis connection serves one command at a time, so publishing on the connection that is parked in a blocking
 * XREADGROUP made every publish wait behind the blocked reads (measured: 3,070 ms at 3 s, 14,202 ms at 10 s,
 * still pending at 20 s). The bus now publishes on a dedicated connection and runs one poll tick at a time.
 *
 * REAL-Redis half: needs Redis >= 5 AND REDIS_URL set explicitly (it uses the real `calliq:stream:*` stream names,
 * so it must only ever point at a throwaway instance); it skips otherwise. The re-entrancy/shutdown-ordering half
 * runs against the in-memory fake everywhere.
 */
import { describe, it, expect, afterAll } from 'vitest';
import Redis from 'ioredis';
import { FakeRedisStreams } from '../helpers/fake-redis-streams.js';
import { RedisPlatformEventBus } from '../../infrastructure/events/event-bus.js';
import { streamKey, DLQ_STREAM_KEY } from '../../infrastructure/events/event-types.js';
import { allPlatformStreams } from '../../infrastructure/events/event-router.js';
import { decodeEventEnvelope } from '../../infrastructure/events/event-codecs.js';

const EXPLICIT_REDIS_URL = process.env.REDIS_URL;
const REDIS_URL = EXPLICIT_REDIS_URL || 'redis://127.0.0.1:6379';
const TEST_DB = 15; // own logical DB: this test uses the real calliq:stream:* names, so it must not share a keyspace with other suites
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function detectStreamsSupport(): Promise<boolean> {
  if (!EXPLICIT_REDIS_URL) return false;
  const probe = new Redis(REDIS_URL, { db: TEST_DB, maxRetriesPerRequest: 1, connectTimeout: 3000, lazyConnect: true });
  try {
    await probe.connect();
    const info = await probe.info('server');
    const m = info.match(/redis_version:(\d+)\./);
    return Boolean(m && Number(m[1]) >= 5);
  } catch {
    return false;
  } finally {
    await probe.quit().catch(() => {});
  }
}

const realRedis = await detectStreamsSupport();
if (!realRedis) {
  // eslint-disable-next-line no-console
  console.warn('EVENT_BUS_ISOLATION_REAL_REDIS_SKIPPED: set REDIS_URL to a throwaway Redis >= 5 to run the connection-isolation tests.');
}

/** Registers the same consumers as apps/gateway/src/events/consumers/index.ts, recording what each saw for `tenant`. */
function registerProductionConsumers(bus: RedisPlatformEventBus, tenant: string, klarosGroup: string) {
  const seen: Record<string, number> = { analytics: 0, notifications: 0, lead: 0, appointment: 0, klaros: 0 };
  const rec = (key: string) => async (event: { tenantId: string }) => {
    if (event.tenantId === tenant) seen[key]++;
  };
  bus.registerConsumer('analytics', [streamKey('analytics-events')], rec('analytics'));
  bus.registerConsumer('notifications', [streamKey('call-events')], rec('notifications'));
  bus.registerConsumer('lead', [streamKey('lead-events')], rec('lead'));
  bus.registerConsumer('appointment', [streamKey('appointment-events')], rec('appointment'));
  bus.registerConsumer(
    'klaros-webhook',
    [streamKey('call-events'), streamKey('lead-events'), streamKey('appointment-events')],
    rec('klaros'),
    { groupName: klarosGroup }
  );
  return seen;
}

describe.skipIf(!realRedis)('event bus connection isolation — REAL Redis', () => {
  const tenant = `iso-${RUN}`;
  const klarosGroup = `calliq-klaros-iso-${RUN}`;
  const owned: Redis[] = [];
  const mk = () => {
    const c = new Redis(REDIS_URL, { db: TEST_DB, maxRetriesPerRequest: 3, connectTimeout: 5000 });
    owned.push(c);
    return c;
  };

  afterAll(async () => {
    const cleaner = new Redis(REDIS_URL, { db: TEST_DB, maxRetriesPerRequest: 3, connectTimeout: 5000 });
    // Remove only what this test published, and only the consumer group it created.
    for (const stream of allPlatformStreams()) {
      const entries = await cleaner.xrange(stream, '-', '+').catch(() => []);
      for (const [id, fields] of entries) if (decodeEventEnvelope(fields)?.tenantId === tenant) await cleaner.xdel(stream, id).catch(() => {});
      await cleaner.xgroup('DESTROY', stream, klarosGroup).catch(() => {});
    }
    const dlq = await cleaner.xrange(DLQ_STREAM_KEY, '-', '+').catch(() => []);
    for (const [id, fields] of dlq) if (decodeEventEnvelope(fields)?.tenantId === tenant) await cleaner.xdel(DLQ_STREAM_KEY, id).catch(() => {});
    await cleaner.quit().catch(() => {});
    owned.forEach((c) => c.disconnect());
  });

  it('publisher and consumer use different Redis connections (distinct CLIENT IDs)', async () => {
    const consumer = mk();
    const publisher = mk();
    const bus = new RedisPlatformEventBus({ redis: consumer, publisherRedis: publisher });

    expect(bus.getRedis()).toBe(publisher);
    expect(bus.getConsumerRedis()).toBe(consumer);
    expect(bus.getRedis()).not.toBe(bus.getConsumerRedis());
    expect(await publisher.call('CLIENT', 'ID')).not.toEqual(await consumer.call('CLIENT', 'ID'));
    await bus.shutdown();
  });

  it('production-like: consumers park in blocking reads, yet publishing stays fast, the event is consumed by every group, and shutdown closes both clients', async () => {
    const consumer = mk();
    const publisher = mk();
    const observer = mk(); // inspects CLIENT LIST without sharing either bus connection
    const bus = new RedisPlatformEventBus({ redis: consumer, publisherRedis: publisher });
    const seen = registerProductionConsumers(bus, tenant, klarosGroup);

    void bus.start();
    const startedAt = Date.now();

    // Publish at several moments while the consumer is repeatedly blocked; every publish must stay quick.
    const latencies: number[] = [];
    let sawBlockedRead = false;
    let published = false;
    for (const atSec of [2, 5, 8, 11]) {
      await sleep(Math.max(0, atSec * 1000 - (Date.now() - startedAt)));
      const list = String(await observer.client('LIST'));
      if (/flags=b\b[^\n]*cmd=xreadgroup/.test(list)) sawBlockedRead = true;
      const t0 = Date.now();
      await bus.publish('LEAD_CREATED' as any, { n: atSec }, { tenantId: tenant });
      latencies.push(Date.now() - t0);
      published = true;
    }
    expect(published).toBe(true);
    expect(sawBlockedRead).toBe(true); // the arrangement really was "consumer blocked"
    // Bounded: before the fix these were 3,070 / 14,202 / >15,000 ms and growing; now they are a few ms.
    expect(Math.max(...latencies)).toBeLessThan(500);

    // Consumers still process: the event reaches the default-group lead consumer AND the independent Klaros group.
    const deadline = Date.now() + 25_000;
    while (Date.now() < deadline && (seen.lead < 4 || seen.klaros < 4)) await sleep(250);
    expect(seen.lead).toBe(4);
    expect(seen.klaros).toBe(4);
    expect(seen.analytics + seen.appointment).toBe(0); // not routed to their streams

    await bus.shutdown();
    expect(consumer.status).toBe('end');
    expect(publisher.status).toBe('end');
  }, 90_000);
});

describe('event bus tick re-entrancy (in-memory fake)', () => {
  function instrumentedRedis(readMs: number) {
    const redis = new FakeRedisStreams();
    const state = { inFlight: 0, maxInFlight: 0, calls: 0 };
    (redis as any).xreadgroup = async () => {
      state.calls++;
      state.inFlight++;
      state.maxInFlight = Math.max(state.maxInFlight, state.inFlight);
      await sleep(readMs); // stands in for a blocking read that outlasts the poll interval
      state.inFlight--;
      return null;
    };
    return { redis, state };
  }

  it('never runs two poll ticks at once, even when a blocking read outlasts the poll interval', async () => {
    const previous = process.env.P2_CONSUMER_POLL_MS;
    process.env.P2_CONSUMER_POLL_MS = '10'; // fire the interval far faster than a "blocking read" completes
    try {
      const { redis, state } = instrumentedRedis(80);
      const bus = new RedisPlatformEventBus({ redis: redis as any });
      bus.registerConsumer('lead', ['calliq:stream:lead-events'], async () => {});
      void bus.start();
      await sleep(500);
      await bus.shutdown(1000);

      expect(state.calls).toBeGreaterThan(2); // polling keeps going (semantics preserved)...
      expect(state.maxInFlight).toBe(1); // ...but one read at a time, no stacking
    } finally {
      if (previous === undefined) delete process.env.P2_CONSUMER_POLL_MS;
      else process.env.P2_CONSUMER_POLL_MS = previous;
    }
  });

  it('stop() prevents any further blocking reads from starting', async () => {
    const previous = process.env.P2_CONSUMER_POLL_MS;
    process.env.P2_CONSUMER_POLL_MS = '10';
    try {
      const { redis, state } = instrumentedRedis(30);
      const bus = new RedisPlatformEventBus({ redis: redis as any });
      bus.registerConsumer('a', ['calliq:stream:lead-events'], async () => {});
      bus.registerConsumer('b', ['calliq:stream:call-events'], async () => {});
      void bus.start();
      await sleep(150);
      await bus.shutdown(1000);
      const callsAtShutdown = state.calls;
      await sleep(200);
      expect(state.calls).toBe(callsAtShutdown);
    } finally {
      if (previous === undefined) delete process.env.P2_CONSUMER_POLL_MS;
      else process.env.P2_CONSUMER_POLL_MS = previous;
    }
  });

  it('legacy single-client construction still works (publisherRedis is optional)', async () => {
    const redis = new FakeRedisStreams();
    const bus = new RedisPlatformEventBus({ redis: redis as any });
    expect(bus.getRedis()).toBe(bus.getConsumerRedis());
    const event = await bus.publish('LEAD_CREATED' as any, { n: 1 }, { tenantId: 't' });
    expect(event?.eventType).toBe('LEAD_CREATED');
  });
});
