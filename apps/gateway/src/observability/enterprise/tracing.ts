import { randomUUID } from 'crypto';
import { getCorrelation, patchCorrelation } from '../../services/observability/correlation-context.js';
import { incCounter } from './metrics-registry.js';

export interface TraceSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startedAt: number;
  endedAt?: number;
  attributes: Record<string, string | number | boolean>;
  status: 'ok' | 'error';
}

const activeSpans = new Map<string, TraceSpan>();
const recentSpans: TraceSpan[] = [];
const MAX_SPANS = 500;

export function startSpan(
  name: string,
  attributes: Record<string, string | number | boolean> = {}
): string {
  const corr = getCorrelation();
  const spanId = `span_${randomUUID().slice(0, 12)}`;
  const traceId = corr.requestId || `trace_${randomUUID().slice(0, 12)}`;
  const span: TraceSpan = {
    traceId,
    spanId,
    name,
    startedAt: Date.now(),
    attributes: { ...attributes, tenantId: corr.tenantId || '', callSid: corr.callSid || '' },
    status: 'ok',
  };
  activeSpans.set(spanId, span);
  incCounter('calliq_spans_started_total', { name });
  return spanId;
}

export function endSpan(spanId: string, status: 'ok' | 'error' = 'ok'): void {
  const span = activeSpans.get(spanId);
  if (!span) return;
  span.endedAt = Date.now();
  span.status = status;
  activeSpans.delete(spanId);
  recentSpans.push(span);
  if (recentSpans.length > MAX_SPANS) recentSpans.shift();
  const dur = span.endedAt - span.startedAt;
  incCounter('calliq_spans_completed_total', { name: span.name, status });
  incCounter('calliq_span_duration_ms_sum', { name: span.name }, dur);
}

export function traceMiddlewareAttributes(): void {
  const corr = getCorrelation();
  if (corr.requestId) patchCorrelation(corr);
}

export function listRecentSpans(limit = 100): TraceSpan[] {
  return recentSpans.slice(-limit).reverse();
}
