import { logger } from '../logger.js';
import { RealtimeSession, RealtimeMetrics, RealtimeEvent } from './realtime.types.js';
import { voiceMetrics } from '../voice/voice.metrics.js';

export class RealtimeEventManager {
  private sessionMetrics = new Map<string, Partial<RealtimeMetrics>>();
  private eventBuffer: RealtimeEvent[] = [];
  private readonly maxBufferSize = 1000;

  recordEvent(event: RealtimeEvent): void {
    this.eventBuffer.push(event);
    
    // Trim buffer if it gets too large
    if (this.eventBuffer.length > this.maxBufferSize) {
      this.eventBuffer = this.eventBuffer.slice(-this.maxBufferSize);
    }

    logger.debug('REALTIME_EVENT_RECORDED', {
      sessionId: event.sessionId,
      type: event.type,
      timestamp: event.timestamp,
    });
  }

  startSession(session: RealtimeSession): void {
    const sessionMetrics: Partial<RealtimeMetrics> = {
      sessionId: session.id,
      tenantId: session.tenantId,
      startTime: session.startTime,
      turnCount: 0,
      interruptionCount: 0,
      toolCallCount: 0,
      tokensUsed: 0,
      averageLatency: 0,
    };

    this.sessionMetrics.set(session.id, sessionMetrics);

    this.recordEvent({
      type: 'session_started',
      timestamp: new Date(),
      sessionId: session.id,
      data: {
        tenantId: session.tenantId,
        callSid: session.callSid,
        voice: session.config.voice,
        language: session.config.language,
      }
    });

    logger.info('REALTIME_SESSION_METRICS_STARTED', {
      sessionId: session.id,
      tenantId: session.tenantId,
    });
  }

  endSession(session: RealtimeSession, outcome: 'completed' | 'failed' | 'transferred'): void {
    const metrics = this.sessionMetrics.get(session.id);
    if (!metrics) {
      logger.warn('REALTIME_SESSION_METRICS_NOT_FOUND', {
        sessionId: session.id,
        tenantId: session.tenantId,
      });
      return;
    }

    const endTime = new Date();
    const duration = endTime.getTime() - metrics.startTime!.getTime();

    const finalMetrics: RealtimeMetrics = {
      ...metrics,
      endTime,
      duration,
      averageLatency: this.calculateAverageLatency(session.id),
    } as RealtimeMetrics;

    this.sessionMetrics.delete(session.id);

    this.recordEvent({
      type: 'session_ended',
      timestamp: endTime,
      sessionId: session.id,
      data: {
        tenantId: session.tenantId,
        duration,
        outcome,
        turnCount: finalMetrics.turnCount,
        toolCallCount: finalMetrics.toolCallCount,
        tokensUsed: finalMetrics.tokensUsed,
        averageLatency: finalMetrics.averageLatency,
      }
    });

    // Record legacy metrics
    voiceMetrics.recordLatency(duration, session.tenantId);

    logger.info('REALTIME_SESSION_METRICS_COMPLETED', {
      sessionId: session.id,
      tenantId: session.tenantId,
      duration,
      outcome,
      turnCount: finalMetrics.turnCount,
      toolCallCount: finalMetrics.toolCallCount,
    });
  }

  recordTurn(sessionId: string, latencyMs: number): void {
    const metrics = this.sessionMetrics.get(sessionId);
    if (!metrics) return;

    metrics.turnCount = (metrics.turnCount || 0) + 1;
    
    // Update running average latency
    const currentAvg = metrics.averageLatency || 0;
    const turnCount = metrics.turnCount;
    metrics.averageLatency = ((currentAvg * (turnCount - 1)) + latencyMs) / turnCount;

    this.recordEvent({
      type: 'turn_completed',
      timestamp: new Date(),
      sessionId,
      data: {
        latencyMs,
        turnNumber: turnCount,
        newAverageLatency: metrics.averageLatency,
      }
    });

    // Record latency metric
    voiceMetrics.recordLatency(latencyMs, 'unknown');

    logger.debug('REALTIME_TURN_RECORDED', {
      sessionId,
      latencyMs,
      turnCount,
      averageLatency: metrics.averageLatency,
    });
  }

  recordInterruption(sessionId: string): void {
    const metrics = this.sessionMetrics.get(sessionId);
    if (!metrics) return;

    metrics.interruptionCount = (metrics.interruptionCount || 0) + 1;

    this.recordEvent({
      type: 'interruption',
      timestamp: new Date(),
      sessionId,
      data: {
        interruptionCount: metrics.interruptionCount,
      }
    });

    logger.debug('REALTIME_INTERRUPTION_RECORDED', {
      sessionId,
      interruptionCount: metrics.interruptionCount,
    });
  }

  recordToolCall(sessionId: string, toolName: string, executionTimeMs: number): void {
    const metrics = this.sessionMetrics.get(sessionId);
    if (!metrics) return;

    metrics.toolCallCount = (metrics.toolCallCount || 0) + 1;

    this.recordEvent({
      type: 'tool_call',
      timestamp: new Date(),
      sessionId,
      data: {
        toolName,
        executionTimeMs,
        toolCallCount: metrics.toolCallCount,
      }
    });

    // Record tool execution time as latency
    voiceMetrics.recordLatency(executionTimeMs, 'unknown');

    logger.debug('REALTIME_TOOL_CALL_RECORDED', {
      sessionId,
      toolName,
      executionTimeMs,
      toolCallCount: metrics.toolCallCount,
    });
  }

  recordTokenUsage(sessionId: string, tokensIn: number, tokensOut: number): void {
    const metrics = this.sessionMetrics.get(sessionId);
    if (!metrics) return;

    metrics.tokensUsed = (metrics.tokensUsed || 0) + tokensIn + tokensOut;

    this.recordEvent({
      type: 'token_usage',
      timestamp: new Date(),
      sessionId,
      data: {
        tokensIn,
        tokensOut,
        totalTokens: tokensIn + tokensOut,
        cumulativeTokens: metrics.tokensUsed,
      }
    });

    // Token usage tracking - no direct voiceMetrics equivalent available
    logger.debug('REALTIME_TOKEN_USAGE_METRICS', {
      sessionId,
      tokensIn,
      tokensOut,
      totalTokens: tokensIn + tokensOut,
    });

    logger.debug('REALTIME_TOKEN_USAGE_RECORDED', {
      sessionId,
      tokensIn,
      tokensOut,
      cumulativeTokens: metrics.tokensUsed,
    });
  }

  recordError(sessionId: string, errorType: string, errorMessage: string): void {
    this.recordEvent({
      type: 'error',
      timestamp: new Date(),
      sessionId,
      data: {
        errorType,
        errorMessage,
      }
    });

    logger.warn('REALTIME_ERROR_RECORDED', {
      sessionId,
      errorType,
      errorMessage,
    });
  }

  getSessionMetrics(sessionId: string): Partial<RealtimeMetrics> | undefined {
    return this.sessionMetrics.get(sessionId);
  }

  /** Whether a tool was executed during this session (for post-call CRM dedup). */
  sessionHadToolCall(sessionId: string, toolName: string): boolean {
    return this.eventBuffer.some(
      (event) =>
        event.sessionId === sessionId &&
        event.type === 'tool_call' &&
        event.data?.toolName === toolName
    );
  }

  getRecentEvents(sessionId: string, limit = 50): RealtimeEvent[] {
    return this.eventBuffer
      .filter(event => event.sessionId === sessionId)
      .slice(-limit);
  }

  getActiveSessionCount(): number {
    return this.sessionMetrics.size;
  }

  private calculateAverageLatency(sessionId: string): number {
    const events = this.getRecentEvents(sessionId, 200);
    const turnEvents = events.filter(event => event.type === 'turn_completed');
    
    if (turnEvents.length === 0) return 0;
    
    const totalLatency = turnEvents.reduce((sum, event) => sum + (event.data?.latencyMs || 0), 0);
    return Math.round(totalLatency / turnEvents.length);
  }

  getTenantMetrics(tenantId: string): {
    activeSessions: number;
    totalTurns: number;
    totalToolCalls: number;
    totalTokens: number;
    averageLatency: number;
  } {
    const tenantSessions = Array.from(this.sessionMetrics.values())
      .filter(metrics => metrics.tenantId === tenantId);

    const activeSessions = tenantSessions.length;
    const totalTurns = tenantSessions.reduce((sum, metrics) => sum + (metrics.turnCount || 0), 0);
    const totalToolCalls = tenantSessions.reduce((sum, metrics) => sum + (metrics.toolCallCount || 0), 0);
    const totalTokens = tenantSessions.reduce((sum, metrics) => sum + (metrics.tokensUsed || 0), 0);
    
    const allTurnEvents = this.eventBuffer
      .filter(event => event.type === 'turn_completed')
      .filter(event => {
        const sessionMetrics = this.sessionMetrics.get(event.sessionId);
        return sessionMetrics?.tenantId === tenantId;
      });
    
    const averageLatency = allTurnEvents.length > 0
      ? allTurnEvents.reduce((sum, event) => sum + (event.data?.latencyMs || 0), 0) / allTurnEvents.length
      : 0;

    return {
      activeSessions,
      totalTurns,
      totalToolCalls,
      totalTokens,
      averageLatency: Math.round(averageLatency),
    };
  }

  cleanupOldEvents(maxAgeHours = 24): void {
    const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
    const initialCount = this.eventBuffer.length;

    this.eventBuffer = this.eventBuffer.filter(event => event.timestamp > cutoffTime);

    const removedCount = initialCount - this.eventBuffer.length;
    if (removedCount > 0) {
      logger.info('REALTIME_EVENTS_CLEANUP', {
        removedCount,
        remainingCount: this.eventBuffer.length,
        cutoffTime,
      });
    }
  }
}
