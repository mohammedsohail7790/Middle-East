import type { Redis } from 'ioredis';
import { decodeEventEnvelope } from './event-codecs.js';
import { CONSUMER_GROUP, DLQ_STREAM_KEY } from './event-types.js';
import {
  claimEventForProcessing,
  getEventClaimState,
  markEventProcessed,
  releaseEventClaim,
} from './event-idempotency.js';
import { publishToDlq } from './dead-letter-queue.js';
import type { PlatformEvent } from './event-envelope.js';

export type EventHandler = (
  event: PlatformEvent,
  meta: {
    stream: string;
    messageId: string;
    consumer: string;
    /** True when a failure of this attempt sends the event to the DLQ. Lets an ordered handler avoid blocking later steps forever. */
    finalAttempt?: boolean;
  }
) => Promise<void>;

export interface ConsumerOptions {
  redis: Redis;
  streams: string[];
  consumerName: string;
  groupName?: string;
  /** Failed attempts before an event is moved to the DLQ. Env: P2_CONSUMER_MAX_RETRIES (default 5). */
  maxRetries?: number;
  blockMs?: number;
  /** Delay before the first retry of a failed entry; doubles per delivery. Env: P2_RETRY_BASE_DELAY_MS (default 10000). */
  retryBaseDelayMs?: number;
  /** Upper bound for the retry delay. Env: P2_RETRY_MAX_DELAY_MS (default 300000). */
  retryMaxDelayMs?: number;
  /** Max pending entries reclaimed per stream per pass. Env: P2_RECLAIM_BATCH (default 10). */
  reclaimBatchSize?: number;
  /** How many pending entries are inspected per pass (head-of-line protection). Env: P2_RECLAIM_SCAN (default 100). */
  reclaimScanSize?: number;
  /** Minimum time between reclaim passes per consumer+stream. Env: P2_RECLAIM_INTERVAL_MS (default 5000). */
  reclaimIntervalMs?: number;
  onTelemetry?: (
    kind: 'EVENT_CONSUMED' | 'EVENT_RETRY' | 'EVENT_DLQ',
    fields: Record<string, string | number | boolean | undefined>
  ) => void;
}

const RETRY_PREFIX = 'calliq:event:retry:';

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Exponential backoff keyed on how many times the entry has been delivered so far. */
export function retryDelayMs(deliveries: number, baseMs: number, maxMs: number): number {
  const exponent = Math.max(deliveries, 1) - 1;
  return Math.min(maxMs, baseMs * 2 ** Math.min(exponent, 30));
}

export async function ensureConsumerGroups(
  redis: Redis,
  streams: string[],
  groupName = CONSUMER_GROUP
): Promise<void> {
  for (const stream of streams) {
    try {
      await redis.xgroup('CREATE', stream, groupName, '0', 'MKSTREAM');
    } catch (err: unknown) {
      const msg = String((err as Error).message || err);
      if (!msg.includes('BUSYGROUP')) throw err;
    }
  }
  try {
    await redis.xgroup('CREATE', DLQ_STREAM_KEY, groupName, '0', 'MKSTREAM');
  } catch (err: unknown) {
    const msg = String((err as Error).message || err);
    if (!msg.includes('BUSYGROUP')) throw err;
  }
}

async function incrementRetry(redis: Redis, eventId: string): Promise<number> {
  const key = `${RETRY_PREFIX}${eventId}`;
  const n = await redis.incr(key);
  await redis.expire(key, 86400);
  return n;
}

interface ResolvedOptions {
  redis: Redis;
  consumerName: string;
  groupName: string;
  maxRetries: number;
  onTelemetry: ConsumerOptions['onTelemetry'];
}

/**
 * Handles one stream entry (freshly delivered or reclaimed). Returns true only
 * when the handler ran to completion. An entry is acked only when it is done
 * (handled, duplicate of an already-handled event, undecodable, or moved to
 * the DLQ); otherwise it stays pending so the reclaim pass can retry it.
 */
async function processEntry(
  ctx: ResolvedOptions,
  handler: EventHandler,
  streamName: string,
  messageId: string,
  fieldList: string[]
): Promise<boolean> {
  const { redis, groupName, consumerName, maxRetries, onTelemetry } = ctx;

  const event = decodeEventEnvelope(fieldList);
  if (!event) {
    await redis.xack(streamName, groupName, messageId);
    return false;
  }

  const claimed = await claimEventForProcessing(redis, event.eventId);
  if (!claimed) {
    const state = await getEventClaimState(redis, event.eventId);
    if (state === 'processed') {
      // Duplicate of an event that already completed — no second external effect.
      await redis.xack(streamName, groupName, messageId);
    }
    // 'processing': another worker owns it right now. Leave it pending; once
    // that worker finishes (or its claim TTL lapses) a later pass resolves it.
    return false;
  }

  const priorFailures = Number((await redis.get(`${RETRY_PREFIX}${event.eventId}`)) ?? 0);
  const started = Date.now();
  try {
    await handler(event, {
      stream: streamName,
      messageId,
      consumer: consumerName,
      finalAttempt: priorFailures + 1 >= maxRetries,
    });
    await markEventProcessed(redis, event.eventId);
    await redis.xack(streamName, groupName, messageId);
    onTelemetry?.('EVENT_CONSUMED', {
      eventId: event.eventId,
      eventType: event.eventType,
      tenantId: event.tenantId,
      consumer: consumerName,
      processingLatencyMs: Date.now() - started,
    });
    return true;
  } catch (err) {
    const retries = await incrementRetry(redis, event.eventId);
    const reason = err instanceof Error ? err.message : String(err);
    if (retries >= maxRetries) {
      await publishToDlq(redis, {
        event,
        consumer: consumerName,
        retryCount: retries,
        failureReason: reason,
        failedAt: new Date().toISOString(),
      });
      await markEventProcessed(redis, event.eventId);
      await redis.xack(streamName, groupName, messageId);
      onTelemetry?.('EVENT_DLQ', {
        eventId: event.eventId,
        eventType: event.eventType,
        tenantId: event.tenantId,
        consumer: consumerName,
        retryCount: retries,
        failureReason: reason,
      });
    } else {
      await releaseEventClaim(redis, event.eventId);
      onTelemetry?.('EVENT_RETRY', {
        eventId: event.eventId,
        eventType: event.eventType,
        tenantId: event.tenantId,
        consumer: consumerName,
        retryCount: retries,
        failureReason: reason,
      });
    }
    return false;
  }
}

const lastReclaimAt = new Map<string, number>();

type PendingRow = { id: string; idleMs: number; deliveries: number };

function parsePending(raw: unknown): PendingRow[] {
  if (!Array.isArray(raw)) return [];
  const rows: PendingRow[] = [];
  for (const entry of raw) {
    if (!Array.isArray(entry) || entry.length < 4) continue;
    rows.push({ id: String(entry[0]), idleMs: Number(entry[2]), deliveries: Number(entry[3]) });
  }
  return rows;
}

/**
 * Retries entries that were delivered but never acked (failed handler, crashed
 * worker). An entry is only eligible once it has been idle for its backoff
 * delay, and XCLAIM is issued with that same delay as min-idle-time, so Redis
 * itself guarantees only one worker wins a given entry per backoff window.
 */
async function reclaimPending(
  ctx: ResolvedOptions,
  handler: EventHandler,
  streams: string[],
  cfg: { baseMs: number; maxMs: number; batch: number; scan: number; intervalMs: number }
): Promise<number> {
  const { redis, groupName, consumerName } = ctx;
  let processed = 0;

  for (const stream of streams) {
    const throttleKey = `${groupName}|${consumerName}|${stream}`;
    const now = Date.now();
    const last = lastReclaimAt.get(throttleKey) ?? 0;
    if (cfg.intervalMs > 0 && now - last < cfg.intervalMs) continue;
    lastReclaimAt.set(throttleKey, now);

    const pending = parsePending(await (redis as any).xpending(stream, groupName, '-', '+', cfg.scan));
    const eligible = pending
      .filter((p) => p.idleMs >= retryDelayMs(p.deliveries, cfg.baseMs, cfg.maxMs))
      .slice(0, cfg.batch);

    for (const row of eligible) {
      const minIdle = retryDelayMs(row.deliveries, cfg.baseMs, cfg.maxMs);
      const claimed = (await (redis as any).xclaim(stream, groupName, consumerName, minIdle, row.id)) as
        | Array<[string, string[] | null]>
        | null;
      if (!claimed || claimed.length === 0) continue; // another worker won the claim

      for (const [messageId, fields] of claimed) {
        if (!fields) {
          // Entry was trimmed from the stream while pending — nothing left to retry.
          await redis.xack(stream, groupName, messageId);
          continue;
        }
        if (await processEntry(ctx, handler, stream, messageId, fields)) processed++;
      }
    }
  }
  return processed;
}

export async function readAndProcessBatch(opts: ConsumerOptions, handler: EventHandler): Promise<number> {
  const {
    redis,
    streams,
    consumerName,
    groupName = CONSUMER_GROUP,
    maxRetries = envNumber('P2_CONSUMER_MAX_RETRIES', 5),
    blockMs = 2000,
    onTelemetry,
  } = opts;

  if (!streams.length) return 0;

  const ctx: ResolvedOptions = { redis, consumerName, groupName, maxRetries, onTelemetry };

  let processed = await reclaimPending(ctx, handler, streams, {
    baseMs: opts.retryBaseDelayMs ?? envNumber('P2_RETRY_BASE_DELAY_MS', 10_000),
    maxMs: opts.retryMaxDelayMs ?? envNumber('P2_RETRY_MAX_DELAY_MS', 300_000),
    batch: opts.reclaimBatchSize ?? envNumber('P2_RECLAIM_BATCH', 10),
    scan: opts.reclaimScanSize ?? envNumber('P2_RECLAIM_SCAN', 100),
    intervalMs: opts.reclaimIntervalMs ?? envNumber('P2_RECLAIM_INTERVAL_MS', 5000),
  });

  const args: (string | number)[] = ['GROUP', groupName, consumerName, 'COUNT', 10, 'BLOCK', blockMs, 'STREAMS'];
  for (const s of streams) args.push(s);
  for (let i = 0; i < streams.length; i++) args.push('>');

  // ioredis typings are strict; runtime args match Redis XREADGROUP
  const raw = await (redis as any).xreadgroup(...args);
  if (!raw) return processed;

  for (const [streamName, messages] of raw as [string, [string, string[]][]][]) {
    for (const [messageId, fieldList] of messages) {
      if (await processEntry(ctx, handler, streamName, messageId, fieldList)) processed++;
    }
  }
  return processed;
}
