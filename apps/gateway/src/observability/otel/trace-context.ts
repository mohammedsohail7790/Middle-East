import { randomBytes } from 'crypto';

/** W3C traceparent: version-traceId-spanId-flags */
export interface TraceContext {
  traceId: string;
  spanId: string;
  traceFlags: number;
}

export function parseTraceparent(header?: string): TraceContext | null {
  if (!header || typeof header !== 'string') return null;
  const parts = header.trim().split('-');
  if (parts.length !== 4 || parts[0] !== '00') return null;
  const traceId = parts[1];
  const spanId = parts[2];
  if (traceId.length !== 32 || spanId.length !== 16) return null;
  const traceFlags = parseInt(parts[3], 16);
  if (Number.isNaN(traceFlags)) return null;
  return { traceId, spanId, traceFlags };
}

export function formatTraceparent(ctx: TraceContext): string {
  const flags = (ctx.traceFlags & 0xff).toString(16).padStart(2, '0');
  return `00-${ctx.traceId}-${ctx.spanId}-${flags}`;
}

export function newTraceContext(parent?: TraceContext): TraceContext {
  if (parent) {
    return {
      traceId: parent.traceId,
      spanId: randomBytes(8).toString('hex'),
      traceFlags: parent.traceFlags,
    };
  }
  return {
    traceId: randomBytes(16).toString('hex'),
    spanId: randomBytes(8).toString('hex'),
    traceFlags: 1,
  };
}
