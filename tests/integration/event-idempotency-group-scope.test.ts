/**
 * Consumer-group-scoped event idempotency (infrastructure/events/event-idempotency.ts).
 *
 * Regression for: the processed/claim key used to be `calliq:event:processed:<eventId>` — shared by every
 * consumer group — so the first group to claim an event starved all the others (e.g. the Klaros webhook
 * group behind the lead/notifications/appointment groups). Each group is an independent pipeline and must
 * process every event exactly once on its own.
 *
 * The same suite runs against the in-memory Streams fake (always) and against a REAL Redis >= 5 when one is
 * reachable via REDIS_URL (default redis://127.0.0.1:6379); the real-Redis run is the one that proves the
 * behaviour, the fake keeps it hermetic everywhere.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Redis from 'ioredis';
import { FakeRedisStreams } from '../helpers/fake-redis-streams.js';
import { createPlatformEvent } from '../../infrastructure/events/event-envelope.js';
import { encodeEventEnvelope, decodeEventEnvelope } from '../../infrastructure/events/event-codecs.js';
import { DLQ_STREAM_KEY } from '../../infrastructure/events/event-types.js';
import { ensureConsumerGroups, readAndProcessBatch } from '../../infrastructure/events/event-consumer.js';
import {
  claimEventForProcessing,
  getEventClaimState,
  isEventAlreadyProcessed,
  markEventProcessed,
  releaseEventClaim,
} from '../../infrastructure/events/event-idempotency.js';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function detectStreamsSupport(): Promise<boolean> {
  const probe = new Redis(REDIS_URL, { maxRetriesPerRequest: 1, connectTimeout: 3000, lazyConnect: true });
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

const realRedisAvailable = await detectStreamsSupport();
if (!realRedisAvailable) {
  // eslint-disable-next-line no-console
  console.warn('EVENT_IDEMPOTENCY_REAL_REDIS_SKIPPED: Redis >= 5 not reachable — only the in-memory fake ran.');
}

type Backend = { name: string; enabled: boolean; make: () => Promise<{ redis: any; cleanup: () => Promise<void> }> };

const backends: Backend[] = [
  {
    name: 'in-memory Streams fake',
    enabled: true,
    make: async () => ({ redis: new FakeRedisStreams(), cleanup: async () => {} }),
  },
  {
    name: 'REAL Redis',
    enabled: realRedisAvailable,
    make: async () => {
      const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 1, connectTimeout: 5000 });
      return { redis, cleanup: async () => void (await redis.quit().catch(() => {})) };
    },
  },
];

describe.each(backends)('group-scoped event idempotency — $name', ({ enabled, make, name }) => {
  const live = name.startsWith('REAL') ? RUN : 'fake';
  let redis: any;
  let cleanup: () => Promise<void>;
  const touchedKeys = new Set<string>();
  const touchedStreams = new Set<string>();
  let seq = 0;

  const eventId = () => `evt-${live}-${++seq}`;
  const group = (label: string) => `grp-${live}-${label}`;
  const track = (g: string, id: string) => touchedKeys.add(`calliq:event:processed:${g}:${id}`);

  async function publish(stream: string, id?: string) {
    const event = createPlatformEvent('LEAD_CREATED' as any, { n: 1 }, { tenantId: `tenant-${live}` });
    if (id) event.eventId = id;
    await redis.xadd(stream, '*', ...Object.entries(encodeEventEnvelope(event)).flat());
    return event;
  }

  const readerOpts = (stream: string, g: string, consumer = 'c1') => ({
    redis,
    streams: [stream],
    groupName: g,
    consumerName: consumer,
    maxRetries: 3,
    // BLOCK 0 means "forever" on a real Redis (the fake treats it as non-blocking), so use a short real block there.
    blockMs: live === 'fake' ? 0 : 50,
    retryBaseDelayMs: 100,
    retryMaxDelayMs: 100,
    reclaimIntervalMs: 0,
  });

  const newStream = (label: string) => {
    const s = `calliq:test:idem:${live}:${label}:${++seq}`;
    touchedStreams.add(s);
    return s;
  };

  beforeAll(async () => {
    if (!enabled) return;
    ({ redis, cleanup } = await make());
  });

  afterAll(async () => {
    if (!enabled) return;
    for (const s of touchedStreams) await redis.del(s).catch(() => {});
    for (const k of touchedKeys) await redis.del(k).catch(() => {});
    if (live !== 'fake') {
      // Remove only the DLQ entries these tests created (matched by their unique tenant id).
      const dlq = await redis.xrange(DLQ_STREAM_KEY, '-', '+').catch(() => []);
      for (const [id, fields] of dlq) if (decodeEventEnvelope(fields)?.tenantId === `tenant-${live}`) await redis.xdel(DLQ_STREAM_KEY, id).catch(() => {});
    }
    await cleanup();
  });

  const t = enabled ? it : it.skip;

  t('TEST 1: same event id + same group: first claim succeeds, second is rejected', async () => {
    const id = eventId();
    const g = group('one');
    track(g, id);
    expect(await claimEventForProcessing(redis, g, id)).toBe(true);
    expect(await claimEventForProcessing(redis, g, id)).toBe(false);
  });

  t('TEST 2: same event id + groups A and B: both claims succeed', async () => {
    const id = eventId();
    const a = group('A');
    const b = group('B');
    track(a, id);
    track(b, id);
    expect(await claimEventForProcessing(redis, a, id)).toBe(true);
    expect(await claimEventForProcessing(redis, b, id)).toBe(true);
    expect(await claimEventForProcessing(redis, a, id)).toBe(false); // each group still dedupes itself
    expect(await claimEventForProcessing(redis, b, id)).toBe(false);
  });

  t('TEST 3: same event id + three independent groups: all three claim independently', async () => {
    const id = eventId();
    const groups = ['x', 'y', 'z'].map(group);
    groups.forEach((g) => track(g, id));
    const results = [];
    for (const g of groups) results.push(await claimEventForProcessing(redis, g, id));
    expect(results).toEqual([true, true, true]);
  });

  t('TEST 5: unrelated idempotency behaviour is unchanged (state machine, release, independence of ids)', async () => {
    const id1 = eventId();
    const id2 = eventId();
    const g = group('state');
    track(g, id1);
    track(g, id2);

    expect(await getEventClaimState(redis, g, id1)).toBe('none');
    expect(await claimEventForProcessing(redis, g, id1)).toBe(true);
    expect(await getEventClaimState(redis, g, id1)).toBe('processing');

    await releaseEventClaim(redis, g, id1); // a 'processing' claim is released...
    expect(await getEventClaimState(redis, g, id1)).toBe('none');
    expect(await claimEventForProcessing(redis, g, id1)).toBe(true);

    await markEventProcessed(redis, g, id1);
    expect(await isEventAlreadyProcessed(redis, g, id1)).toBe(true);
    expect(await getEventClaimState(redis, g, id1)).toBe('processed');
    await releaseEventClaim(redis, g, id1); // ...but a 'processed' marker is NOT
    expect(await getEventClaimState(redis, g, id1)).toBe('processed');
    expect(await claimEventForProcessing(redis, g, id1)).toBe(false);

    // A different event id in the same group is unaffected.
    expect(await claimEventForProcessing(redis, g, id2)).toBe(true);
  });

  t('processed marker is also group-scoped: group A done does not mark group B done', async () => {
    const id = eventId();
    const a = group('doneA');
    const b = group('doneB');
    track(a, id);
    track(b, id);
    await markEventProcessed(redis, a, id);
    expect(await isEventAlreadyProcessed(redis, a, id)).toBe(true);
    expect(await isEventAlreadyProcessed(redis, b, id)).toBe(false);
    expect(await claimEventForProcessing(redis, b, id)).toBe(true);
  });

  t('TEST 4: duplicate delivery within the same group runs the handler only once', async () => {
    const stream = newStream('dup');
    const g = group('dup');
    await ensureConsumerGroups(redis, [stream], g);
    const event = await publish(stream);
    track(g, event.eventId);
    await publish(stream, event.eventId); // same event id delivered a second time

    let calls = 0;
    await readAndProcessBatch(readerOpts(stream, g), async () => {
      calls++;
    });
    expect(calls).toBe(1);
  });

  // ---- retry counter: scoped per consumer group, like the idempotency marker -------------------------------------

  /** Moves past the (100 ms) retry backoff so a failed, still-pending entry is eligible for reclaim. */
  const pastBackoff = async () => {
    if (live === 'fake') redis.advance(150);
    else await sleep(180);
  };
  const retryKey = (g: string, id: string) => `calliq:event:retry:${g}:${id}`;
  const retryCount = async (g: string, id: string) => Number((await redis.get(retryKey(g, id))) ?? 0);
  const failing = (flags?: boolean[]) => async (_e: unknown, meta: { finalAttempt?: boolean }) => {
    flags?.push(Boolean(meta.finalAttempt));
    throw new Error('handler failure');
  };

  /** One event on a fresh stream with two independent groups attached. */
  async function twoGroups(label: string) {
    const stream = newStream(label);
    const a = group(`${label}A`);
    const b = group(`${label}B`);
    await ensureConsumerGroups(redis, [stream], a);
    await ensureConsumerGroups(redis, [stream], b);
    const event = await publish(stream);
    for (const g of [a, b]) {
      track(g, event.eventId);
      touchedKeys.add(retryKey(g, event.eventId));
    }
    return { stream, a, b, event };
  }
  const opts = (stream: string, g: string, maxRetries: number) => ({ ...readerOpts(stream, g), maxRetries });
  const dlqFor = async (eventId: string) =>
    (await redis.xrange(DLQ_STREAM_KEY, '-', '+')).map(([, f]: [string, string[]]) => decodeEventEnvelope(f)).filter((e: any) => e?.eventId === eventId);

  t('RETRY 1: same event + same group: the retry counter increments normally and is stored under the group-scoped key', async () => {
    const { stream, a, event } = await twoGroups('r1');
    for (let attempt = 1; attempt <= 3; attempt++) {
      await readAndProcessBatch(opts(stream, a, 5), failing());
      expect(await retryCount(a, event.eventId)).toBe(attempt);
      await pastBackoff();
    }
    expect(await redis.get(`calliq:event:retry:${event.eventId}`)).toBeNull(); // the old, unscoped key is no longer written
  });

  t('RETRY 2: same event + different groups: retry counts are independent', async () => {
    const { stream, a, b, event } = await twoGroups('r2');
    await readAndProcessBatch(opts(stream, a, 5), failing());
    await pastBackoff();
    await readAndProcessBatch(opts(stream, a, 5), failing());
    await readAndProcessBatch(opts(stream, b, 5), failing());

    expect(await retryCount(a, event.eventId)).toBe(2);
    expect(await retryCount(b, event.eventId)).toBe(1); // before the fix this would have been 3 (shared)
  });

  t("RETRY 3: group A reaching finalAttempt does not make group B's attempt final", async () => {
    const { stream, a, b, event } = await twoGroups('r3');
    const aFlags: boolean[] = [];
    const bFlags: boolean[] = [];
    await readAndProcessBatch(opts(stream, a, 2), failing(aFlags)); // A attempt 1: not final
    await pastBackoff();
    await readAndProcessBatch(opts(stream, a, 2), failing(aFlags)); // A attempt 2: final (and then DLQ)
    expect(aFlags).toEqual([false, true]);

    await readAndProcessBatch(opts(stream, b, 2), failing(bFlags)); // B's FIRST attempt
    expect(bFlags).toEqual([false]); // not final: B has had no failures of its own
    expect(await retryCount(b, event.eventId)).toBe(1);
  });

  t('RETRY 4: group A entering the DLQ does not exhaust group B: B still runs, keeps its own budget and reaches the DLQ only on its own failures', async () => {
    const { stream, a, b, event } = await twoGroups('r4');
    await readAndProcessBatch(opts(stream, a, 2), failing());
    await pastBackoff();
    await readAndProcessBatch(opts(stream, a, 2), failing()); // A exhausted -> DLQ
    expect(await dlqFor(event.eventId)).toHaveLength(1);

    let bRuns = 0;
    await readAndProcessBatch(opts(stream, b, 2), async () => {
      bRuns++;
      throw new Error('B failure 1');
    });
    expect(bRuns).toBe(1); // B was not skipped as "already processed/exhausted" because of A
    expect(await dlqFor(event.eventId)).toHaveLength(1); // still only A's entry

    await pastBackoff();
    await readAndProcessBatch(opts(stream, b, 2), async () => {
      bRuns++;
      throw new Error('B failure 2');
    });
    expect(bRuns).toBe(2);
    expect(await dlqFor(event.eventId)).toHaveLength(2); // B's own exhaustion, independent of A's
  });

  t('RETRY 5: a transient failure still recovers within one group exactly as before (retry, then success, no DLQ)', async () => {
    const { stream, a, event } = await twoGroups('r5');
    let calls = 0;
    const flaky = async () => {
      if (++calls < 2) throw new Error('transient');
    };
    await readAndProcessBatch(opts(stream, a, 5), flaky);
    await pastBackoff();
    await readAndProcessBatch(opts(stream, a, 5), flaky);
    expect(calls).toBe(2);
    expect(await dlqFor(event.eventId)).toHaveLength(0);
  });

  t('TEST 6: one event reaches every intended consumer group (the Klaros-group regression)', async () => {
    const stream = newStream('fanout');
    const groups = { lead: group('lead'), notifications: group('notif'), klaros: group('klaros') };
    for (const g of Object.values(groups)) await ensureConsumerGroups(redis, [stream], g);
    const event = await publish(stream);
    for (const g of Object.values(groups)) track(g, event.eventId);

    const seen: Record<string, number> = { lead: 0, notifications: 0, klaros: 0 };
    // Same order as production: the Klaros group is registered (and therefore polled) LAST.
    for (const [label, g] of Object.entries(groups)) {
      await readAndProcessBatch(readerOpts(stream, g, `w-${label}`), async () => {
        seen[label]++;
      });
    }
    expect(seen).toEqual({ lead: 1, notifications: 1, klaros: 1 });

    // A second poll of every group must not re-run anything.
    for (const [label, g] of Object.entries(groups)) {
      await readAndProcessBatch(readerOpts(stream, g, `w-${label}`), async () => {
        seen[label]++;
      });
    }
    expect(seen).toEqual({ lead: 1, notifications: 1, klaros: 1 });
  });
});
