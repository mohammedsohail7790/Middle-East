import { logger, getRequestContext } from '../services/logger.js';

interface GravityError extends Error {
  code: string;
  statusCode?: number;
  details?: any;
  requestId?: string;
}

export interface ErrorResponse {
    success: false;
    error: string;
    code: string;
    statusCode: number;
    details?: any;
    requestId?: string;
    timestamp: string;
    stack?: string;
}

export function errorHandler(
    err: Error,
    req: Request,
    res: Response,
    _next: NextFunction
): void {
    const requestId = (req as any).requestId;
    const context = getRequestContext(req);

    const safeBody =
        req.body && typeof req.body === 'object'
            ? Object.fromEntries(
                  Object.entries(req.body as Record<string, unknown>).map(([k, v]) => {
                      if (/password|token|secret|key|authorization/i.test(k)) {
                          return [k, '[redacted]'];
                      }
                      return [k, typeof v === 'string' && v.length > 200 ? `${v.slice(0, 200)}…` : v];
                  })
              )
            : undefined;

    logger.error('Request error', context, err, {
        path: req.path,
        method: req.method,
        body: safeBody,
        query: req.query,
    });

    // GravityError uses string codes (e.g. "1001"); Gaxios uses numeric HTTP codes — do not conflate
    const errCode = (err as { code?: unknown }).code;
    const isGravityError =
        err instanceof Error && typeof errCode === 'string' && /^[0-9]{4}$/.test(errCode);

    if (isGravityError) {
        const gravityErr = err as GravityError;
        const status = gravityErr.statusCode || 500;
        const response: ErrorResponse = {
            success: false,
            error: status >= 500 ? 'Request failed' : gravityErr.message,
            code: gravityErr.code,
            statusCode: status,
            requestId: gravityErr.requestId || requestId,
            timestamp: new Date().toISOString(),
        };

        res.status(status).json(response);
        return;
    }

    if (err.name === 'BillingNotConfiguredError' || (err as { code?: string }).code === 'BILLING_NOT_CONFIGURED') {
        const response: ErrorResponse = {
            success: false,
            error: err.message || 'Billing not configured',
            code: 'BILLING_NOT_CONFIGURED' as any,
            statusCode: 503,
            requestId,
            timestamp: new Date().toISOString(),
        };
        res.status(503).json(response);
        return;
    }

    // Handle validation errors (e.g., from Joi, Yup, Zod)
    if (err.name === 'ValidationError') {
        const response: ErrorResponse = {
            success: false,
            error: 'Validation failed',
            code: "VALIDATION_ERROR" as any,
            statusCode: 400,
            details: (err as any).details || err.message,
            requestId,
            timestamp: new Date().toISOString(),
        };

        if (process.env.NODE_ENV === 'development') {
            response.stack = err.stack;
        }

        res.status(400).json(response);
        return;
    }

    // Handle syntax errors (malformed JSON)
    if (err instanceof SyntaxError && 'body' in err) {
        const response: ErrorResponse = {
            success: false,
            error: 'Invalid JSON payload',
            code: "INVALID_INPUT" as any,
            statusCode: 400,
            requestId,
            timestamp: new Date().toISOString(),
        };

        res.status(400).json(response);
        return;
    }

    const response: ErrorResponse = {
        success: false,
        error: 'Internal server error',
        code: "INTERNAL_ERROR" as any,
        statusCode: 500,
        requestId,
        timestamp: new Date().toISOString(),
    };

    res.status(500).json(response);
}

// Async handler wrapper to catch errors in async route handlers
export function asyncHandler(
    fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
    return (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(fn(req, res, next)).catch((err: any) => next(err));
    };
}

// Not found handler
export function notFoundHandler(req: any, res: any): void {
    const requestId = (req as any).requestId;

    logger.warn('Resource not found', getRequestContext(req), undefined, {
        path: req.path,
        method: req.method,
    });

    const response: ErrorResponse = {
        success: false,
        error: `Cannot ${req.method} ${req.path}`,
        code: "NOT_FOUND" as any,
        statusCode: 404,
        requestId,
        timestamp: new Date().toISOString(),
    };

    res.status(404).json(response);
}

