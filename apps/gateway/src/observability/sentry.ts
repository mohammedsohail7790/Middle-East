/**
 * Sentry Integration
 *
 * Enterprise-grade error tracking, performance monitoring, and release tracking
 */

import * as Sentry from '@sentry/node';
import {
  expressErrorHandler,
  expressIntegration,
  httpIntegration,
  type Span,
} from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { Request, Response, NextFunction } from 'express';

export interface SentryConfig {
  dsn: string;
  environment: string;
  release?: string;
  tracesSampleRate: number;
  profilesSampleRate: number;
  enabled: boolean;
}

/**
 * Initialize Sentry
 */
export function initializeSentry(config: SentryConfig): void {
  if (!config.enabled) {
    console.log('[Sentry] Disabled');
    return;
  }

  Sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    release: config.release,

    tracesSampleRate: config.tracesSampleRate,
    profilesSampleRate: config.profilesSampleRate,

    integrations: [
      nodeProfilingIntegration(),
      httpIntegration(),
      expressIntegration(),
    ],

    beforeSend(event, hint) {
      const error = hint.originalException;

      if (error instanceof Error) {
        if (error.message.includes('rate limit')) {
          return null;
        }

        if (error.message.includes('ECONNRESET') || error.message.includes('EPIPE')) {
          return null;
        }
      }

      return event;
    },

    beforeSendTransaction(event) {
      if (event.transaction?.includes('/health')) {
        return Math.random() < 0.1 ? event : null;
      }

      return event;
    },
  });

  console.log(`[Sentry] Initialized (env: ${config.environment}, release: ${config.release})`);
}

/**
 * Express middleware for request tracing (expressIntegration handles spans).
 */
export function sentryRequestHandler() {
  return (_req: Request, _res: Response, next: NextFunction) => next();
}

/**
 * Express middleware for error tracking
 */
export function sentryErrorHandler() {
  return expressErrorHandler();
}

/**
 * Track session lifecycle events
 */
export function trackSessionEvent(
  event: 'created' | 'connected' | 'disconnected' | 'failed' | 'zombie' | 'orphan',
  sessionId: string,
  metadata?: Record<string, any>
): void {
  Sentry.addBreadcrumb({
    category: 'session',
    message: `Session ${event}: ${sessionId}`,
    level: event === 'failed' || event === 'zombie' ? 'error' : 'info',
    data: {
      sessionId,
      event,
      ...metadata,
    },
  });

  if (event === 'failed' || event === 'zombie' || event === 'orphan') {
    Sentry.captureMessage(`Session ${event}: ${sessionId}`, {
      level: 'warning',
      tags: {
        sessionId,
        event,
      },
      extra: metadata,
    });
  }
}

function runSpan(
  op: string,
  name: string,
  tags: Record<string, string>,
  fn: () => void
): void {
  Sentry.startSpan({ op, name, attributes: tags }, fn);
}

/**
 * Track tool execution
 */
export function trackToolExecution(
  toolName: string,
  status: 'started' | 'completed' | 'failed' | 'timeout',
  duration?: number,
  error?: Error
): void {
  runSpan('tool.execution', `Tool: ${toolName}`, { tool: toolName, status }, () => {
    if (duration) {
      Sentry.setMeasurement('duration', duration, 'millisecond');
    }

    if (error) {
      Sentry.captureException(error, {
        tags: {
          tool: toolName,
          status,
        },
      });
    }
  });
}

/**
 * Track audio pipeline metrics
 */
export function trackAudioMetrics(metrics: {
  sessionId: string;
  framesReceived: number;
  framesSent: number;
  droppedFrames: number;
  latency: number;
  jitter: number;
}): void {
  runSpan('audio.pipeline', 'Audio Pipeline Metrics', { sessionId: metrics.sessionId }, () => {
    Sentry.setMeasurement('frames_received', metrics.framesReceived, 'none');
    Sentry.setMeasurement('frames_sent', metrics.framesSent, 'none');
    Sentry.setMeasurement('dropped_frames', metrics.droppedFrames, 'none');
    Sentry.setMeasurement('latency', metrics.latency, 'millisecond');
    Sentry.setMeasurement('jitter', metrics.jitter, 'millisecond');

    const dropoutRate = metrics.droppedFrames / (metrics.framesReceived || 1);
    if (dropoutRate > 0.05) {
      Sentry.captureMessage('High audio dropout rate', {
        level: 'warning',
        tags: {
          sessionId: metrics.sessionId,
          dropoutRate: dropoutRate.toFixed(3),
        },
        extra: metrics,
      });
    }
  });
}

/**
 * Track WebSocket connection metrics
 */
export function trackWebSocketMetrics(metrics: {
  activeConnections: number;
  totalConnections: number;
  failedConnections: number;
  reconnects: number;
  averageLatency: number;
}): void {
  runSpan('websocket.metrics', 'WebSocket Metrics', {}, () => {
    Sentry.setMeasurement('active_connections', metrics.activeConnections, 'none');
    Sentry.setMeasurement('total_connections', metrics.totalConnections, 'none');
    Sentry.setMeasurement('failed_connections', metrics.failedConnections, 'none');
    Sentry.setMeasurement('reconnects', metrics.reconnects, 'none');
    Sentry.setMeasurement('average_latency', metrics.averageLatency, 'millisecond');

    const failureRate = metrics.failedConnections / (metrics.totalConnections || 1);
    if (failureRate > 0.1) {
      Sentry.captureMessage('High WebSocket failure rate', {
        level: 'error',
        extra: metrics,
      });
    }
  });
}

/**
 * Track Redis operations
 */
export function trackRedisOperation(
  operation: string,
  duration: number,
  success: boolean,
  error?: Error
): void {
  Sentry.addBreadcrumb({
    category: 'redis',
    message: `Redis ${operation}`,
    level: success ? 'info' : 'error',
    data: {
      operation,
      duration,
      success,
    },
  });

  if (duration > 1000) {
    Sentry.captureMessage('Slow Redis operation', {
      level: 'warning',
      tags: {
        operation,
        duration: duration.toString(),
      },
    });
  }

  if (error) {
    Sentry.captureException(error, {
      tags: {
        operation,
        component: 'redis',
      },
    });
  }
}

/**
 * Track memory usage
 */
export function trackMemoryUsage(): void {
  const memUsage = process.memoryUsage();

  runSpan('memory.usage', 'Memory Usage', {}, () => {
    Sentry.setMeasurement('heap_used', memUsage.heapUsed / 1024 / 1024, 'megabyte');
    Sentry.setMeasurement('heap_total', memUsage.heapTotal / 1024 / 1024, 'megabyte');
    Sentry.setMeasurement('rss', memUsage.rss / 1024 / 1024, 'megabyte');
    Sentry.setMeasurement('external', memUsage.external / 1024 / 1024, 'megabyte');

    const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
    const heapTotalMB = memUsage.heapTotal / 1024 / 1024;
    const heapUsagePercent = (heapUsedMB / heapTotalMB) * 100;

    if (heapUsagePercent > 90) {
      Sentry.captureMessage('High memory usage', {
        level: 'warning',
        extra: {
          heapUsedMB,
          heapTotalMB,
          heapUsagePercent,
        },
      });
    }
  });
}

/**
 * Track event loop lag
 */
export function trackEventLoopLag(lag: number): void {
  Sentry.addBreadcrumb({
    category: 'performance',
    message: 'Event loop lag',
    level: lag > 100 ? 'warning' : 'info',
    data: {
      lag,
    },
  });

  if (lag > 100) {
    Sentry.captureMessage('High event loop lag', {
      level: 'warning',
      tags: {
        lag: lag.toString(),
      },
    });
  }
}

/**
 * Set user context for session
 */
export function setSessionContext(sessionId: string, tenantId: string, callSid?: string): void {
  Sentry.setUser({
    id: sessionId,
    username: tenantId,
  });

  Sentry.setContext('session', {
    sessionId,
    tenantId,
    callSid,
  });
}

/**
 * Clear user context
 */
export function clearSessionContext(): void {
  Sentry.setUser(null);
}

/**
 * Capture exception with context
 */
export function captureException(error: Error, context?: Record<string, any>): void {
  Sentry.captureException(error, {
    extra: context,
  });
}

/**
 * Capture message with level
 */
export function captureMessage(
  message: string,
  level: 'fatal' | 'error' | 'warning' | 'info' | 'debug' = 'info',
  context?: Record<string, any>
): void {
  Sentry.captureMessage(message, {
    level,
    extra: context,
  });
}

/**
 * Start performance span (caller should end via callback or startSpanManual).
 */
export function startTransaction(name: string, op: string): Span {
  return Sentry.startInactiveSpan({ name, op });
}

/**
 * Flush pending events (for graceful shutdown)
 */
export async function flushSentry(timeout: number = 2000): Promise<boolean> {
  return await Sentry.flush(timeout);
}
