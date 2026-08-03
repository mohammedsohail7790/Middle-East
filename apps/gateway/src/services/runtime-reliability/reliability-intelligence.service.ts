import { sessionRegistry } from '../realtime/session-registry.js';
import { sessionWatchdog } from '../realtime/session-watchdog.js';
import { computeRuntimeHealthScore } from '../../observability/enterprise/health-score.js';
import { getPlatformEventBus, isP2EventBusEnabled } from '../../events/platform-event-bus.js';
import { collectStreamDiagnostics } from '../../events/event-metrics.js';

export interface RuntimeReliabilityReport {
  tenantId: string | null;
  degradationScore: number;
  reconnectQualityScore: number;
  orphanRiskEstimate: number;
  activeSessions: number;
  avgReconnectCount: number;
  transportDegraded: number;
  health: ReturnType<typeof computeRuntimeHealthScore>;
  watchdog: Record<string, number>;
  recommendations: string[];
  adaptiveReconnectGraceMs: number;
}

import { computeAdaptiveReconnectGraceMs } from './adaptive-reconnect.js';

/** Extends P1 runtime authority — no distributed mesh. */
export async function buildRuntimeReliabilityReport(
  tenantId?: string
): Promise<RuntimeReliabilityReport> {
  const sessions = sessionRegistry
    .listActive()
    .filter((s) => !tenantId || s.tenantId === tenantId);

  const reconnects = sessions.map((s) => s.metrics.reconnectCount);
  const avgReconnect =
    reconnects.length ? reconnects.reduce((a, b) => a + b, 0) / reconnects.length : 0;
  const transportDegraded = sessions.filter((s) => s.state === 'reconnecting').length;

  let dlqDepth = 0;
  const bus = getPlatformEventBus();
  if (bus && isP2EventBusEnabled()) {
    const diag = await collectStreamDiagnostics(bus.getRedis());
    dlqDepth = (diag as { dlqDepth?: number }).dlqDepth || 0;
  }

  const reconnectRate = Math.min(1, avgReconnect / 5);
  const health = computeRuntimeHealthScore({
    activeSessions: sessions.length,
    reconnectRate,
    dlqDepth,
    consumerLagEstimate: 0,
    aiDenialRate: 0,
  });

  const degradationScore = Math.round(
    (reconnectRate * 40 + (transportDegraded / Math.max(1, sessions.length)) * 30 +
      Math.min(30, dlqDepth / 3)) *
      10
  ) / 10;
  const reconnectQualityScore = Math.max(0, Math.round((1 - reconnectRate) * 100));
  const wd = sessionWatchdog.getMetrics();
  const orphanRiskEstimate = Math.min(1, (wd.orphanCleanups || 0) / 20);

  const recommendations: string[] = [];
  if (reconnectRate > 0.2) recommendations.push('Review WebSocket reconnect grace and client backoff');
  if (dlqDepth > 25) recommendations.push('Replay DLQ events and inspect failing consumers');
  if (transportDegraded > 0) recommendations.push('Check upstream transport latency for degraded sessions');

  return {
    tenantId: tenantId || null,
    degradationScore,
    reconnectQualityScore,
    orphanRiskEstimate,
    activeSessions: sessions.length,
    avgReconnectCount: Math.round(avgReconnect * 100) / 100,
    transportDegraded,
    health,
    watchdog: sessionWatchdog.getMetrics(),
    recommendations,
    adaptiveReconnectGraceMs: computeAdaptiveReconnectGraceMs(avgReconnect),
  };
}
