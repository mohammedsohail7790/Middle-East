import { voiceDb } from '../voice/tenant-scope.js';
import { costIntelligence } from './cost-intelligence.service.js';
import { aiGovernanceService } from '../ai-governance/ai-governance.service.js';

export interface TenantBillingIntelligence {
  tenantId: string;
  estimatedMonthlyCost: number;
  recentCallCosts: number;
  aiExecutions: number;
  aiDenials: number;
  quotaHeadroomPct: number;
  forecastNext30d: number;
}

export async function getTenantBillingIntelligence(
  tenantId: string,
  plan = 'professional',
  subscriptionAmount = 0
): Promise<TenantBillingIntelligence> {
  const profitability = await costIntelligence.getTenantProfitability(
    tenantId,
    plan,
    subscriptionAmount
  );
  const ai = aiGovernanceService.getMetricsSnapshot();
  const recent = costIntelligence.getRecentCosts(50).filter((c) => c.tenantId === tenantId);
  const recentCallCosts = recent.reduce((sum, c) => sum + c.totalEstimatedCost, 0);
  const projected = profitability?.projectedMonthlyCost || recentCallCosts * 4;
  const revenue = profitability?.projectedMonthlyRevenue || subscriptionAmount;
  const headroom =
    revenue > 0 ? Math.max(0, Math.round(((revenue - projected) / revenue) * 100)) : 100;

  return {
    tenantId,
    estimatedMonthlyCost: projected,
    recentCallCosts: Math.round(recentCallCosts * 100) / 100,
    aiExecutions: ai.executions,
    aiDenials: ai.denials,
    quotaHeadroomPct: headroom,
    forecastNext30d: Math.round(projected * 1.05 * 100) / 100,
  };
}

export async function getUsageRollup(tenantId: string) {
  const calls = await voiceDb.query(
    `SELECT COUNT(*)::int AS c FROM public.calls
     WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '30 days'`,
    [tenantId]
  );
  return {
    tenantId,
    calls30d: calls.rows[0]?.c || 0,
    billing: await getTenantBillingIntelligence(tenantId),
  };
}
