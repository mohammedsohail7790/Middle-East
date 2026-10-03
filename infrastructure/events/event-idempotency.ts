import type { Redis } from 'ioredis';

const PREFIX = 'calliq:event:processed:';
const DEFAULT_TTL_SEC = Number(process.env.P2_EVENT_IDEMPOTENCY_TTL_SEC || 604800);

export async function isEventAlreadyProcessed(
  redis: Redis,
  eventId: string
): Promise<boolean> {
  const key = `${PREFIX}${eventId}`;
  const v = await redis.get(key);
  return v === '1';
}

export async function markEventProcessed(
  redis: Redis,
  eventId: string,
  ttlSec = DEFAULT_TTL_SEC
): Promise<void> {
  const key = `${PREFIX}${eventId}`;
  await redis.set(key, '1', 'EX', ttlSec);
}

export async function claimEventForProcessing(
  redis: Redis,
  eventId: string,
  ttlSec = 300
): Promise<boolean> {
  const key = `${PREFIX}${eventId}`;
  const result = await redis.set(key, 'processing', 'EX', ttlSec, 'NX');
  return result === 'OK';
}

export type EventClaimState = 'processed' | 'processing' | 'none';

/** Distinguishes "already handled" from "another worker is handling it right now". */
export async function getEventClaimState(redis: Redis, eventId: string): Promise<EventClaimState> {
  const v = await redis.get(`${PREFIX}${eventId}`);
  if (v === '1') return 'processed';
  if (v === 'processing') return 'processing';
  return 'none';
}

export async function releaseEventClaim(redis: Redis, eventId: string): Promise<void> {
  const key = `${PREFIX}${eventId}`;
  const v = await redis.get(key);
  if (v === 'processing') await redis.del(key);
}
