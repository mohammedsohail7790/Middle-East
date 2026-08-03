import { sessionRegistry } from '../services/realtime/session-registry.js';
import { sessionWatchdog } from '../services/realtime/session-watchdog.js';
import { aiGovernanceService } from '../services/ai-governance/ai-governance.service.js';
import { getPlatformEventBus, isP2EventBusEnabled } from '../events/platform-event-bus.js';
import { collectStreamDiagnostics } from '../events/event-metrics.js';
import { setGauge, incCounter } from './enterprise/metrics-registry.js';
import { evaluateBackpressure } from '../infrastructure/backpressure.js';

/** Push live platform state into Prometheus registry before scrape. */
export async function syncLiveMetricsToRegistry(): Promise<void> {
  const sessions = sessionRegistry.listActive();
  const reconnectTotal = sessions.reduce((n, s) => n + s.metrics.reconnectCount, 0);
  const reconnecting = sessions.filter((s) => s.state === 'reconnecting').length;

  setGauge('calliq_active_sessions', sessions.length);
  setGauge('calliq_reconnecting_sessions', reconnecting);
  setGauge('calliq_reconnect_total', reconnectTotal);

  const wd = sessionWatchdog.getMetrics();
  setGauge('calliq_watchdog_orphan_cleanups', wd.orphanCleanups);
  setGauge('calliq_watchdog_stale_heartbeats', wd.staleHeartbeats);

  const ai = aiGovernanceService.getMetricsSnapshot();
  setGauge('calliq_ai_executions', ai.executions);
  setGauge('calliq_ai_denials', ai.denials);
  setGauge('calliq_ai_guardrail_triggers', ai.guardrailTriggers);
  setGauge('calliq_dlq_depth', 0);

  const bus = getPlatformEventBus();
  if (bus && isP2EventBusEnabled()) {
    try {
      const diag = await collectStreamDiagnostics(bus.getRedis());
      setGauge('calliq_dlq_depth', (diag as { dlqDepth?: number }).dlqDepth || 0);
      const streams = (diag as { streams?: Record<string, number> }).streams || {};
      for (const [name, depth] of Object.entries(streams)) {
        setGauge('calliq_stream_depth', depth, { stream: name });
      }
    } catch {
      incCounter('calliq_metrics_sync_errors_total');
    }
  }

  const mem = process.memoryUsage();
  setGauge('calliq_process_rss_bytes', mem.rss);
  setGauge('calliq_process_heap_bytes', mem.heapUsed);

  const bp = evaluateBackpressure();
  setGauge('calliq_backpressure_level', bp.level === 'normal' ? 0 : bp.level === 'elevated' ? 1 : 2);
}
