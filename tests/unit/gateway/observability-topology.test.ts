import { describe, it, expect } from 'vitest';
import { parseTraceparent, formatTraceparent, newTraceContext } from '../../../apps/gateway/src/observability/otel/trace-context.js';
import { getAlertRules } from '../../../apps/gateway/src/observability/alerts/alert-engine.js';
import { computeAdaptiveReconnectGraceMs } from '../../../apps/gateway/src/services/runtime-reliability/adaptive-reconnect.js';

describe('observability topology (P5)', () => {
  it('parses and formats W3C traceparent', () => {
    const ctx = newTraceContext();
    const header = formatTraceparent(ctx);
    const parsed = parseTraceparent(header);
    expect(parsed?.traceId).toBe(ctx.traceId);
    expect(parsed?.spanId).toBe(ctx.spanId);
  });

  it('exposes default alert rules', () => {
    const rules = getAlertRules();
    expect(rules.some((r) => r.id === 'dlq_growth')).toBe(true);
  });

  it('adapts reconnect grace under churn', () => {
    expect(computeAdaptiveReconnectGraceMs(5)).toBeGreaterThan(
      computeAdaptiveReconnectGraceMs(0)
    );
  });
});
