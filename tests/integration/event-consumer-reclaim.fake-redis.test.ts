/**
 * Deterministic tests of the platform event consumer's retry / pending-reclaim
 * / DLQ behaviour against an in-memory Redis Streams FAKE (tests/helpers).
 *
 * ENVIRONMENT-BLOCKED REAL-REDIS VALIDATION: this machine's Redis is v3.0.504
 * (no Streams) and Docker is down, so these do NOT prove behaviour against a
 * live Redis. The real-Redis equivalent lives in klaros-event-retry-dlq.test.ts
 * and skips automatically unless Redis >= 5 is reachable.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { FakeRedisStreams } from '../helpers/fake-redis-streams.js';
import { createPlatformEvent } from '../../infrastructure/events/event-envelope.js';
import { encodeEventEnvelope, decodeEventEnvelope } from '../../infrastructure/events/event-codecs.js';
import {
  ensureConsumerGroups,
  readAndProcessBatch,
  retryDelayMs,
  type ConsumerOptions,
} from '../../infrastructure/events/event-consumer.js';
import { DLQ_STREAM_KEY } from '../../infrastructure/events/event-types.js';

const STREAM = 'test:stream';
const GROUP = 'test-group';
const BASE_MS = 1000;
const MAX_MS = 8000;

describe('platform event consumer — retry / reclaim / DLQ (fake Redis Streams)', () => {
  let redis: FakeRedisStreams;
  let telemetry: Array<{ kind: string; fields: Record<string, unknown> }>;

  const opts = (consumerName: string, extra: Partial<ConsumerOptions> = {}): ConsumerOptions => ({
    redis: redis as any,
    streams: [STREAM],
    groupName: GROUP,
    consumerName,
    maxRetries: 3,
    blockMs: 0,
    retryBaseDelayMs: BASE_MS,
    retryMaxDelayMs: MAX_MS,
    reclaimIntervalMs: 0,
    onTelemetry: (kind, fields) => telemetry.push({ kind, fields }),
    ...extra,
  });

  async function publish(eventId?: string) {
    const event = createPlatformEvent('CALL_ENDED' as any, { n: 1 }, { tenantId: 'tenant-1' });
    if (eventId) event.eventId = eventId;
    await redis.xadd(STREAM, '*', ...Object.entries(encodeEventEnvelope(event)).flat());
    return event;
  }

  beforeEach(async () => {
    redis = new FakeRedisStreams();
    telemetry = [];
    await ensureConsumerGroups(redis as any, [STREAM], GROUP);
  });

  it('computes exponential backoff capped at the max delay', () => {
    expect(retryDelayMs(1, 1000, 8000)).toBe(1000);
    expect(retryDelayMs(2, 1000, 8000)).toBe(2000);
    expect(retryDelayMs(3, 1000, 8000)).toBe(4000);
    expect(retryDelayMs(4, 1000, 8000)).toBe(8000);
    expect(retryDelayMs(10, 1000, 8000)).toBe(8000);
  });

  it('1+8: a successful first delivery is handled once and ACKed', async () => {
    await publish();
    let calls = 0;
    await readAndProcessBatch(opts('c1'), async () => {
      calls++;
    });

    expect(calls).toBe(1);
    expect(redis.pendingCount(STREAM, GROUP)).toBe(0);
    expect(telemetry.map((t) => t.kind)).toEqual(['EVENT_CONSUMED']);
  });

  it('2+3: a failed delivery stays pending with its retry counted', async () => {
    const event = await publish();
    await readAndProcessBatch(opts('c1'), async () => {
      throw new Error('klaros down');
    });

    expect(redis.pendingCount(STREAM, GROUP)).toBe(1);
    expect(await redis.get(`calliq:event:retry:${GROUP}:${event.eventId}`)).toBe('1');
    expect(telemetry.map((t) => t.kind)).toEqual(['EVENT_RETRY']);
  });

  it('does not hot-loop: a pending entry is not retried before its backoff delay', async () => {
    await publish();
    let calls = 0;
    const failing = async () => {
      calls++;
      throw new Error('boom');
    };
    await readAndProcessBatch(opts('c1'), failing);
    redis.advance(BASE_MS - 1);
    await readAndProcessBatch(opts('c1'), failing);
    await readAndProcessBatch(opts('c1'), failing);

    expect(calls).toBe(1);
  });

  it('4+5+6: reclaims after the delay, preserves the event id, succeeds on retry and ACKs', async () => {
    const event = await publish('evt-fixed-id');
    const seenIds: string[] = [];
    let attempt = 0;
    const flaky = async (e: { eventId: string }) => {
      seenIds.push(e.eventId);
      if (++attempt === 1) throw new Error('first attempt fails');
    };

    await readAndProcessBatch(opts('c1'), flaky);
    expect(await redis.get(`calliq:event:retry:${GROUP}:${event.eventId}`)).toBe('1');

    redis.advance(BASE_MS);
    await readAndProcessBatch(opts('c1'), flaky);

    expect(seenIds).toEqual(['evt-fixed-id', 'evt-fixed-id']);
    expect(redis.pendingCount(STREAM, GROUP)).toBe(0);
    expect(telemetry.map((t) => t.kind)).toEqual(['EVENT_RETRY', 'EVENT_CONSUMED']);
    // No further attempts once it has succeeded.
    redis.advance(MAX_MS * 5);
    await readAndProcessBatch(opts('c1'), flaky);
    expect(seenIds).toHaveLength(2);
  });

  it('backoff grows per failed delivery (1x, then 2x the base delay)', async () => {
    await publish();
    let calls = 0;
    const failing = async () => {
      calls++;
      throw new Error('boom');
    };
    await readAndProcessBatch(opts('c1', { maxRetries: 10 }), failing); // delivery 1
    redis.advance(BASE_MS);
    await readAndProcessBatch(opts('c1', { maxRetries: 10 }), failing); // delivery 2
    expect(calls).toBe(2);

    redis.advance(BASE_MS); // only 1x elapsed; delivery 2 needs 2x
    await readAndProcessBatch(opts('c1', { maxRetries: 10 }), failing);
    expect(calls).toBe(2);

    redis.advance(BASE_MS); // now 2x elapsed
    await readAndProcessBatch(opts('c1', { maxRetries: 10 }), failing);
    expect(calls).toBe(3);
  });

  it('7: a permanently failing event is bounded and lands in the DLQ with its reason', async () => {
    const event = await publish();
    let calls = 0;
    const failing = async () => {
      calls++;
      throw new Error('permanent failure');
    };

    for (let i = 0; i < 10; i++) {
      await readAndProcessBatch(opts('c1'), failing);
      redis.advance(MAX_MS);
    }

    expect(calls).toBe(3); // maxRetries, then never again
    expect(redis.pendingCount(STREAM, GROUP)).toBe(0);
    expect(await redis.get(`calliq:event:retry:${GROUP}:${event.eventId}`)).toBe('3');

    const dlq = (await redis.xrange(DLQ_STREAM_KEY)).map(([, f]) => decodeEventEnvelope(f));
    expect(dlq).toHaveLength(1);
    expect(dlq[0]!.eventId).toBe(event.eventId);
    expect((dlq[0]!.payload as any)._dlq).toMatchObject({ failureReason: 'permanent failure', retryCount: 3 });
    expect(telemetry.map((t) => t.kind)).toEqual(['EVENT_RETRY', 'EVENT_RETRY', 'EVENT_DLQ']);
  });

  it('9: the same event published twice produces one external effect', async () => {
    await publish('evt-dup');
    await publish('evt-dup');
    let effects = 0;
    await readAndProcessBatch(opts('c1'), async () => {
      effects++;
    });

    expect(effects).toBe(1);
    expect(redis.pendingCount(STREAM, GROUP)).toBe(0);
  });

  it('9b: a lost ACK (handled but still pending) is acked on reclaim without re-running the handler', async () => {
    await publish('evt-lost-ack');
    let effects = 0;
    const handler = async () => {
      effects++;
    };
    // Simulate: handler ran + marked processed, but the XACK never reached Redis.
    const realAck = redis.xack.bind(redis);
    redis.xack = async () => 0;
    await readAndProcessBatch(opts('c1'), handler);
    redis.xack = realAck;
    expect(redis.pendingCount(STREAM, GROUP)).toBe(1);

    redis.advance(BASE_MS);
    await readAndProcessBatch(opts('c1'), handler);

    expect(effects).toBe(1);
    expect(redis.pendingCount(STREAM, GROUP)).toBe(0);
  });

  it('10: two consumers racing for one pending entry process it exactly once', async () => {
    await publish();
    let calls = 0;
    const handler = async () => {
      calls++;
      if (calls === 1) throw new Error('first attempt fails');
    };
    await readAndProcessBatch(opts('worker-a'), handler);
    redis.advance(BASE_MS);

    await Promise.all([
      readAndProcessBatch(opts('worker-a'), handler),
      readAndProcessBatch(opts('worker-b'), handler),
    ]);

    expect(calls).toBe(2); // 1 original + exactly 1 retry
    expect(redis.pendingCount(STREAM, GROUP)).toBe(0);
  });

  it('10b: a still-running handler is not double-processed by another worker reclaiming it', async () => {
    await publish();
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const slow = async () => {
      calls++;
      await gate;
    };

    const inFlight = readAndProcessBatch(opts('worker-a'), slow);
    await Promise.resolve();
    await new Promise((r) => setImmediate(r));
    redis.advance(BASE_MS * 5);
    await readAndProcessBatch(opts('worker-b'), slow);

    expect(calls).toBe(1);
    expect(redis.pendingCount(STREAM, GROUP)).toBe(1); // left pending, not acked or dropped

    release();
    await inFlight;
    expect(redis.pendingCount(STREAM, GROUP)).toBe(0);
  });

  it('recovers an entry whose worker crashed mid-handler once the claim TTL lapses', async () => {
    const event = await publish();
    // Worker "crashed": entry delivered, claim left in place, never acked.
    await redis.xreadgroup('GROUP', GROUP, 'dead-worker', 'COUNT', 10, 'BLOCK', 0, 'STREAMS', STREAM, '>');
    await redis.set(`calliq:event:processed:${GROUP}:${event.eventId}`, 'processing', 'EX', 300, 'NX');

    let calls = 0;
    const handler = async () => {
      calls++;
    };
    redis.advance(BASE_MS);
    await readAndProcessBatch(opts('worker-b'), handler);
    expect(calls).toBe(0); // claim still held — must not run yet

    redis.advance(301_000);
    await readAndProcessBatch(opts('worker-b'), handler);
    expect(calls).toBe(1);
    expect(redis.pendingCount(STREAM, GROUP)).toBe(0);
  });

  it('tells the handler when a failure of this attempt would send the event to the DLQ (finalAttempt)', async () => {
    await publish();
    const flags: boolean[] = [];
    const failing = async (_e: unknown, meta: { finalAttempt?: boolean }) => {
      flags.push(Boolean(meta.finalAttempt));
      throw new Error('boom');
    };
    for (let i = 0; i < 4; i++) {
      await readAndProcessBatch(opts('c1'), failing as any); // maxRetries = 3
      redis.advance(MAX_MS);
    }
    expect(flags).toEqual([false, false, true]); // 3 attempts, the last one flagged, then nothing more
  });
});
