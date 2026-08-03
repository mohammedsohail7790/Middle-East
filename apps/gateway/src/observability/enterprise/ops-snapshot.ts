import { sessionRegistry } from '../../services/realtime/session-registry.js';
import { sessionWatchdog } from '../../services/realtime/session-watchdog.js';
import { aiGovernanceService } from '../../services/ai-governance/ai-governance.service.js';
import { listRecentAuditBuffer } from '../../services/ai-governance/execution-audit.js';
import { getPlatformEventBus, isP2EventBusEnabled } from '../../events/platform-event-bus.js';
import { collectStreamDiagnostics } from '../../events/event-metrics.js';
import { listRecentSpans } from './tracing.js';
import { computeRuntimeHealthScore } from './health-score.js';
import { getRegistrySnapshot } from './metrics-registry.js';
import { voiceRedis } from '../../services/voice/redis.client.js';
import { syncLiveMetricsToRegistry } from '../metrics-sync.js';
import { evaluateAnomalies } from '../anomaly-detection/anomaly-detector.js';
import { anomaliesToAlerts } from '../alerts/alert-engine.js';

export async function buildOpsSnapshot(tenantId?: string): Promise<Record<string, unknown>> {
  await syncLiveMetricsToRegistry();
  const mem = process.memoryUsage();
  const ai = aiGovernanceService.getMetricsSnapshot();
  const sessions = sessionRegistry.listActive();
  const filteredSessions = tenantId
    ? sessions.filter((s) => s.tenantId === tenantId)
    : sessions;

  let eventDiagnostics: Record<string, unknown> = { enabled: false };
  const bus = getPlatformEventBus();
  if (bus && isP2EventBusEnabled()) {
    eventDiagnostics = {
      enabled: true,
      ...(await collectStreamDiagnostics(bus.getRedis())),
    };
  }

  let liveCalls: unknown[] = [];
  if (tenantId) {
    try {
      const keys = await voiceRedis.keys(`live_call:${tenantId}:*`);
      for (const k of keys.slice(0, 50)) {
        const data = await voiceRedis.hgetall(k);
        if (data?.callSid) liveCalls.push(data);
      }
    } catch {
      liveCalls = [];
    }
  }

  const totalExec = ai.executions + ai.denials || 1;
  const health = computeRuntimeHealthScore({
    activeSessions: filteredSessions.length,
    reconnectRate: 0.05,
    dlqDepth: (eventDiagnostics as { dlqDepth?: number }).dlqDepth || 0,
    consumerLagEstimate: 0,
    aiDenialRate: ai.denials / totalExec,
  });

  const anomalies = await evaluateAnomalies(tenantId);
  const alerts = anomaliesToAlerts(anomalies);

  return {
    timestamp: new Date().toISOString(),
    tenantId: tenantId || null,
    process: {
      uptimeSec: Math.round(process.uptime()),
      memoryRssMb: Math.round(mem.rss / 1024 / 1024),
      memoryHeapMb: Math.round(mem.heapUsed / 1024 / 1024),
    },
    runtime: {
      activeSessions: filteredSessions.length,
      sessions: filteredSessions.slice(0, 25).map((s) => ({
        sessionId: s.sessionId,
        tenantId: s.tenantId,
        callSid: s.callSid,
        state: s.state,
        reconnectCount: s.metrics.reconnectCount,
        voiceSessionId: s.voiceSessionId,
      })),
      watchdog: sessionWatchdog.getMetrics(),
    },
    events: eventDiagnostics,
    ai: {
      metrics: ai,
      recentAudit: listRecentAuditBuffer(tenantId, 20),
    },
    traces: listRecentSpans(30),
    liveCalls,
    health,
    prometheus: getRegistrySnapshot(),
    anomalies,
    alerts,
  };
}
