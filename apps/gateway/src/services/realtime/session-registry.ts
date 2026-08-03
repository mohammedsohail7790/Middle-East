import type WebSocket from 'ws';
import {
  CallRuntimeSession,
  isP1RuntimeSessionEnabled,
  P1_RECONNECT_GRACE_MS,
} from './realtime-session.js';
import { logSessionLifecycle } from './session-lifecycle-telemetry.js';
import {
  deleteRuntimeSessionRedis,
  loadRuntimeSessionIdByCallSid,
  loadRuntimeSessionSnapshot,
} from './realtime-session-redis.js';
import {
  restoreTranscriptFromSnapshot,
  startPartialPersistenceLoop,
  stopPartialPersistenceLoop,
  flushPartialPersistence,
} from './session-persistence.js';
import { clearTransportAttachKeysForSession } from './session-idempotency.js';
import { patchCorrelation } from '../observability/correlation-context.js';

export interface CreateRuntimeSessionParams {
  tenantId: string;
  callSid: string;
  wsSessionId?: string;
  websocket?: WebSocket;
  twilioStreamSid?: string;
}

/**
 * P1-A authoritative runtime session registry — one active session per callSid.
 */
export class SessionRegistry {
  private bySessionId = new Map<string, CallRuntimeSession>();
  private callSidIndex = new Map<string, string>();

  create(params: CreateRuntimeSessionParams): CallRuntimeSession {
    const existingId = this.callSidIndex.get(params.callSid);
    if (existingId) {
      const existing = this.bySessionId.get(existingId);
      if (existing && existing.state !== 'terminated') {
        return this.attachTransport(existing, params);
      }
    }

    const session = new CallRuntimeSession({
      tenantId: params.tenantId,
      callSid: params.callSid,
    });
    this.bySessionId.set(session.sessionId, session);
    this.callSidIndex.set(params.callSid, session.sessionId);

    logSessionLifecycle('SESSION_CREATED', {
      sessionId: session.sessionId,
      tenantId: session.tenantId,
      callSid: session.callSid,
      wsSessionId: params.wsSessionId,
    });

    void import('../../events/event-publisher.js')
      .then(async ({ publishPlatformEvent }) => {
        const { PlatformEventTypes } = await import('../../events/event-types.js');
        publishPlatformEvent(
          PlatformEventTypes.SESSION_CREATED,
          { callSid: session.callSid },
          {
            tenantId: session.tenantId,
            callSid: session.callSid,
            sessionId: session.sessionId,
          }
        );
      })
      .catch(() => {});

    patchCorrelation({
      sessionId: session.sessionId,
      tenantId: session.tenantId,
      callSid: session.callSid,
      wsSessionId: params.wsSessionId,
    });

    if (params.websocket || params.wsSessionId) {
      this.attachTransport(session, params);
    } else {
      session.touch('initializing');
    }

    startPartialPersistenceLoop(session);
    flushPartialPersistence(session).catch(() => {});
    return session;
  }

  async getOrCreate(params: CreateRuntimeSessionParams): Promise<CallRuntimeSession> {
    if (!isP1RuntimeSessionEnabled()) {
      return this.create(params);
    }

    const existing = this.getByCallSid(params.callSid);
    if (existing && existing.state !== 'terminated') {
      existing.cancelScheduledTerminate();
      if (existing.state === 'reconnecting') {
        existing.markReconnected();
      }
      return this.attachTransport(existing, params);
    }

    const redisSessionId = await loadRuntimeSessionIdByCallSid(params.callSid);
    if (redisSessionId) {
      const snap = await loadRuntimeSessionSnapshot(redisSessionId);
      if (snap && snap.state !== 'terminated') {
        const revived = new CallRuntimeSession({
          tenantId: snap.tenantId,
          callSid: snap.callSid,
          sessionId: snap.sessionId,
        });
        revived.voiceSessionId = snap.voiceSessionId;
        restoreTranscriptFromSnapshot(revived, snap);
        revived.markReconnected();
        this.bySessionId.set(revived.sessionId, revived);
        this.callSidIndex.set(snap.callSid, revived.sessionId);
        startPartialPersistenceLoop(revived);
        return this.attachTransport(revived, params);
      }
    }

    return this.create(params);
  }

  getBySessionId(sessionId: string): CallRuntimeSession | undefined {
    return this.bySessionId.get(sessionId);
  }

  getByCallSid(callSid: string): CallRuntimeSession | undefined {
    const id = this.callSidIndex.get(callSid);
    return id ? this.bySessionId.get(id) : undefined;
  }

  attachTransport(
    session: CallRuntimeSession,
    params: CreateRuntimeSessionParams
  ): CallRuntimeSession {
    session.cancelScheduledTerminate();
    session.attachTransport({
      websocket: params.websocket,
      wsSessionId: params.wsSessionId,
      twilioStreamSid: params.twilioStreamSid,
    });
    if (session.state === 'initializing' || session.state === 'reconnecting') {
      session.touch('active');
    }
    patchCorrelation({
      sessionId: session.sessionId,
      tenantId: session.tenantId,
      callSid: session.callSid,
      wsSessionId: params.wsSessionId,
    });
    flushPartialPersistence(session).catch(() => {});
    return session;
  }

  detachTransport(session: CallRuntimeSession, reason?: string): void {
    session.detachTransport(reason);
    flushPartialPersistence(session).catch(() => {});
  }

  scheduleTerminateAfterGrace(
    session: CallRuntimeSession,
    onTerminate: () => void | Promise<void>,
    graceMs = P1_RECONNECT_GRACE_MS
  ): void {
    session.scheduleTerminateAfter(graceMs, () => {
      void Promise.resolve(onTerminate()).finally(() => {
        this.terminate(session.sessionId);
      });
    });
  }

  terminate(sessionId: string): CallRuntimeSession | undefined {
    const session = this.bySessionId.get(sessionId);
    if (!session) return undefined;

    stopPartialPersistenceLoop(sessionId);
    session.terminate();
    clearTransportAttachKeysForSession(sessionId);
    this.bySessionId.delete(sessionId);
    if (this.callSidIndex.get(session.callSid) === sessionId) {
      this.callSidIndex.delete(session.callSid);
    }
    deleteRuntimeSessionRedis(session.sessionId, session.callSid).catch(() => {});
    logSessionLifecycle('SESSION_CLEANED', {
      sessionId: session.sessionId,
      tenantId: session.tenantId,
      callSid: session.callSid,
    });
    return session;
  }

  listActive(): CallRuntimeSession[] {
    return [...this.bySessionId.values()].filter((s) => s.state !== 'terminated');
  }

  activeCount(tenantId?: string): number {
    const rows = this.listActive();
    return tenantId ? rows.filter((r) => r.tenantId === tenantId).length : rows.length;
  }

  bindVoiceSession(runtime: CallRuntimeSession, voiceSessionId: string): void {
    runtime.voiceSessionId = voiceSessionId;
    runtime.touch('active');
    flushPartialPersistence(runtime).catch(() => {});
  }
}

export const sessionRegistry = new SessionRegistry();
