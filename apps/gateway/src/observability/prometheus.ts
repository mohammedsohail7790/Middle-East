/**
 * Prometheus Metrics Exporter
 * 
 * Comprehensive metrics collection for monitoring and alerting
 */

import { Registry, Counter, Gauge, Histogram } from 'prom-client';
import { Request, Response } from 'express';
import { clientErrorMessage } from '../security/safe-error.js';

// Create registry
export const register = new Registry();

// Default labels
register.setDefaultLabels({
  app: 'halla-ai-gateway',
  environment: process.env.NODE_ENV || 'development',
});

// ============================================================================
// SESSION METRICS
// ============================================================================

export const sessionMetrics = {
  // Session lifecycle
  sessionsTotal: new Counter({
    name: 'calliq_sessions_total',
    help: 'Total number of sessions created',
    labelNames: ['tenant_id', 'status'],
    registers: [register],
  }),

  sessionsActive: new Gauge({
    name: 'calliq_sessions_active',
    help: 'Number of currently active sessions',
    labelNames: ['tenant_id'],
    registers: [register],
  }),

  sessionDuration: new Histogram({
    name: 'calliq_session_duration_seconds',
    help: 'Session duration in seconds',
    labelNames: ['tenant_id', 'status'],
    buckets: [10, 30, 60, 120, 300, 600, 1800, 3600],
    registers: [register],
  }),

  // Session failures
  sessionFailures: new Counter({
    name: 'calliq_session_failures_total',
    help: 'Total number of session failures',
    labelNames: ['tenant_id', 'reason'],
    registers: [register],
  }),

  zombieSessions: new Counter({
    name: 'calliq_zombie_sessions_total',
    help: 'Total number of zombie sessions detected',
    labelNames: ['tenant_id'],
    registers: [register],
  }),

  orphanSessions: new Counter({
    name: 'calliq_orphan_sessions_total',
    help: 'Total number of orphan sessions detected',
    labelNames: ['tenant_id'],
    registers: [register],
  }),

  // Reconnects
  reconnects: new Counter({
    name: 'calliq_reconnects_total',
    help: 'Total number of session reconnects',
    labelNames: ['tenant_id'],
    registers: [register],
  }),
};

// ============================================================================
// WEBSOCKET METRICS
// ============================================================================

export const websocketMetrics = {
  connections: new Counter({
    name: 'calliq_websocket_connections_total',
    help: 'Total number of WebSocket connections',
    labelNames: ['tenant_id', 'endpoint', 'status'],
    registers: [register],
  }),

  activeConnections: new Gauge({
    name: 'calliq_websocket_connections_active',
    help: 'Number of active WebSocket connections',
    labelNames: ['tenant_id', 'endpoint'],
    registers: [register],
  }),

  connectionDuration: new Histogram({
    name: 'calliq_websocket_connection_duration_seconds',
    help: 'WebSocket connection duration in seconds',
    labelNames: ['tenant_id', 'endpoint'],
    buckets: [1, 5, 10, 30, 60, 120, 300, 600],
    registers: [register],
  }),

  messagesSent: new Counter({
    name: 'calliq_websocket_messages_sent_total',
    help: 'Total number of WebSocket messages sent',
    labelNames: ['tenant_id', 'type'],
    registers: [register],
  }),

  messagesReceived: new Counter({
    name: 'calliq_websocket_messages_received_total',
    help: 'Total number of WebSocket messages received',
    labelNames: ['tenant_id', 'type'],
    registers: [register],
  }),

  errors: new Counter({
    name: 'calliq_websocket_errors_total',
    help: 'Total number of WebSocket errors',
    labelNames: ['tenant_id', 'error_type'],
    registers: [register],
  }),
};

// ============================================================================
// AUDIO PIPELINE METRICS
// ============================================================================

export const audioMetrics = {
  framesReceived: new Counter({
    name: 'calliq_audio_frames_received_total',
    help: 'Total number of audio frames received',
    labelNames: ['tenant_id', 'source'],
    registers: [register],
  }),

  framesSent: new Counter({
    name: 'calliq_audio_frames_sent_total',
    help: 'Total number of audio frames sent',
    labelNames: ['tenant_id', 'destination'],
    registers: [register],
  }),

  framesDropped: new Counter({
    name: 'calliq_audio_frames_dropped_total',
    help: 'Total number of audio frames dropped',
    labelNames: ['tenant_id', 'reason'],
    registers: [register],
  }),

  audioLatency: new Histogram({
    name: 'calliq_audio_latency_milliseconds',
    help: 'Audio processing latency in milliseconds',
    labelNames: ['tenant_id', 'stage'],
    buckets: [10, 25, 50, 100, 200, 500, 1000, 2000],
    registers: [register],
  }),

  audioJitter: new Histogram({
    name: 'calliq_audio_jitter_milliseconds',
    help: 'Audio jitter in milliseconds',
    labelNames: ['tenant_id'],
    buckets: [1, 5, 10, 20, 50, 100, 200],
    registers: [register],
  }),

  interruptions: new Counter({
    name: 'calliq_audio_interruptions_total',
    help: 'Total number of audio interruptions',
    labelNames: ['tenant_id'],
    registers: [register],
  }),
};

// ============================================================================
// TOOL EXECUTION METRICS
// ============================================================================

export const toolMetrics = {
  executions: new Counter({
    name: 'calliq_tool_executions_total',
    help: 'Total number of tool executions',
    labelNames: ['tenant_id', 'tool_name', 'status'],
    registers: [register],
  }),

  duration: new Histogram({
    name: 'calliq_tool_execution_duration_seconds',
    help: 'Tool execution duration in seconds',
    labelNames: ['tenant_id', 'tool_name'],
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
    registers: [register],
  }),

  timeouts: new Counter({
    name: 'calliq_tool_timeouts_total',
    help: 'Total number of tool execution timeouts',
    labelNames: ['tenant_id', 'tool_name'],
    registers: [register],
  }),

  retries: new Counter({
    name: 'calliq_tool_retries_total',
    help: 'Total number of tool execution retries',
    labelNames: ['tenant_id', 'tool_name'],
    registers: [register],
  }),

  circuitBreakerOpen: new Gauge({
    name: 'calliq_tool_circuit_breaker_open',
    help: 'Circuit breaker status (1 = open, 0 = closed)',
    labelNames: ['tenant_id', 'tool_name'],
    registers: [register],
  }),
};

// ============================================================================
// REDIS METRICS
// ============================================================================

export const redisMetrics = {
  operations: new Counter({
    name: 'calliq_redis_operations_total',
    help: 'Total number of Redis operations',
    labelNames: ['operation', 'status'],
    registers: [register],
  }),

  operationDuration: new Histogram({
    name: 'calliq_redis_operation_duration_milliseconds',
    help: 'Redis operation duration in milliseconds',
    labelNames: ['operation'],
    buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000],
    registers: [register],
  }),

  connectionErrors: new Counter({
    name: 'calliq_redis_connection_errors_total',
    help: 'Total number of Redis connection errors',
    registers: [register],
  }),

  keysScanned: new Counter({
    name: 'calliq_redis_keys_scanned_total',
    help: 'Total number of keys scanned (SCAN operations)',
    labelNames: ['pattern'],
    registers: [register],
  }),
};

// ============================================================================
// OPENAI METRICS
// ============================================================================

export const openaiMetrics = {
  requests: new Counter({
    name: 'calliq_openai_requests_total',
    help: 'Total number of OpenAI API requests',
    labelNames: ['tenant_id', 'type', 'status'],
    registers: [register],
  }),

  latency: new Histogram({
    name: 'calliq_openai_latency_milliseconds',
    help: 'OpenAI API latency in milliseconds',
    labelNames: ['tenant_id', 'type'],
    buckets: [100, 250, 500, 1000, 2000, 5000, 10000],
    registers: [register],
  }),

  errors: new Counter({
    name: 'calliq_openai_errors_total',
    help: 'Total number of OpenAI API errors',
    labelNames: ['tenant_id', 'error_type'],
    registers: [register],
  }),

  reconnects: new Counter({
    name: 'calliq_openai_reconnects_total',
    help: 'Total number of OpenAI WebSocket reconnects',
    labelNames: ['tenant_id'],
    registers: [register],
  }),

  tokensUsed: new Counter({
    name: 'calliq_openai_tokens_used_total',
    help: 'Total number of OpenAI tokens used',
    labelNames: ['tenant_id', 'type'],
    registers: [register],
  }),
};

// ============================================================================
// SYSTEM METRICS
// ============================================================================

export const systemMetrics = {
  memoryUsage: new Gauge({
    name: 'calliq_memory_usage_bytes',
    help: 'Memory usage in bytes',
    labelNames: ['type'],
    registers: [register],
  }),

  cpuUsage: new Gauge({
    name: 'calliq_cpu_usage_percent',
    help: 'CPU usage percentage',
    registers: [register],
  }),

  eventLoopLag: new Histogram({
    name: 'calliq_event_loop_lag_milliseconds',
    help: 'Event loop lag in milliseconds',
    buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000],
    registers: [register],
  }),

  activeHandles: new Gauge({
    name: 'calliq_active_handles',
    help: 'Number of active handles',
    registers: [register],
  }),

  activeRequests: new Gauge({
    name: 'calliq_active_requests',
    help: 'Number of active requests',
    registers: [register],
  }),
};

// ============================================================================
// BUSINESS METRICS
// ============================================================================

export const businessMetrics = {
  bookingsCreated: new Counter({
    name: 'calliq_bookings_created_total',
    help: 'Total number of bookings created',
    labelNames: ['tenant_id'],
    registers: [register],
  }),

  leadsCaptured: new Counter({
    name: 'calliq_leads_captured_total',
    help: 'Total number of leads captured',
    labelNames: ['tenant_id'],
    registers: [register],
  }),

  callsTransferred: new Counter({
    name: 'calliq_calls_transferred_total',
    help: 'Total number of calls transferred',
    labelNames: ['tenant_id'],
    registers: [register],
  }),

  knowledgeSearches: new Counter({
    name: 'calliq_knowledge_searches_total',
    help: 'Total number of knowledge base searches',
    labelNames: ['tenant_id'],
    registers: [register],
  }),

  conversationTurns: new Counter({
    name: 'calliq_conversation_turns_total',
    help: 'Total number of conversation turns',
    labelNames: ['tenant_id'],
    registers: [register],
  }),
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Start monitoring system metrics
 */
export function startSystemMetricsCollection(intervalMs: number = 10000): NodeJS.Timeout {
  return setInterval(() => {
    // Memory usage
    const memUsage = process.memoryUsage();
    systemMetrics.memoryUsage.set({ type: 'heap_used' }, memUsage.heapUsed);
    systemMetrics.memoryUsage.set({ type: 'heap_total' }, memUsage.heapTotal);
    systemMetrics.memoryUsage.set({ type: 'rss' }, memUsage.rss);
    systemMetrics.memoryUsage.set({ type: 'external' }, memUsage.external);

    // CPU usage
    const cpuUsage = process.cpuUsage();
    const cpuPercent = (cpuUsage.user + cpuUsage.system) / 1000000; // Convert to seconds
    systemMetrics.cpuUsage.set(cpuPercent);

    // Event loop lag
    const start = Date.now();
    setImmediate(() => {
      const lag = Date.now() - start;
      systemMetrics.eventLoopLag.observe(lag);
    });

  }, intervalMs);
}

/**
 * Express middleware to expose metrics endpoint
 */
export async function metricsHandler(req: Request, res: Response): Promise<void> {
  try {
    res.set('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.send(metrics);
  } catch (error) {
    res.status(500).send(clientErrorMessage(error, 'Metrics endpoint failed'));
  }
}

/**
 * Get current metrics as JSON
 */
export async function getMetricsJSON(): Promise<any> {
  const metrics = await register.getMetricsAsJSON();
  return metrics;
}

/**
 * Reset all metrics (for testing)
 */
export function resetMetrics(): void {
  register.resetMetrics();
}

/**
 * Track session lifecycle
 */
export function trackSession(
  event: 'created' | 'active' | 'closed' | 'failed',
  tenantId: string,
  duration?: number
): void {
  switch (event) {
    case 'created':
      sessionMetrics.sessionsTotal.inc({ tenant_id: tenantId, status: 'created' });
      sessionMetrics.sessionsActive.inc({ tenant_id: tenantId });
      break;
    case 'active':
      // Already tracked in created
      break;
    case 'closed':
      sessionMetrics.sessionsActive.dec({ tenant_id: tenantId });
      if (duration) {
        sessionMetrics.sessionDuration.observe({ tenant_id: tenantId, status: 'closed' }, duration);
      }
      break;
    case 'failed':
      sessionMetrics.sessionsActive.dec({ tenant_id: tenantId });
      sessionMetrics.sessionFailures.inc({ tenant_id: tenantId, reason: 'unknown' });
      if (duration) {
        sessionMetrics.sessionDuration.observe({ tenant_id: tenantId, status: 'failed' }, duration);
      }
      break;
  }
}

/**
 * Track WebSocket connection
 */
export function trackWebSocket(
  event: 'connected' | 'disconnected' | 'error',
  tenantId: string,
  endpoint: string,
  duration?: number
): void {
  switch (event) {
    case 'connected':
      websocketMetrics.connections.inc({ tenant_id: tenantId, endpoint, status: 'success' });
      websocketMetrics.activeConnections.inc({ tenant_id: tenantId, endpoint });
      break;
    case 'disconnected':
      websocketMetrics.activeConnections.dec({ tenant_id: tenantId, endpoint });
      if (duration) {
        websocketMetrics.connectionDuration.observe({ tenant_id: tenantId, endpoint }, duration);
      }
      break;
    case 'error':
      websocketMetrics.connections.inc({ tenant_id: tenantId, endpoint, status: 'error' });
      break;
  }
}

/**
 * Track audio frame
 */
export function trackAudioFrame(
  direction: 'received' | 'sent' | 'dropped',
  tenantId: string,
  source: string,
  count: number = 1
): void {
  switch (direction) {
    case 'received':
      audioMetrics.framesReceived.inc({ tenant_id: tenantId, source }, count);
      break;
    case 'sent':
      audioMetrics.framesSent.inc({ tenant_id: tenantId, destination: source }, count);
      break;
    case 'dropped':
      audioMetrics.framesDropped.inc({ tenant_id: tenantId, reason: source }, count);
      break;
  }
}

/**
 * Track tool execution
 */
export function trackTool(
  event: 'start' | 'complete' | 'timeout' | 'retry',
  tenantId: string,
  toolName: string,
  duration?: number
): void {
  switch (event) {
    case 'start':
      toolMetrics.executions.inc({ tenant_id: tenantId, tool_name: toolName, status: 'started' });
      break;
    case 'complete':
      toolMetrics.executions.inc({ tenant_id: tenantId, tool_name: toolName, status: 'completed' });
      if (duration) {
        toolMetrics.duration.observe({ tenant_id: tenantId, tool_name: toolName }, duration / 1000);
      }
      break;
    case 'timeout':
      toolMetrics.timeouts.inc({ tenant_id: tenantId, tool_name: toolName });
      break;
    case 'retry':
      toolMetrics.retries.inc({ tenant_id: tenantId, tool_name: toolName });
      break;
  }
}
