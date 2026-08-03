import { getTenantOperationalScore } from '../../analytics/enterprise/operational-analytics.service.js';
import { buildRuntimeReliabilityReport } from '../../services/runtime-reliability/reliability-intelligence.service.js';
import { getTenantBillingIntelligence } from '../../services/billing/billing-intelligence.service.js';

export async function computeTenantOperationalIntelligence(tenantId: string) {
  const [operational, reliability, billing] = await Promise.all([
    getTenantOperationalScore(tenantId),
    buildRuntimeReliabilityReport(tenantId),
    getTenantBillingIntelligence(tenantId),
  ]);

  const composite =
    operational.runtimeHealthScore * 0.4 +
    reliability.reconnectQualityScore * 0.3 +
    Math.min(100, billing.quotaHeadroomPct) * 0.3;

  return {
    tenantId,
    compositeScore: Math.round(composite * 10) / 10,
    operational,
    reliability,
    billing,
    grade:
      composite >= 85 ? 'A' : composite >= 70 ? 'B' : composite >= 55 ? 'C' : composite >= 40 ? 'D' : 'F',
  };
}
