import { describe, it, expect } from 'vitest';
import { tuneAlerts, correlateAlerts } from '../../apps/gateway/src/observability/alerts/alert-tuning.service.js';
import { getAlertRules } from '../../apps/gateway/src/observability/alerts/alert-engine.js';
import { computeAdaptiveReconnectGraceMs } from '../../apps/gateway/src/services/runtime-reliability/adaptive-reconnect.js';

describe('post-P6 operational refinement', () => {
  it('dedupes repeated alerts within window', () => {
    const anomalies = [
      {
        id: 'dlq_growth',
        severity: 'warning' as const,
        category: 'events' as const,
        message: 'test',
        value: 50,
        threshold: 25,
      },
    ];
    tuneAlerts(anomalies, 't1');
    const second = tuneAlerts(anomalies, 't1');
    expect(second.length).toBe(0);
  });

  it('correlates alerts by category', () => {
    const tuned = tuneAlerts([
      {
        id: 'dlq_growth',
        severity: 'warning',
        category: 'events',
        message: 'a',
        value: 30,
        threshold: 25,
      },
      {
        id: 'reconnect_spike',
        severity: 'warning',
        category: 'runtime',
        message: 'b',
        value: 10,
        threshold: 8,
      },
    ]);
    const groups = correlateAlerts(tuned);
    expect(groups.length).toBeGreaterThan(0);
  });

  it('includes reconnect_storm in alert rules', () => {
    expect(getAlertRules().some((r) => r.id === 'reconnect_storm')).toBe(true);
  });

  it('increases adaptive grace with churn', () => {
    expect(computeAdaptiveReconnectGraceMs(5)).toBeGreaterThan(computeAdaptiveReconnectGraceMs(0));
  });
});
