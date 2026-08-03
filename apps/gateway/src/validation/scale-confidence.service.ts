import { adviseScaling } from '../observability/scaling/scaling-advisor.js';
import { evaluateBackpressure } from '../infrastructure/backpressure.js';
import { buildRuntimeReliabilityReport } from '../services/runtime-reliability/reliability-intelligence.service.js';

export async function scoreScaleConfidence() {
  const [scaling, backpressure, reliability] = await Promise.all([
    adviseScaling(),
    Promise.resolve(evaluateBackpressure()),
    buildRuntimeReliabilityReport(),
  ]);

  let score = 85;
  if (!scaling.scaleDownSafe) score -= 10;
  if (backpressure.level === 'critical') score -= 20;
  if (reliability.degradationScore > 40) score -= 15;

  return {
    scaleConfidence: Math.max(0, Math.min(100, score)),
    grade: score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : 'D',
    scaling,
    backpressure,
    runtimeStability: reliability.reconnectQualityScore,
    chaosReady: score >= 70,
  };
}
