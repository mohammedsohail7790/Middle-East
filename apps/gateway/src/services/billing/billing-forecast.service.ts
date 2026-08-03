import { voiceDb } from '../voice/tenant-scope.js';
import { costIntelligence } from './cost-intelligence.service.js';

export interface BillingForecastReport {
  tenantId: string;
  openaiForecast30d: number;
  twilioForecast30d: number;
  totalForecast30d: number;
  marginEstimate: number;
  heatmap: { day: string; cost: number }[];
  anomalies: { type: string; message: string }[];
  recommendations: string[];
  expensiveCalls: { callId: string; cost: number }[];
  tokenEfficiencyScore: number;
  forecastConfidence: number;
}

export async function buildBillingForecast(
  tenantId: string,
  subscriptionAmount = 0
): Promise<BillingForecastReport> {
  const r = await voiceDb.query(
    `SELECT DATE(estimated_at) AS day,
            COALESCE(SUM(openai_cost), 0)::float AS openai,
            COALESCE(SUM(twilio_cost), 0)::float AS twilio,
            COALESCE(SUM(total_cost), 0)::float AS total
     FROM public.call_costs
     WHERE tenant_id = $1 AND estimated_at > NOW() - INTERVAL '14 days'
     GROUP BY DATE(estimated_at)
     ORDER BY day`,
    [tenantId]
  );

  const heatmap = r.rows.map((row) => ({
    day: String(row.day).slice(0, 10),
    cost: Math.round(Number(row.total) * 100) / 100,
  }));

  let weightedOpenai = 0;
  let weightedTwilio = 0;
  let weightSum = 0;
  r.rows.forEach((row, i) => {
    const w = i + 1;
    weightedOpenai += Number(row.openai) * w;
    weightedTwilio += Number(row.twilio) * w;
    weightSum += w;
  });
  const days = Math.max(1, heatmap.length);
  const openaiDaily = weightSum > 0 ? weightedOpenai / weightSum : 0;
  const twilioDaily = weightSum > 0 ? weightedTwilio / weightSum : 0;
  const openaiForecast30d = Math.round(openaiDaily * 30 * 100) / 100;
  const twilioForecast30d = Math.round(twilioDaily * 30 * 100) / 100;
  const totalForecast30d = openaiForecast30d + twilioForecast30d;
  const marginEstimate = subscriptionAmount - totalForecast30d;

  const recent = costIntelligence.getRecentCosts(20).filter((c) => c.tenantId === tenantId);

  const anomalies: BillingForecastReport['anomalies'] = [];
  if (totalForecast30d > subscriptionAmount * 0.9 && subscriptionAmount > 0) {
    anomalies.push({ type: 'margin_pressure', message: 'Projected costs exceed 90% of subscription' });
  }
  const spike = recent.find((c) => c.totalEstimatedCost > 2);
  if (spike) {
    anomalies.push({ type: 'call_cost_spike', message: `High-cost call ${spike.callId}` });
  }

  const recommendations: string[] = [];
  if (openaiForecast30d > twilioForecast30d * 2) {
    recommendations.push('OpenAI realtime dominates cost — review session length and tool frequency');
  }
  if (twilioForecast30d > openaiForecast30d) {
    recommendations.push('Twilio minutes dominate — review call duration and transfer patterns');
  }

  let expensiveCalls: BillingForecastReport['expensiveCalls'] = [];
  try {
    const exp = await voiceDb.query(
      `SELECT call_id, total_cost FROM public.call_costs
       WHERE tenant_id = $1 ORDER BY total_cost DESC LIMIT 5`,
      [tenantId]
    );
    expensiveCalls = exp.rows.map((row) => ({
      callId: row.call_id,
      cost: Math.round(Number(row.total_cost) * 100) / 100,
    }));
  } catch {
    expensiveCalls = recent
      .filter((c) => c.totalEstimatedCost > 1)
      .map((c) => ({ callId: c.callId, cost: c.totalEstimatedCost }));
  }

  const avgCallCost =
    recent.length > 0
      ? recent.reduce((s, c) => s + c.totalEstimatedCost, 0) / recent.length
      : 0;
  const tokenEfficiencyScore = Math.max(
    0,
    Math.min(100, Math.round(100 - avgCallCost * 40))
  );
  const forecastConfidence = Math.min(0.95, 0.5 + days / 28);

  return {
    tenantId,
    openaiForecast30d,
    twilioForecast30d,
    totalForecast30d,
    marginEstimate: Math.round(marginEstimate * 100) / 100,
    heatmap,
    anomalies,
    recommendations,
    expensiveCalls,
    tokenEfficiencyScore,
    forecastConfidence: Math.round(forecastConfidence * 100) / 100,
  };
}
