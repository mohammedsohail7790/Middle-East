import { sessionRegistry } from '../../services/realtime/session-registry.js';
import { aiGovernanceService } from '../../services/ai-governance/ai-governance.service.js';
import { getPlatformEventBus, isP2EventBusEnabled } from '../../events/platform-event-bus.js';
import { collectStreamDiagnostics } from '../../events/event-metrics.js';
import { incCounter } from '../enterprise/metrics-registry.js';
import { detectReconnectStorm } from '../../services/runtime-reliability/reconnect-storm.js';

export interface PlatformAnomaly {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  category: 'runtime' | 'events' | 'governance' | 'infrastructure';
  message: string;
  metric?: string;
  value?: number;
  threshold?: number;
  confidence?: number;
}

export async function evaluateAnomalies(tenantId?: string): Promise<PlatformAnomaly[]> {
  const anomalies: PlatformAnomaly[] = [];
  const sessions = sessionRegistry
    .listActive()
    .filter((s) => !tenantId || s.tenantId === tenantId);

  const storm = detectReconnectStorm(tenantId);
  if (storm.isStorm) {
    anomalies.push({
      id: 'reconnect_storm',
      severity: storm.overlapRisk === 'high' ? 'critical' : 'warning',
      category: 'runtime',
      message: `Reconnect storm: ${storm.reconnectingCount} reconnecting, overlap risk ${storm.overlapRisk}`,
      metric: 'reconnect_storm',
      value: storm.reconnectingCount,
      threshold: 5,
      confidence: storm.confidence,
    });
    incCounter('calliq_anomaly_reconnect_storm_total');
  }

  const highReconnect = sessions.filter((s) => s.metrics.reconnectCount >= 3);
  if (highReconnect.length > 0 && !storm.isStorm) {
    anomalies.push({
      id: 'reconnect_spike',
      severity: 'warning',
      category: 'runtime',
      message: `${highReconnect.length} session(s) with elevated reconnect count`,
      metric: 'reconnect_count',
      value: highReconnect.length,
      threshold: 3,
    });
    incCounter('calliq_anomaly_reconnect_spike_total');
  }

  const ai = aiGovernanceService.getMetricsSnapshot();
  const denialRate = ai.executions + ai.denials > 0 ? ai.denials / (ai.executions + ai.denials) : 0;
  if (denialRate > 0.25) {
    anomalies.push({
      id: 'governance_denial_rate',
      severity: 'warning',
      category: 'governance',
      message: `AI denial rate ${(denialRate * 100).toFixed(1)}% exceeds threshold`,
      metric: 'ai_denial_rate',
      value: denialRate,
      threshold: 0.25,
    });
    incCounter('calliq_anomaly_governance_denial_total');
  }

  const bus = getPlatformEventBus();
  if (bus && isP2EventBusEnabled()) {
    const diag = await collectStreamDiagnostics(bus.getRedis());
    const dlq = (diag as { dlqDepth?: number }).dlqDepth || 0;
    if (dlq > 25) {
      anomalies.push({
        id: 'dlq_growth',
        severity: dlq > 100 ? 'critical' : 'warning',
        category: 'events',
        message: `DLQ depth ${dlq} — replay or inspect failing consumers`,
        metric: 'dlq_depth',
        value: dlq,
        threshold: 25,
      });
      incCounter('calliq_anomaly_dlq_growth_total');
    }
  }

  const mem = process.memoryUsage();
  const heapMb = mem.heapUsed / 1024 / 1024;
  if (heapMb > Number(process.env.CALLIQ_HEAP_WARN_MB || 512)) {
    anomalies.push({
      id: 'memory_pressure',
      severity: 'warning',
      category: 'infrastructure',
      message: `Heap usage ${Math.round(heapMb)}MB elevated`,
      metric: 'heap_mb',
      value: heapMb,
      threshold: Number(process.env.CALLIQ_HEAP_WARN_MB || 512),
    });
  }

  return anomalies;
}
