import { getTenantOperationalScore } from '../../analytics/enterprise/operational-analytics.service.js';
import { buildRuntimeReliabilityReport } from '../../services/runtime-reliability/reliability-intelligence.service.js';

export async function computeTenantOperationalIntelligence(tenantId: string) {
  const [operational, reliability] = await Promise.all([
    getTenantOperationalScore(tenantId),
    buildRuntimeReliabilityReport(tenantId),
  ]);

  const composite =
    operational.runtimeHealthScore * 0.5 +
    reliability.reconnectQualityScore * 0.5;

  return {
    tenantId,
    compositeScore: Math.round(composite * 10) / 10,
    operational,
    reliability,
    grade:
      composite >= 85 ? 'A' : composite >= 70 ? 'B' : composite >= 55 ? 'C' : composite >= 40 ? 'D' : 'F',
  };
}
