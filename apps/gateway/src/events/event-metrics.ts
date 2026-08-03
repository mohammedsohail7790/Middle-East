import type { Redis } from 'ioredis';
import { DLQ_STREAM_KEY } from '../../../../infrastructure/events/event-types.js';
import { allPlatformStreams } from '../../../../infrastructure/events/event-router.js';
import { getEventBusMetrics } from './platform-event-bus.js';

export async function collectStreamDiagnostics(redis: Redis): Promise<{
  streams: Record<string, number>;
  dlqDepth: number;
  bus: ReturnType<typeof getEventBusMetrics>;
}> {
  const streams: Record<string, number> = {};
  for (const key of allPlatformStreams()) {
    try {
      streams[key] = await redis.xlen(key);
    } catch {
      streams[key] = -1;
    }
  }
  let dlqDepth = 0;
  try {
    dlqDepth = await redis.xlen(DLQ_STREAM_KEY);
  } catch {
    dlqDepth = -1;
  }
  return { streams, dlqDepth, bus: getEventBusMetrics() };
}
