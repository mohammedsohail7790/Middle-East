import { randomUUID } from 'crypto';
import type { Response, NextFunction } from 'express';
import type { CallIqAuthenticatedRequest } from '../services/auth/tenant-context.js';
import { logger } from '../services/logger.js';
import { runWithCorrelation, correlationLogFields, patchCorrelation } from '../services/observability/correlation-context.js';
import { traceFromHeaders, setActiveTrace, isOtelEnabled } from '../observability/otel/otel-bootstrap.js';
import { newTraceContext, formatTraceparent } from '../observability/otel/trace-context.js';
import { startSpan, endSpan } from '../observability/enterprise/tracing.js';

export function requestTracingMiddleware(
  req: CallIqAuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const incoming = req.header('x-request-id');
  const requestId =
    incoming && /^[a-zA-Z0-9-]{8,64}$/.test(incoming) ? incoming : randomUUID();

  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);

  const parentTrace = isOtelEnabled() ? traceFromHeaders(req.headers as Record<string, string | string[] | undefined>) : null;
  const trace = parentTrace ? { traceId: parentTrace.traceId, spanId: parentTrace.spanId, traceFlags: parentTrace.traceFlags } : newTraceContext();
  if (isOtelEnabled()) {
    setActiveTrace(trace);
    res.setHeader('traceparent', formatTraceparent(trace));
  }

  runWithCorrelation({ requestId }, () => {
    const spanId = startSpan('http.request', { method: req.method, path: req.originalUrl });
    patchCorrelation({ requestId });
    const start = Date.now();
    res.on('finish', () => {
      endSpan(spanId, res.statusCode >= 500 ? 'error' : 'ok');
      logger.info('HTTP_REQUEST_COMPLETE', {
        ...correlationLogFields({ tenantId: req.tenant?.id, userId: req.tenant?.userId }),
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Date.now() - start,
      });
    });

    next();
  });
}
