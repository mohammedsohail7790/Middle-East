/**
 * MEASUREMENT (not a pass/fail performance gate): publish latency while the bus's consumers are parked in
 * blocking XREADGROUP reads, for
 *   A) the LEGACY arrangement  — one Redis client shared by publish() and every consumer (no publisherRedis), and
 *   B) the CURRENT arrangement — a dedicated publisher connection (publisherRedis), as platform-event-bus.ts wires it.
 *
 * Mirrors production: the five registrations of consumers/index.ts, the default 1000 ms tick (P2_CONSUMER_POLL_MS)
 * and the 2000 ms BLOCK in readAndProcessBatch. Before the fix, A measured 3,070 ms at 3 s, 14,202 ms at 10 s and
 * "still pending after 15 s" at 20 s, versus 2–5 ms on a separate connection.
 *
 * OPT-IN ONLY: it uses the real `calliq:stream:*` names and deletes them afterwards, so it must only ever
 * point at a throwaway Redis. Run with:  RUN_EVENT_BUS_MEASURE=1 REDIS_URL=redis://127.0.0.1:6381 npx vitest run <this file> --reporter=verbose
 */
import { describe, it, expect } from 'vitest';
import Redis from 'ioredis';
import { RedisPlatformEventBus } from '../../infrastructure/events/event-bus.js';
import { allPlatformStreams } from '../../infrastructure/events/event-router.js';
import { streamKey } from '../../infrastructure/events/event-types.js';

const TEST_DB = 14; // own logical DB, never the default one
const OPT_IN = process.env.RUN_EVENT_BUS_MEASURE === '1';
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Latency of `fn`, or a marker string if it is still pending after capMs (the call is left running). */
async function timed(fn: () => Promise<unknown>, capMs: number): Promise<number | string> {
  const t0 = Date.now();
  return Promise.race([fn().then(() => Date.now() - t0), sleep(capMs).then(() => `still pending after ${capMs}ms`)]);
}

function registerProductionConsumers(bus: RedisPlatformEventBus): void {
  const noop = async () => {};
  // Same registrations as apps/gateway/src/events/consumers/index.ts
  bus.registerConsumer('analytics', [streamKey('analytics-events')], noop);
  bus.registerConsumer('notifications', [streamKey('call-events')], noop);
  bus.registerConsumer('lead', [streamKey('lead-events')], noop);
  bus.registerConsumer('appointment', [streamKey('appointment-events')], noop);
  bus.registerConsumer(
    'klaros-webhook',
    [streamKey('call-events'), streamKey('lead-events'), streamKey('appointment-events')],
    noop,
    { groupName: 'calliq-klaros-webhook' }
  );
}

async function clean(): Promise<void> {
  const cleaner = new Redis(REDIS_URL, { db: TEST_DB, maxRetriesPerRequest: 3, connectTimeout: 5000 });
  for (const s of allPlatformStreams()) await cleaner.del(s).catch(() => {});
  await cleaner.quit().catch(() => {});
}

async function scenario(label: string, dedicatedPublisher: boolean) {
  await clean();
  const consumer = new Redis(REDIS_URL, { db: TEST_DB, maxRetriesPerRequest: 3, connectTimeout: 5000 });
  const publisher = dedicatedPublisher ? new Redis(REDIS_URL, { db: TEST_DB, maxRetriesPerRequest: 3, connectTimeout: 5000 }) : undefined;
  const bus = new RedisPlatformEventBus({ redis: consumer, publisherRedis: publisher });
  registerProductionConsumers(bus);

  void bus.start(); // production starts it without awaiting the first (blocking) tick
  const startedAt = Date.now();
  const samples: Array<{ atSec: number; publishMs: number | string }> = [];
  for (const atSec of [3, 10, 20]) {
    await sleep(Math.max(0, atSec * 1000 - (Date.now() - startedAt)));
    const publishMs = await timed(() => bus.publish('LEAD_CREATED' as any, { n: atSec }, { tenantId: 'measure' }), 15_000);
    samples.push({ atSec, publishMs });
  }

  bus.stop();
  consumer.disconnect(); // hard-disconnect: a QUIT would queue behind the saturated legacy connection
  publisher?.disconnect();
  // eslint-disable-next-line no-console
  console.log(`EVENT_BUS_PUBLISH_LATENCY ${label} ${JSON.stringify(samples)}`);
  return samples;
}

describe.skipIf(!OPT_IN)('event bus publish latency while consumers block (measurement)', () => {
  it('prints publish latency for the legacy single-client and the current dedicated-publisher arrangement', async () => {
    const legacy = await scenario('LEGACY_SHARED_CLIENT', false);
    const current = await scenario('DEDICATED_PUBLISHER', true);
    await clean();
    expect(legacy).toHaveLength(3); // measurement only: the numbers printed above are the result
    expect(current).toHaveLength(3);
  }, 150_000);
});
