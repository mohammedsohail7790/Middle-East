import { logger } from '../../services/logger.js';
import { parseTraceparent, type TraceContext } from './trace-context.js';

export function traceFromHeaders(
  headers: Record<string, string | string[] | undefined>
): TraceContext | null {
  const raw = headers['traceparent'];
  const v = Array.isArray(raw) ? raw[0] : raw;
  return parseTraceparent(v);
}

let rootTrace: TraceContext | null = null;

export function isOtelEnabled(): boolean {
  return (process.env.CALLIQ_OTEL_ENABLED || 'true').toLowerCase() !== 'false';
}

export function bootstrapOtel(): void {
  if (!isOtelEnabled()) return;
  logger.info('OTEL_BOOTSTRAP', {
    exporter: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'in-process',
    service: process.env.OTEL_SERVICE_NAME || 'halla-ai-gateway',
  });
}

export function getActiveTrace(): TraceContext | null {
  return rootTrace;
}

export function setActiveTrace(ctx: TraceContext | null): void {
  rootTrace = ctx;
}

/** OTLP-compatible span export batch for external collectors (optional HTTP POST). */
export function toOtlpSpanBatch(spans: {
  traceId: string;
  spanId: string;
  name: string;
  startedAt: number;
  endedAt?: number;
  status: string;
  attributes?: Record<string, string | number | boolean>;
}[]): { resourceSpans: unknown[] } {
  return {
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: process.env.OTEL_SERVICE_NAME || 'halla-ai-gateway' } },
          ],
        },
        scopeSpans: [
          {
            scope: { name: 'halla-ai-gateway' },
            spans: spans.map((s) => ({
              traceId: s.traceId,
              spanId: s.spanId,
              name: s.name,
              startTimeUnixNano: String(s.startedAt * 1_000_000),
              endTimeUnixNano: String((s.endedAt || s.startedAt) * 1_000_000),
              status: { code: s.status === 'error' ? 2 : 1 },
              attributes: Object.entries(s.attributes || {}).map(([k, v]) => ({
                key: k,
                value: typeof v === 'number' ? { intValue: v } : { stringValue: String(v) },
              })),
            })),
          },
        ],
      },
    ],
  };
}
