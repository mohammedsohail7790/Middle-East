import type { Redis } from 'ioredis';
import { decodeEventEnvelope } from './event-codecs.js';
import { CONSUMER_GROUP, DLQ_STREAM_KEY } from './event-types.js';
import {
  claimEventForProcessing,
  markEventProcessed,
  releaseEventClaim,
} from './event-idempotency.js';
import { publishToDlq } from './dead-letter-queue.js';
import type { PlatformEvent } from './event-envelope.js';

export type EventHandler = (
  event: PlatformEvent,
  meta: { stream: string; messageId: string; consumer: string }
) => Promise<void>;

export interface ConsumerOptions {
  redis: Redis;
  streams: string[];
  consumerName: string;
  groupName?: string;
  maxRetries?: number;
  blockMs?: number;
  onTelemetry?: (
    kind: 'EVENT_CONSUMED' | 'EVENT_RETRY' | 'EVENT_DLQ',
    fields: Record<string, string | number | boolean | undefined>
  ) => void;
}

const RETRY_PREFIX = 'calliq:event:retry:';

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

async function getRetryCount(redis: Redis, eventId: string): Promise<number> {
  const v = await redis.get(`${RETRY_PREFIX}${eventId}`);
  return v ? Number(v) : 0;
}

async function incrementRetry(redis: Redis, eventId: string): Promise<number> {
  const key = `${RETRY_PREFIX}${eventId}`;
  const n = await redis.incr(key);
  await redis.expire(key, 86400);
  return n;
}

export async function readAndProcessBatch(opts: ConsumerOptions, handler: EventHandler): Promise<number> {
  const {
    redis,
    streams,
    consumerName,
    groupName = CONSUMER_GROUP,
    maxRetries = Number(process.env.P2_CONSUMER_MAX_RETRIES || 5),
    blockMs = 2000,
    onTelemetry,
  } = opts;

  if (!streams.length) return 0;

  const args: (string | number)[] = ['GROUP', groupName, consumerName, 'COUNT', 10, 'BLOCK', blockMs, 'STREAMS'];
  for (const s of streams) args.push(s);
  for (let i = 0; i < streams.length; i++) args.push('>');

  // ioredis typings are strict; runtime args match Redis XREADGROUP
  const raw = await (redis as any).xreadgroup(...args);
  if (!raw) return 0;

  let processed = 0;
  for (const [streamName, messages] of raw as [string, [string, string[]][]][]) {
    for (const [messageId, fieldList] of messages) {
      const event = decodeEventEnvelope(fieldList);
      if (!event) {
        await redis.xack(streamName, groupName, messageId);
        continue;
      }

      const claimed = await claimEventForProcessing(redis, event.eventId);
      if (!claimed) {
        await redis.xack(streamName, groupName, messageId);
        continue;
      }

      const started = Date.now();
      try {
        await handler(event, { stream: streamName, messageId, consumer: consumerName });
        await markEventProcessed(redis, event.eventId);
        await redis.xack(streamName, groupName, messageId);
        processed++;
        onTelemetry?.('EVENT_CONSUMED', {
          eventId: event.eventId,
          eventType: event.eventType,
          tenantId: event.tenantId,
          consumer: consumerName,
          processingLatencyMs: Date.now() - started,
        });
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
      }
    }
  }
  return processed;
}
