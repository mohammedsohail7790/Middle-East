import { buildTenantHealthReport } from '../tenant-health/tenant-health.service.js';
import { predictRuntimeDegradation } from '../runtime-prediction/runtime-prediction.service.js';
import { getGovernanceEffectiveness } from '../governance-intelligence/governance-intelligence.service.js';
import { getTenantBillingIntelligence } from '../../services/billing/billing-intelligence.service.js';
import { detectReconnectStorm } from '../../services/runtime-reliability/reconnect-storm.js';

export interface OperationalRecommendation {
  id: string;
  priority: 'high' | 'medium' | 'low';
  domain: 'runtime' | 'governance' | 'billing' | 'events';
  title: string;
  detail: string;
  confidence: number;
  remediationHint?: string;
}

export async function generateOperationalRecommendations(
  tenantId: string
): Promise<OperationalRecommendation[]> {
  const [health, prediction, governance, billing] = await Promise.all([
    buildTenantHealthReport(tenantId),
    predictRuntimeDegradation(tenantId),
    Promise.resolve(getGovernanceEffectiveness(tenantId)),
    getTenantBillingIntelligence(tenantId),
  ]);

  const storm = detectReconnectStorm(tenantId);
  const recs: OperationalRecommendation[] = [];

  if (storm.isStorm) {
    recs.push({
      id: 'reconnect_storm',
      priority: 'high',
      domain: 'runtime',
      title: 'Reconnect storm detected',
      detail: `${storm.reconnectingCount} sessions reconnecting — overlap risk ${storm.overlapRisk}`,
      confidence: storm.confidence,
      remediationHint: 'Check WebSocket proxy timeouts; avoid gateway rolling restart during peak',
    });
  } else if (health.reconnect.churnRiskScore > 30) {
    recs.push({
      id: 'reconnect_churn',
      priority: 'high',
      domain: 'runtime',
      title: 'Reduce reconnect churn',
      detail: prediction.current.recommendations.join(' ') || 'Review transport stability',
      confidence: 0.75,
      remediationHint: 'Review P1_RECONNECT_GRACE_MS and client backoff',
    });
  }
  if (governance.effectivenessScore < 70) {
    recs.push({
      id: 'governance_review',
      priority: 'medium',
      domain: 'governance',
      title: 'Review AI tool policies',
      detail: 'Elevated denials or guardrail triggers — tune allowed tools and quotas',
      confidence: 0.7,
      remediationHint: 'Open Governance console and review recent decisions',
    });
  }
  if (billing.quotaHeadroomPct < 20) {
    recs.push({
      id: 'cost_headroom',
      priority: 'medium',
      domain: 'billing',
      title: 'Cost headroom low',
      detail: `Forecast ${billing.forecastNext30d} vs subscription margin — review usage`,
      confidence: 0.65,
      remediationHint: 'Billing Intelligence → expensive calls and token efficiency',
    });
  }
  if (prediction.forecast24h.dlqDepthProjected > 30) {
    recs.push({
      id: 'dlq_forecast',
      priority: 'high',
      domain: 'events',
      title: 'DLQ growth projected',
      detail: 'Schedule consumer replay and inspect failing handlers',
      confidence: 0.8,
      remediationHint: 'POST /operations/replay-dlq after operator approval',
    });
  }
  if (!recs.length) {
    recs.push({
      id: 'healthy',
      priority: 'low',
      domain: 'runtime',
      title: 'Platform operating normally',
      detail: 'No critical recommendations for this tenant',
      confidence: 0.9,
    });
  }
  return recs.sort((a, b) => b.confidence - a.confidence);
}
