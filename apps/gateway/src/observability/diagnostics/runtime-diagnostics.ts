import { sessionRegistry } from '../../services/realtime/session-registry.js';
import { sessionWatchdog } from '../../services/realtime/session-watchdog.js';
import { buildRuntimeReliabilityReport } from '../../services/runtime-reliability/reliability-intelligence.service.js';

export async function collectRuntimeDiagnostics(tenantId?: string) {
  const sessions = sessionRegistry
    .listActive()
    .filter((s) => !tenantId || s.tenantId === tenantId);

  const reconnectHeatmap = sessions.map((s) => ({
    sessionId: s.sessionId,
    tenantId: s.tenantId,
    callSid: s.callSid,
    reconnectCount: s.metrics.reconnectCount,
    state: s.state,
    transportAttached: s.hasActiveTransport(),
    lastHeartbeatAgeMs: Date.now() - s.lastHeartbeatAt,
  }));

  const reliability = await buildRuntimeReliabilityReport(tenantId);

  return {
    timestamp: new Date().toISOString(),
    reconnectHeatmap,
    watchdog: sessionWatchdog.getMetrics(),
    reliability,
    transportHealth: {
      attached: sessions.filter((s) => s.hasActiveTransport()).length,
      detached: sessions.filter((s) => !s.hasActiveTransport()).length,
    },
  };
}
