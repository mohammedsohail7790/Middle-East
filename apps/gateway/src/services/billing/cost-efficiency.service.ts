import { buildBillingForecast } from './billing-forecast.service.js';
import { getTenantBillingIntelligence } from './billing-intelligence.service.js';

export async function scoreRuntimeCostEfficiency(tenantId: string, subscription = 0) {
  const [forecast, billing] = await Promise.all([
    buildBillingForecast(tenantId, subscription),
    getTenantBillingIntelligence(tenantId, 'professional', subscription),
  ]);

  const efficiency = Math.round(
    (forecast.tokenEfficiencyScore * 0.5 +
      billing.quotaHeadroomPct * 0.3 +
      forecast.forecastConfidence * 100 * 0.2) *
      10
  ) / 10;

  return {
    tenantId,
    efficiencyScore: efficiency,
    tokenEfficiency: forecast.tokenEfficiencyScore,
    quotaHeadroom: billing.quotaHeadroomPct,
    optimizations: [
      ...forecast.recommendations,
      forecast.expensiveCalls.length
        ? `Review ${forecast.expensiveCalls.length} high-cost inbound calls`
        : 'No expensive call outliers in recent window',
    ],
  };
}
