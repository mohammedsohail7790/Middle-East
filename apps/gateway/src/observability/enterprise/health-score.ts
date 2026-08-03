export interface RuntimeHealthScore {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  factors: { name: string; impact: number; detail: string }[];
}

export function computeRuntimeHealthScore(input: {
  activeSessions: number;
  reconnectRate: number;
  dlqDepth: number;
  consumerLagEstimate: number;
  aiDenialRate: number;
  overlapAnomalies24h?: number;
}): RuntimeHealthScore {
  const factors: RuntimeHealthScore['factors'] = [];
  let score = 100;

  if (input.dlqDepth > 50) {
    const impact = Math.min(30, input.dlqDepth / 5);
    score -= impact;
    factors.push({ name: 'dlq_depth', impact, detail: `DLQ depth ${input.dlqDepth}` });
  }
  if (input.reconnectRate > 0.15) {
    const impact = 15;
    score -= impact;
    factors.push({ name: 'reconnect_churn', impact, detail: `Reconnect rate ${(input.reconnectRate * 100).toFixed(1)}%` });
  }
  if (input.aiDenialRate > 0.2) {
    const impact = 10;
    score -= impact;
    factors.push({ name: 'ai_denials', impact, detail: `AI denial rate ${(input.aiDenialRate * 100).toFixed(1)}%` });
  }
  if (input.consumerLagEstimate > 100) {
    const impact = 20;
    score -= impact;
    factors.push({ name: 'consumer_lag', impact, detail: `Estimated lag ${input.consumerLagEstimate}` });
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const grade =
    score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F';

  return { score, grade, factors };
}
