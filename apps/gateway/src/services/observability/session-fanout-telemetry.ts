import { voiceRedis } from '../voice/redis.client.js';
import { logger } from '../logger.js';
import { isValidationTelemetryEnabled } from './validation-telemetry.js';
import { correlationLogFields } from './correlation-context.js';

const FANOUT_PREFIX = 'v4_call_ws_fanout:';
const INTERVAL_PREFIX = 'v4_call_ws_intervals:';
const WINDOW_SEC = Number(process.env.V4_FANOUT_WINDOW_SEC || 300);
/** Ignore sub-millisecond overlap noise from clock/order jitter */
const OVERLAP_MIN_MS = Number(process.env.V4_OVERLAP_MIN_MS || 50);

type TransportInterval = {
  connectedAt: number;
  disconnectedAt: number | null;
};

const memoryFanout = new Map<string, { sessions: Set<string>; expiresAt: number }>();
const memoryIntervals = new Map<string, Map<string, TransportInterval>>();

function memoryRecordFanout(callSid: string, wsSessionId: string): number {
  const now = Date.now();
  let row = memoryFanout.get(callSid);
  if (!row || now > row.expiresAt) {
    row = { sessions: new Set(), expiresAt: now + WINDOW_SEC * 1000 };
    memoryFanout.set(callSid, row);
  }
  row.sessions.add(wsSessionId);
  return row.sessions.size;
}

function memoryGetIntervals(callSid: string): Map<string, TransportInterval> {
  let map = memoryIntervals.get(callSid);
  if (!map) {
    map = new Map();
    memoryIntervals.set(callSid, map);
  }
  return map;
}

function intervalOverlapMs(a: TransportInterval, b: TransportInterval, now: number): number {
  const aEnd = a.disconnectedAt ?? now;
  const bEnd = b.disconnectedAt ?? now;
  const start = Math.max(a.connectedAt, b.connectedAt);
  const end = Math.min(aEnd, bEnd);
  return Math.max(0, end - start);
}

function isSimultaneouslyActive(other: TransportInterval, atMs: number): boolean {
  return other.disconnectedAt === null || other.disconnectedAt > atMs;
}

function parseInterval(raw: string): TransportInterval | null {
  try {
    const row = JSON.parse(raw) as TransportInterval;
    if (typeof row.connectedAt !== 'number') return null;
    return {
      connectedAt: row.connectedAt,
      disconnectedAt:
        row.disconnectedAt === null || typeof row.disconnectedAt === 'number'
          ? row.disconnectedAt
          : null,
    };
  } catch {
    return null;
  }
}

async function loadIntervals(callSid: string): Promise<Map<string, TransportInterval>> {
  const key = `${INTERVAL_PREFIX}${callSid}`;
  try {
    const raw = await voiceRedis.hgetall(key);
    const map = new Map<string, TransportInterval>();
    for (const [wsSessionId, value] of Object.entries(raw)) {
      const row = parseInterval(value);
      if (row) map.set(wsSessionId, row);
    }
    return map;
  } catch {
    return memoryGetIntervals(callSid);
  }
}

async function persistInterval(
  callSid: string,
  wsSessionId: string,
  interval: TransportInterval
): Promise<void> {
  const key = `${INTERVAL_PREFIX}${callSid}`;
  const payload = JSON.stringify(interval);
  try {
    await voiceRedis.hset(key, wsSessionId, payload);
    await voiceRedis.expire(key, WINDOW_SEC);
  } catch {
    memoryGetIntervals(callSid).set(wsSessionId, interval);
  }
}

async function recordFanoutSet(callSid: string, wsSessionId: string): Promise<{
  count: number;
  sessionIds: string[];
}> {
  try {
    const key = `${FANOUT_PREFIX}${callSid}`;
    await voiceRedis.sadd(key, wsSessionId);
    await voiceRedis.expire(key, WINDOW_SEC);
    const count = await voiceRedis.scard(key);
    const sessionIds =
      count > 1 ? await voiceRedis.smembers(key) : [wsSessionId];
    return { count, sessionIds };
  } catch {
    const count = memoryRecordFanout(callSid, wsSessionId);
    const row = memoryFanout.get(callSid);
    return { count, sessionIds: row ? [...row.sessions] : [wsSessionId] };
  }
}

function logFanoutAnomaly(
  callSid: string,
  wsSessionId: string,
  count: number,
  sessionIds: string[]
): void {
  logger.warn('V4_SESSION_FANOUT_ANOMALY', {
    ...correlationLogFields({ callSid, wsSessionId }),
    uniqueWsSessionCount: count,
    wsSessionIds: sessionIds.slice(0, 10).join(','),
    windowSec: WINDOW_SEC,
    message:
      'Multiple WebSocket sessions for one callSid within window — may be benign sequential reconnects; check V4_SESSION_OVERLAP_ANOMALY',
  });
}

function logOverlapAnomaly(
  callSid: string,
  wsSessionId: string,
  connectedAt: number,
  otherWsSessionId: string,
  other: TransportInterval,
  overlapMs: number,
  now: number
): void {
  const otherEnd = other.disconnectedAt ?? now;
  logger.warn('V4_SESSION_OVERLAP_ANOMALY', {
    ...correlationLogFields({ callSid, wsSessionId }),
    otherWsSessionId,
    connectedAt,
    disconnectedAt: null,
    otherConnectedAt: other.connectedAt,
    otherDisconnectedAt: other.disconnectedAt,
    overlapMs,
    transportAgeMs: now - connectedAt,
    otherTransportAgeMs: otherEnd - other.connectedAt,
    simultaneouslyActive: true,
    windowSec: WINDOW_SEC,
    message:
      'Multiple WebSocket transports concurrently active for one callSid — precursor to split runtime authority',
  });
}

/**
 * Soak-only: fanout set + transport interval registry + simultaneous overlap detection.
 * Call on Twilio `start` with transport connectedAt from WS upgrade.
 */
export async function recordCallTransportBound(
  callSid: string,
  wsSessionId: string,
  connectedAt: number
): Promise<void> {
  if (!isValidationTelemetryEnabled() || !callSid || !wsSessionId) return;

  const now = Date.now();
  const { count, sessionIds } = await recordFanoutSet(callSid, wsSessionId);
  if (count > 1) {
    logFanoutAnomaly(callSid, wsSessionId, count, sessionIds);
  }

  const intervals = await loadIntervals(callSid);
  const current: TransportInterval = { connectedAt, disconnectedAt: null };

  for (const [otherWsSessionId, other] of intervals) {
    if (otherWsSessionId === wsSessionId) continue;
    if (!isSimultaneouslyActive(other, connectedAt)) continue;
    const overlapMs = intervalOverlapMs(current, other, now);
    if (overlapMs >= OVERLAP_MIN_MS) {
      logOverlapAnomaly(
        callSid,
        wsSessionId,
        connectedAt,
        otherWsSessionId,
        other,
        overlapMs,
        now
      );
    }
  }

  await persistInterval(callSid, wsSessionId, current);
}

/**
 * Soak-only: close transport interval for overlap window accounting.
 */
export async function recordCallTransportClosed(
  callSid: string,
  wsSessionId: string,
  disconnectedAt: number
): Promise<void> {
  if (!isValidationTelemetryEnabled() || !callSid || !wsSessionId) return;

  const intervals = await loadIntervals(callSid);
  const existing = intervals.get(wsSessionId);
  const interval: TransportInterval = {
    connectedAt: existing?.connectedAt ?? disconnectedAt,
    disconnectedAt,
  };
  await persistInterval(callSid, wsSessionId, interval);
}

/** @deprecated Use recordCallTransportBound — kept for import stability */
export async function recordCallWebSocketSession(
  callSid: string,
  wsSessionId: string
): Promise<void> {
  await recordCallTransportBound(callSid, wsSessionId, Date.now());
}
