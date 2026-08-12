import { buildTenantHealthReport } from '../intelligence/tenant-health/tenant-health.service.js';
import { buildAnomalyIntelligence } from '../intelligence/anomaly-intelligence/anomaly-intelligence.service.js';
import { getReplayStatus } from '../operations/replay-orchestration/replay.service.js';
import { getGovernanceEffectiveness } from '../intelligence/governance-intelligence/governance-intelligence.service.js';
import { collectRuntimeDiagnostics } from '../observability/diagnostics/runtime-diagnostics.js';
import { detectReconnectStorm } from '../services/runtime-reliability/reconnect-storm.js';

export async function buildTenantDiagnosticsPack(tenantId: string) {
  const [health, anomalies, replay, governance, runtime, storm] = await Promise.all([
    buildTenantHealthReport(tenantId),
    buildAnomalyIntelligence(tenantId),
    getReplayStatus(),
    Promise.resolve(getGovernanceEffectiveness(tenantId)),
    collectRuntimeDiagnostics(tenantId),
    Promise.resolve(detectReconnectStorm(tenantId)),
  ]);

  return {
    tenantId,
    generatedAt: new Date().toISOString(),
    health,
    anomalies: anomalies.alerts,
    replay,
    governance,
    runtime,
    reconnectStorm: storm,
    supportSummary:
      health.healthScore >= 80
        ? 'Tenant operating within normal parameters'
        : 'Elevated operational signals — review Support diagnostics and Analytics',
  };
}
