import { collectRuntimeDiagnostics } from '../../observability/diagnostics/runtime-diagnostics.js';
import { computeAdaptiveReconnectGraceMs } from '../../services/runtime-reliability/adaptive-reconnect.js';

export async function buildReconnectIntelligence(tenantId?: string) {
  const diag = await collectRuntimeDiagnostics(tenantId);
  const heatmap = diag.reconnectHeatmap || [];
  const avgReconnect =
    heatmap.length > 0
      ? heatmap.reduce((s, h) => s + h.reconnectCount, 0) / heatmap.length
      : 0;
  const churnRisk = Math.min(1, avgReconnect / 5);
  return {
    tenantId: tenantId || null,
    heatmap,
    avgReconnectCount: Math.round(avgReconnect * 100) / 100,
    adaptiveGraceMs: computeAdaptiveReconnectGraceMs(avgReconnect),
    churnRiskScore: Math.round(churnRisk * 100),
    detachedTransports: diag.transportHealth?.detached || 0,
    recommendations:
      churnRisk > 0.3
        ? ['Increase client reconnect backoff', 'Review WebSocket proxy timeouts']
        : ['Reconnect patterns within normal bounds'],
  };
}
