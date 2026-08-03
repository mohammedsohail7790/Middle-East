import { randomUUID } from 'crypto';
import { NextFunction } from 'express';
import WebSocket from 'ws';
import { logger, LogContext } from './logger.js';

const CORRELATION_HEADER = 'x-correlation-id';
const REQUEST_ID_HEADER = 'x-request-id';

export interface TraceContext {
    correlationId: string;
    requestId: string;
    spanId: string;
    parentSpanId?: string;
    service: string;
    startTime: number;
}

const correlationStore = new Map<string, TraceContext>();

function generateId(): string {
    return randomUUID().replace(/-/g, '').slice(0, 16);
}

export function createTraceContext(correlationId?: string, parentSpanId?: string): TraceContext {
    return {
        correlationId: correlationId || generateId(),
        requestId: generateId(),
        spanId: generateId(),
        parentSpanId,
        service: 'gateway',
        startTime: Date.now(),
    };
}

export function getCorrelationId(req: Request): string {
    return req.headers[CORRELATION_HEADER] as string || req.headers[REQUEST_ID_HEADER] as string || generateId();
}

export function tracingMiddleware(req: any, res: any, next: NextFunction): void {
    const correlationId = getCorrelationId(req);
    const ctx = createTraceContext(correlationId);

    req.headers[CORRELATION_HEADER] = correlationId;
    req.headers[REQUEST_ID_HEADER] = ctx.requestId;

    res.setHeader(CORRELATION_HEADER, correlationId);
    res.setHeader(REQUEST_ID_HEADER, ctx.requestId);

    correlationStore.set(ctx.spanId, ctx);

    const originalJson = res.json.bind(res);
    res.json = function (body: any) {
        if (body && typeof body === 'object') {
            body.correlationId = correlationId;
        }
        return originalJson(body);
    };

    res.on('finish', () => {
        const duration = Date.now() - ctx.startTime;
        correlationStore.delete(ctx.spanId);

        logger.debug('REQUEST_TRACE', {
            correlationId,
            requestId: ctx.requestId,
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            durationMs: duration,
        });
    });

    next();
}

export function wsTraceContext(req: any): TraceContext {
    const correlationId = req.headers?.[CORRELATION_HEADER] as string || generateId();
    return createTraceContext(correlationId);
}

export function traceWebSocketEvent(
    socket: WebSocket,
    eventType: string,
    data: any,
    tctx: TraceContext
): void {
    logger.debug('WS_TRACE', {
        correlationId: tctx.correlationId,
        spanId: tctx.spanId,
        eventType,
        sessionId: data?.sessionId,
        callSid: data?.callSid,
        streamSid: data?.streamSid,
        timestamp: Date.now(),
    });
}

export function toLogContext(tctx: TraceContext): LogContext {
    return {
        correlationId: tctx.correlationId,
        requestId: tctx.requestId,
        spanId: tctx.spanId,
    };
}

export class TraceTiming {
    private marks: Map<string, number> = new Map();
    constructor(public readonly name: string, public readonly tctx: TraceContext) {}

    mark(label: string): void {
        this.marks.set(label, Date.now());
    }

    elapsed(from: string, to: string): number {
        const f = this.marks.get(from);
        const t = this.marks.get(to);
        if (!f || !t) return -1;
        return t - f;
    }

    snapshot(): Record<string, number> {
        const result: Record<string, number> = {};
        for (const [label, time] of this.marks) {
            result[label] = time - this.tctx.startTime;
        }
        return result;
    }
}

export const traceContextSymbol = Symbol('traceContext');
