import { describe, it, expect } from 'vitest';
import { computeRuntimeHealthScore } from '../../apps/gateway/src/observability/enterprise/health-score.js';

describe('chaos / continuity validation', () => {
  it('degrades health score when DLQ and denials spike', () => {
    const h = computeRuntimeHealthScore({
      activeSessions: 10,
      reconnectRate: 0.3,
      dlqDepth: 150,
      consumerLagEstimate: 200,
      aiDenialRate: 0.4,
    });
    expect(h.score).toBeLessThan(60);
    expect(h.grade).not.toBe('A');
  });

  it('preserves reconnect quality scoring bounds', () => {
    const low = computeRuntimeHealthScore({
      activeSessions: 2,
      reconnectRate: 0.01,
      dlqDepth: 0,
      consumerLagEstimate: 0,
      aiDenialRate: 0,
    });
    const high = computeRuntimeHealthScore({
      activeSessions: 2,
      reconnectRate: 0.5,
      dlqDepth: 0,
      consumerLagEstimate: 0,
      aiDenialRate: 0,
    });
    expect(low.score).toBeGreaterThan(high.score);
  });
});
