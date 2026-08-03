import { logger } from '../logger.js';
import { logSessionLifecycle } from './session-lifecycle-telemetry.js';
import {
  saveRuntimeSessionSnapshot,
  type RuntimeSessionSnapshot,
} from './realtime-session-redis.js';
import type { CallRuntimeSession } from './realtime-session.js';
import { P1_PERSISTENCE_INTERVAL_MS } from './realtime-session.js';

const flushInFlight = new Set<string>();

/**
 * Ephemeral continuity → Redis; final durable write remains on gateway terminate.
 */
export async function flushPartialPersistence(
  session: CallRuntimeSession
): Promise<void> {
  if (flushInFlight.has(session.sessionId)) return;
  flushInFlight.add(session.sessionId);
  const started = Date.now();
  try {
    await saveRuntimeSessionSnapshot(session);
    session.metrics.lastPersistenceFlushAt = Date.now();
    logSessionLifecycle('SESSION_PERSISTENCE_FLUSH', {
      sessionId: session.sessionId,
      tenantId: session.tenantId,
      callSid: session.callSid,
      transcriptChunks: session.transcriptBuffer.length,
      flushLatencyMs: Date.now() - started,
    });
  } catch (err) {
    logger.warn('SESSION_PERSISTENCE_FLUSH_FAILED', {
      sessionId: session.sessionId,
      tenantId: session.tenantId,
      error: String(err),
    });
  } finally {
    flushInFlight.delete(session.sessionId);
  }
}

export function restoreTranscriptFromSnapshot(
  session: CallRuntimeSession,
  snapshot: RuntimeSessionSnapshot
): void {
  for (const chunk of snapshot.transcriptBuffer || []) {
    session.appendTranscript(chunk.role, chunk.text);
  }
  session.metrics.reconnectCount = Math.max(
    session.metrics.reconnectCount,
    snapshot.reconnectCount || 0
  );
  if (snapshot.voiceSessionId) session.voiceSessionId = snapshot.voiceSessionId;
}

const intervalTimers = new Map<string, ReturnType<typeof setInterval>>();

export function startPartialPersistenceLoop(
  session: CallRuntimeSession,
  getVoiceTranscript?: () => { role: 'caller' | 'assistant' | 'system'; text: string }[] | undefined
): void {
  stopPartialPersistenceLoop(session.sessionId);
  const timer = setInterval(() => {
    if (session.state === 'terminated') {
      stopPartialPersistenceLoop(session.sessionId);
      return;
    }
    session.updateHeartbeat();
    const lines = getVoiceTranscript?.();
    if (lines) session.syncTranscriptFromVoice(lines);
    flushPartialPersistence(session).catch(() => {});
  }, P1_PERSISTENCE_INTERVAL_MS);
  timer.unref?.();
  intervalTimers.set(session.sessionId, timer);
}

export function stopPartialPersistenceLoop(sessionId: string): void {
  const t = intervalTimers.get(sessionId);
  if (t) {
    clearInterval(t);
    intervalTimers.delete(sessionId);
  }
}
