import type { Redis } from 'ioredis';
import type { PlatformEvent } from './event-envelope.js';
import { DLQ_STREAM_KEY } from './event-types.js';
import { encodeEventEnvelope } from './event-codecs.js';

export interface DlqEntry {
  event: PlatformEvent;
  consumer: string;
  retryCount: number;
  failureReason: string;
  failedAt: string;
}

export async function publishToDlq(
  redis: Redis,
  entry: DlqEntry
): Promise<string | null> {
  const payload: PlatformEvent = {
    ...entry.event,
    payload: {
      ...entry.event.payload,
      _dlq: {
        consumer: entry.consumer,
        retryCount: entry.retryCount,
        failureReason: entry.failureReason,
        failedAt: entry.failedAt,
      },
    },
  };
  const id = await redis.xadd(
    DLQ_STREAM_KEY,
    'MAXLEN',
    '~',
    String(process.env.P2_DLQ_MAXLEN || 5000),
    '*',
    ...Object.entries(encodeEventEnvelope(payload)).flat()
  );
  return typeof id === 'string' ? id : null;
}
