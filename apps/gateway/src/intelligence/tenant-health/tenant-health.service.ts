import { computeTenantOperationalIntelligence } from '../operational-scoring/tenant-scoring.service.js';
import { buildAnomalyIntelligence } from '../anomaly-intelligence/anomaly-intelligence.service.js';
import { buildReconnectIntelligence } from '../reconnect-intelligence/reconnect-intelligence.service.js';

export async function buildTenantHealthReport(tenantId: string) {
  const [operational, anomalies, reconnect] = await Promise.all([
    computeTenantOperationalIntelligence(tenantId),
    buildAnomalyIntelligence(tenantId),
    buildReconnectIntelligence(tenantId),
  ]);

  const healthScore = Math.max(
    0,
    Math.round(
      operational.compositeScore * 0.5 +
        (100 - anomalies.riskScore) * 0.25 +
        reconnect.churnRiskScore * 0.25
    )
  );

  return {
    tenantId,
    healthScore,
    grade:
      healthScore >= 85 ? 'A' : healthScore >= 70 ? 'B' : healthScore >= 55 ? 'C' : healthScore >= 40 ? 'D' : 'F',
    operational,
    anomalies: { riskScore: anomalies.riskScore, alertCount: anomalies.alerts.length },
    reconnect: { churnRiskScore: reconnect.churnRiskScore, avgReconnect: reconnect.avgReconnectCount },
  };
}
