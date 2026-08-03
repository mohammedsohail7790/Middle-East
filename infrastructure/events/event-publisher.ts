import type { Redis } from 'ioredis';
import type { PlatformEvent } from './event-envelope.js';
import { encodeEventEnvelope } from './event-codecs.js';
import { routeEventToStream } from './event-router.js';

const MAXLEN = String(process.env.P2_STREAM_MAXLEN || 10000);

export async function publishToStream(
  redis: Redis,
  event: PlatformEvent
): Promise<string | null> {
  const stream = routeEventToStream(event.eventType);
  const fields = encodeEventEnvelope(event);
  const flat = Object.entries(fields).flat();
  const id = await redis.xadd(stream, 'MAXLEN', '~', MAXLEN, '*', ...flat);
  return typeof id === 'string' ? id : null;
}
