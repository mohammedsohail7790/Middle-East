/**
 * REAL-Redis test of the platform event consumer's retry / pending-reclaim /
 * DLQ behaviour (infrastructure/events/event-consumer.ts).
 *
 * ENVIRONMENT-BLOCKED on this machine: the local Redis is v3.0.504 (Streams
 * arrived in 5.0) and Docker is not running, so this suite skips here and has
 * NEVER been executed against a live Redis. It runs automatically wherever
 * Redis >= 5 is reachable via REDIS_URL (default redis://127.0.0.1:6379).
 * Deterministic coverage of the same logic against an in-memory fake lives in
 * event-consumer-reclaim.fake-redis.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Redis from 'ioredis';
import { createPlatformEvent } from '../../infrastructure/events/event-envelope.js';
import { encodeEventEnvelope, decodeEventEnvelope } from '../../infrastructure/events/event-codecs.js';
import { ensureConsumerGroups, readAndProcessBatch } from '../../infrastructure/events/event-consumer.js';
import { DLQ_STREAM_KEY } from '../../infrastructure/events/event-types.js';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const RUN = Date.now();
const TEST_STREAM = `calliq:test:klaros-retry:${RUN}`;
const TEST_GROUP = `calliq-test-klaros-retry-${RUN}`;
const TENANT = `tenant-retry-${RUN}`;

async function detectStreamsSupport(): Promise<boolean> {
  const probe = new Redis(REDIS_URL, { maxRetriesPerRequest: 1, connectTimeout: 3000, lazyConnect: true });
  try {
    await probe.connect();
    const info = await probe.info('server');
    const m = /redis_version:(\d+)\./.exec(info);
    return Boolean(m && Number(m[1]) >= 5);
  } catch {
    return false;
  } finally {
    await probe.quit().catch(() => {});
  }
}

const streamsSupported = await detectStreamsSupport();
if (!streamsSupported) {
  // eslint-disable-next-line no-console
  console.warn('KLAROS_RETRY_DLQ_REAL_REDIS_SKIPPED: Redis >= 5 not reachable — NOT VALIDATED (environment unavailable).');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!streamsSupported)('event consumer retry/reclaim/DLQ — real Redis Streams', () => {
  let redis: Redis;

  const opts = (consumerName: string, maxRetries = 3) => ({
    redis,
    streams: [TEST_STREAM],
    groupName: TEST_GROUP,
    consumerName,
    maxRetries,
    blockMs: 50,
    retryBaseDelayMs: 150,
    retryMaxDelayMs: 600,
    reclaimIntervalMs: 0,
  });

  async function publish(scenario: string) {
    const event = createPlatformEvent('CALL_ENDED' as any, { scenario }, { tenantId: TENANT });
    await redis.xadd(TEST_STREAM, '*', ...Object.entries(encodeEventEnvelope(event)).flat());
    return event;
  }

  const pendingCount = async () => {
    const summary = (await redis.xpending(TEST_STREAM, TEST_GROUP)) as [number, ...unknown[]];
    return Number(summary[0]);
  };

  beforeAll(async () => {
    redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 1, connectTimeout: 5000 });
    await ensureConsumerGroups(redis, [TEST_STREAM], TEST_GROUP);
  });

  afterAll(async () => {
    await redis.del(TEST_STREAM).catch(() => {});
    const dlq = await redis.xrange(DLQ_STREAM_KEY, '-', '+');
    for (const [id, fields] of dlq) {
      if (decodeEventEnvelope(fields)?.tenantId === TENANT) await redis.xdel(DLQ_STREAM_KEY, id);
    }
    await redis.quit();
  });

  it('a failed delivery becomes pending, is reclaimed after the delay, then succeeds and is ACKed', async () => {
    await publish('retry-then-succeed');
    let attempts = 0;
    const handler = async () => {
      if (++attempts < 2) throw new Error('transient');
    };

    await readAndProcessBatch(opts('c1'), handler);
    expect(attempts).toBe(1);
    expect(await pendingCount()).toBe(1);

    await readAndProcessBatch(opts('c1'), handler); // still inside the backoff window
    expect(attempts).toBe(1);

    await sleep(200);
    await readAndProcessBatch(opts('c1'), handler);
    expect(attempts).toBe(2);
    expect(await pendingCount()).toBe(0);
  });

  it('a permanently failing event is bounded and reaches the DLQ', async () => {
    await publish('always-fails');
    let attempts = 0;
    const handler = async () => {
      attempts++;
      throw new Error('permanent failure');
    };

    // Backoff is 150ms then 300ms, so three attempts fit in ~0.8s; the extra
    // passes prove nothing is retried again once the event is in the DLQ.
    for (let i = 0; i < 6; i++) {
      await readAndProcessBatch(opts('c1', 3), handler);
      await sleep(350);
    }

    expect(attempts).toBe(3);
    expect(await pendingCount()).toBe(0);
    const dlq = (await redis.xrange(DLQ_STREAM_KEY, '-', '+'))
      .map(([, f]) => decodeEventEnvelope(f))
      .filter((e) => e?.tenantId === TENANT && (e.payload as any).scenario === 'always-fails');
    expect(dlq).toHaveLength(1);
    expect((dlq[0]!.payload as any)._dlq.failureReason).toBe('permanent failure');
  }, 20_000);

  it('two consumers racing for one pending entry process it exactly once', async () => {
    await publish('race');
    let attempts = 0;
    const handler = async () => {
      if (++attempts === 1) throw new Error('first fails');
    };
    await readAndProcessBatch(opts('worker-a'), handler);
    await sleep(200);

    await Promise.all([readAndProcessBatch(opts('worker-a'), handler), readAndProcessBatch(opts('worker-b'), handler)]);

    expect(attempts).toBe(2);
    expect(await pendingCount()).toBe(0);
  });

  it('the same event published twice produces exactly one external effect and both entries are ACKed', async () => {
    const event = createPlatformEvent('CALL_ENDED' as any, { scenario: 'duplicate' }, { tenantId: TENANT });
    for (let i = 0; i < 2; i++) {
      await redis.xadd(TEST_STREAM, '*', ...Object.entries(encodeEventEnvelope(event)).flat());
    }
    let effects = 0;
    await readAndProcessBatch(opts('c1'), async () => {
      effects++;
    });

    expect(effects).toBe(1);
    expect(await pendingCount()).toBe(0);
  });

  it('a pending entry is visible in XPENDING with a delivery count, and its retry counter is persisted in Redis', async () => {
    const event = await publish('observe-pending');
    await readAndProcessBatch(opts('c1', 5), async () => {
      throw new Error('boom');
    });

    const rows = (await (redis as any).xpending(TEST_STREAM, TEST_GROUP, '-', '+', 10)) as Array<[string, string, number, number]>;
    expect(rows).toHaveLength(1);
    expect(rows[0][1]).toBe('c1'); // owner
    expect(Number(rows[0][3])).toBe(1); // delivered once so far
    expect(await redis.get(`calliq:event:retry:${event.eventId}`)).toBe('1');

    await sleep(200);
    await readAndProcessBatch(opts('c2', 5), async () => {
      throw new Error('boom again');
    });
    const after = (await (redis as any).xpending(TEST_STREAM, TEST_GROUP, '-', '+', 10)) as Array<[string, string, number, number]>;
    expect(after[0][1]).toBe('c2'); // ownership moved via XCLAIM
    expect(Number(after[0][3])).toBe(2); // delivery counter incremented by the claim
    expect(await redis.get(`calliq:event:retry:${event.eventId}`)).toBe('2');

    // clean up so later assertions on pendingCount stay exact
    for (const [id] of after) await redis.xack(TEST_STREAM, TEST_GROUP, id);
  });
});
