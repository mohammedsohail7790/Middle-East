import { buildRuntimeReliabilityReport } from '../../services/runtime-reliability/reliability-intelligence.service.js';
import { getPlatformEventBus, isP2EventBusEnabled } from '../../events/platform-event-bus.js';
import { collectStreamDiagnostics } from '../../events/event-metrics.js';

/** Lightweight forecasting — no ML agents, replay-safe heuristics only. */
export async function predictRuntimeDegradation(tenantId?: string) {
  const reliability = await buildRuntimeReliabilityReport(tenantId);
  let dlqDepth = 0;
  const bus = getPlatformEventBus();
  if (bus && isP2EventBusEnabled()) {
    const diag = await collectStreamDiagnostics(bus.getRedis());
    dlqDepth = (diag as { dlqDepth?: number }).dlqDepth || 0;
  }

  const forecast24h = {
    degradationScore: Math.min(100, reliability.degradationScore + dlqDepth / 10),
    reconnectQuality: Math.max(0, reliability.reconnectQualityScore - 5),
    dlqDepthProjected: Math.round(dlqDepth * 1.15),
  };

  return {
    tenantId: tenantId || null,
    current: reliability,
    forecast24h,
    confidence: dlqDepth > 50 ? 'low' : reliability.degradationScore > 40 ? 'medium' : 'high',
  };
}
