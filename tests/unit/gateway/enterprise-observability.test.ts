import { describe, it, expect } from 'vitest';
import { computeRuntimeHealthScore } from '../../../apps/gateway/src/observability/enterprise/health-score.js';
import { toPrometheusText, incCounter } from '../../../apps/gateway/src/observability/enterprise/metrics-registry.js';

describe('enterprise observability', () => {
  it('computes health grade from DLQ and denials', () => {
    const h = computeRuntimeHealthScore({
      activeSessions: 5,
      reconnectRate: 0.01,
      dlqDepth: 100,
      consumerLagEstimate: 0,
      aiDenialRate: 0.3,
    });
    expect(h.score).toBeLessThan(80);
    expect(['A', 'B', 'C', 'D', 'F']).toContain(h.grade);
  });

  it('exports prometheus text', () => {
    incCounter('test_metric_total');
    const text = toPrometheusText();
    expect(text).toContain('test_metric_total');
  });
});
