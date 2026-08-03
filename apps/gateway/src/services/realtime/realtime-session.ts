import type WebSocket from 'ws';
import { logSessionLifecycle } from './session-lifecycle-telemetry.js';
import {
  markTransportAttachOnce,
  nextTransportGeneration,
  transportAttachKey,
} from './session-idempotency.js';

export type RuntimeSessionState =
  | 'initializing'
  | 'active'
  | 'reconnecting'
  | 'terminating'
  | 'terminated';

export interface TranscriptChunk {
  role: 'caller' | 'assistant' | 'system';
  text: string;
  at: number;
}

export interface ToolExecution {
  toolName: string;
  idempotencyKey?: string;
  startedAt: number;
  status: 'pending' | 'completed' | 'failed';
}

export interface SessionMetrics {
  reconnectCount: number;
  transportAttachCount: number;
  transcriptChunkCount: number;
  toolExecutionCount: number;
  lastPersistenceFlushAt?: number;
}

export interface AttachedTransports {
  websocket?: WebSocket;
  wsSessionId?: string;
  twilioStreamSid?: string;
  openAiRealtimeId?: string;
  transportGeneration: number;
}

/**
 * P1-A runtime authority — durable call session; transports are replaceable attachments.
 * (Distinct from voice-pipeline `RealtimeSession` in realtime.types.ts.)
 */
export class CallRuntimeSession {
  readonly sessionId: string;
  readonly tenantId: string;
  readonly callSid: string;
  readonly createdAt: number;
  updatedAt: number;
  lastHeartbeatAt: number;
  state: RuntimeSessionState;
  transports: AttachedTransports;
  transcriptBuffer: TranscriptChunk[];
  pendingToolExecutions: ToolExecution[];
  metrics: SessionMetrics;
  /** Voice pipeline session id (OpenAI/Twilio bridge) */
  voiceSessionId?: string;
  private terminateTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(params: { tenantId: string; callSid: string; sessionId?: string }) {
    const now = Date.now();
    this.sessionId = params.sessionId || `rt_${params.tenantId}_${params.callSid}_${now}`;
    this.tenantId = params.tenantId;
    this.callSid = params.callSid;
    this.createdAt = now;
    this.updatedAt = now;
    this.lastHeartbeatAt = now;
    this.state = 'initializing';
    this.transports = { transportGeneration: 0 };
    this.transcriptBuffer = [];
    this.pendingToolExecutions = [];
    this.metrics = {
      reconnectCount: 0,
      transportAttachCount: 0,
      transcriptChunkCount: 0,
      toolExecutionCount: 0,
    };
  }

  get transportAgeMs(): number {
    return Date.now() - this.createdAt;
  }

  attachTransport(partial: {
    websocket?: WebSocket;
    wsSessionId?: string;
    twilioStreamSid?: string;
    openAiRealtimeId?: string;
  }): boolean {
    const gen = nextTransportGeneration(this.sessionId, this.transports.transportGeneration);
    const wsSessionId = partial.wsSessionId || this.transports.wsSessionId || 'unknown';
    const key = transportAttachKey(this.sessionId, wsSessionId, gen);
    if (!markTransportAttachOnce(key)) {
      return false;
    }

    this.transports = {
      ...this.transports,
      ...partial,
      transportGeneration: gen,
    };
    this.metrics.transportAttachCount++;
    this.touch('active');
    logSessionLifecycle(
      this.metrics.reconnectCount > 0 ? 'SESSION_REATTACHED' : 'SESSION_ATTACHED',
      {
        sessionId: this.sessionId,
        tenantId: this.tenantId,
        callSid: this.callSid,
        wsSessionId,
        transportAgeMs: this.transportAgeMs,
        reconnectCount: this.metrics.reconnectCount,
      }
    );
    return true;
  }

  detachTransport(reason?: string): void {
    this.transports.websocket = undefined;
    this.transports.wsSessionId = undefined;
    this.transports.twilioStreamSid = undefined;
    this.updatedAt = Date.now();
    if (this.state !== 'terminating' && this.state !== 'terminated') {
      this.state = 'reconnecting';
      logSessionLifecycle('SESSION_RECONNECTING', {
        sessionId: this.sessionId,
        tenantId: this.tenantId,
        callSid: this.callSid,
        reconnectCount: this.metrics.reconnectCount,
        reason,
      });
    }
  }

  markReconnected(): void {
    this.metrics.reconnectCount++;
    this.touch('active');
    logSessionLifecycle('SESSION_RECONNECTED', {
      sessionId: this.sessionId,
      tenantId: this.tenantId,
      callSid: this.callSid,
      reconnectCount: this.metrics.reconnectCount,
    });
  }

  updateHeartbeat(): void {
    this.lastHeartbeatAt = Date.now();
    this.updatedAt = this.lastHeartbeatAt;
  }

  touch(nextState?: RuntimeSessionState): void {
    this.updateHeartbeat();
    if (nextState) this.state = nextState;
    if (this.state === 'active') {
      logSessionLifecycle('SESSION_ACTIVE', {
        sessionId: this.sessionId,
        tenantId: this.tenantId,
        callSid: this.callSid,
      });
    }
  }

  appendTranscript(role: TranscriptChunk['role'], text: string): void {
    const line = text?.trim();
    if (!line) return;
    const last = this.transcriptBuffer[this.transcriptBuffer.length - 1];
    if (last && last.role === role && last.text === line) return;
    this.transcriptBuffer.push({ role, text: line, at: Date.now() });
    this.metrics.transcriptChunkCount++;
    this.updatedAt = Date.now();
  }

  syncTranscriptFromVoice(
    lines: { role: 'caller' | 'assistant' | 'system'; text: string }[] | undefined
  ): void {
    if (!lines?.length) return;
    for (const line of lines) {
      this.appendTranscript(line.role, line.text);
    }
  }

  recordToolExecution(tool: ToolExecution): void {
    this.pendingToolExecutions.push(tool);
    this.metrics.toolExecutionCount++;
    this.updatedAt = Date.now();
  }

  clearPendingTools(): void {
    this.pendingToolExecutions = [];
  }

  scheduleTerminateAfter(graceMs: number, onTerminate: () => void): void {
    this.cancelScheduledTerminate();
    this.state = 'reconnecting';
    logSessionLifecycle('SESSION_RECONNECTING', {
      sessionId: this.sessionId,
      tenantId: this.tenantId,
      callSid: this.callSid,
      graceMs,
    });
    this.terminateTimer = setTimeout(() => {
      this.terminate(onTerminate);
    }, graceMs);
    this.terminateTimer.unref?.();
  }

  cancelScheduledTerminate(): void {
    if (this.terminateTimer) {
      clearTimeout(this.terminateTimer);
      this.terminateTimer = null;
    }
  }

  terminate(onTerminate?: () => void): void {
    this.cancelScheduledTerminate();
    if (this.state === 'terminated') return;
    logSessionLifecycle('SESSION_TERMINATING', {
      sessionId: this.sessionId,
      tenantId: this.tenantId,
      callSid: this.callSid,
    });
    this.state = 'terminating';
    this.transports.websocket = undefined;
    try {
      onTerminate?.();
    } finally {
      this.state = 'terminated';
      this.updatedAt = Date.now();
      logSessionLifecycle('SESSION_TERMINATED', {
        sessionId: this.sessionId,
        tenantId: this.tenantId,
        callSid: this.callSid,
        reconnectCount: this.metrics.reconnectCount,
        transportAgeMs: Date.now() - this.createdAt,
      });
    }
  }

  hasActiveTransport(): boolean {
    const ws = this.transports.websocket;
    return Boolean(ws && ws.readyState === 1);
  }
}

export function isP1RuntimeSessionEnabled(): boolean {
  return process.env.CALLIQ_P1_RUNTIME_SESSION !== 'false';
}

export const P1_RECONNECT_GRACE_MS = Number(process.env.P1_RECONNECT_GRACE_MS || 15_000);
export const P1_SESSION_HEARTBEAT_STALE_MS = Number(
  process.env.P1_SESSION_HEARTBEAT_STALE_MS || 120_000
);
export const P1_PERSISTENCE_INTERVAL_MS = Number(
  process.env.P1_PERSISTENCE_INTERVAL_MS || 30_000
);
