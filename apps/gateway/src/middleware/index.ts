import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';

import { createClient, SupabaseClient } from '@supabase/supabase-js';

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp?: Date | string;
  requestId?: string;
}

// Re-export new middleware
export * from './error-handler.js';
export * from './validation.js';
export * from './plan-gating.js';

// Supabase admin client for JWT verification
let supabaseAdmin: SupabaseClient | null = null;
function getSupabaseAdmin(): SupabaseClient {
    if (!supabaseAdmin) {
        const url = process.env.SUPABASE_URL;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !serviceRoleKey) {
            throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for auth');
        }
        supabaseAdmin = createClient(url, serviceRoleKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        });
    }
    return supabaseAdmin;
}

// Enhanced middleware types
export interface AuthenticatedRequest extends Request {
    user?: {
        id: string;
        tier: 'FREE' | 'PRO' | 'ENTERPRISE';
        tenantId?: string;
        permissions: string[];
    };
    requestId?: string;
}

// Advanced Middleware Factory
export class MiddlewareFactory {
    private static requestIdCounter = 0;

    // Request ID Middleware
    static requestId() {
        return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
            req.requestId = `req-${Date.now()}-${++MiddlewareFactory.requestIdCounter}`;
            res.setHeader('X-Request-ID', req.requestId);
            next();
        };
    }

    // Enhanced Security Headers
    static security() {
        return helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    scriptSrc: ["'self'"],
                    imgSrc: ["'self'", "data:", "https:"],
                    connectSrc: ["'self'", "ws:", "wss:"],
                },
            },
            hsts: {
                maxAge: 31536000,
                includeSubDomains: true,
                preload: true
            }
        });
    }

    // Request Logging
    static logging() {
        return morgan('combined', {
            stream: {
                write: (message: string) => {
                    console.log(`[HTTP] ${message.trim()}`);
                }
            },
            skip: (req: Request) => {
                // Skip health checks and static assets
                return req.path === '/health' || req.path.startsWith('/static');
            }
        });
    }

    // Compression
    static compressionMiddleware(): any {
        return compression({
            filter: (req: any, res: any) => {
                if (req.headers['x-no-compression']) {
                    return false;
                }
                const accept = String(req.headers.accept || '');
                const path = String(req.path || req.url || '');
                if (accept.includes('text/event-stream') || path.includes('/dashboard/stream')) {
                    return false;
                }
                return (compression as any).filter(req, res);
            },
            threshold: 1024,
            level: 6
        });
    }

    // Enhanced Rate Limiting
    static createRateLimit(options: {
        windowMs: number;
        max: number;
        message?: string;
        skipSuccessfulRequests?: boolean;
        keyGenerator?: (req: any) => string;
    }) {
        return rateLimit({
            windowMs: options.windowMs,
            max: options.max,
            message: options.message || 'Too many requests',
            skipSuccessfulRequests: options.skipSuccessfulRequests || false,
            keyGenerator: options.keyGenerator || ((req: any) => {
                const user = (req as any).user;
                return user ? `user-${user.id}` : req.ip || 'unknown';
            }),
            standardHeaders: true,
            legacyHeaders: false,
        });
    }

    // Authentication Middleware
    static authenticate() {
        return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
            try {
                const authHeader = (req.headers as any).authorization;
                if (!authHeader || !authHeader.startsWith('Bearer ')) {
                    return res.status(401).json({
                        success: false,
                        error: 'Missing or invalid authorization header',
                        timestamp: new Date()
                    } as ApiResponse);
                }

                const token = authHeader.substring(7);

                // Allow admin API key for super-admin operations
                const adminKey = process.env.ADMIN_API_KEY;
                if (adminKey && token === adminKey) {
                    req.user = {
                        id: 'admin',
                        tier: 'ENTERPRISE',
                        permissions: ['read', 'write', 'admin', 'channels', 'skills', 'users', 'tenants']
                    };
                    return next();
                }

                // Verify Supabase JWT
                const supabase = getSupabaseAdmin();
                const { data: { user }, error } = await supabase.auth.getUser(token);

                if (error || !user) {
                    return res.status(401).json({
                        success: false,
                        error: 'Invalid or expired token',
                        timestamp: new Date()
                    } as ApiResponse);
                }

                // Extract tier from user metadata (set during signup/plan selection)
                const tier = (user.user_metadata?.tier as 'FREE' | 'PRO' | 'ENTERPRISE') || 'FREE';
                const tenantId = user.user_metadata?.tenant_id as string | undefined;

                const tierPermissions: Record<string, string[]> = {
                    FREE: ['read'],
                    PRO: ['read', 'write', 'channels', 'skills'],
                    ENTERPRISE: ['read', 'write', 'admin', 'channels', 'skills', 'users', 'tenants']
                };

                req.user = {
                    id: user.id,
                    tier,
                    tenantId,
                    permissions: tierPermissions[tier] || tierPermissions.FREE
                };

                next();
            } catch (error) {
                console.error('Authentication error:', error);
                res.status(500).json({
                    success: false,
                    error: 'Authentication error',
                    timestamp: new Date()
                } as ApiResponse);
            }
        };
    }

    // Permission-based Authorization
    static authorize(requiredPermissions: string[]) {
        return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    error: 'Authentication required',
                    timestamp: new Date()
                } as ApiResponse);
            }

            const hasPermission = requiredPermissions.every(permission =>
                req.user!.permissions.includes(permission) || req.user!.permissions.includes('admin')
            );

            if (!hasPermission) {
                return res.status(403).json({
                    success: false,
                    error: 'Insufficient permissions',
                    required: requiredPermissions,
                    timestamp: new Date()
                } as ApiResponse);
            }

            next();
        };
    }

    // Tier-based Rate Limiting
    static tierBasedRateLimit() {
        return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
            const user = req.user;
            if (!user) {
                return MiddlewareFactory.createRateLimit({
                    windowMs: 15 * 60 * 1000, // 15 minutes
                    max: 30 // Free tier limit
                })(req as any, res as any, next);
            }

            const limits = {
                FREE: { windowMs: 15 * 60 * 1000, max: 30 },
                PRO: { windowMs: 15 * 60 * 1000, max: 100 },
                ENTERPRISE: { windowMs: 15 * 60 * 1000, max: 500 }
            };

            const limit = limits[user.tier];
            return MiddlewareFactory.createRateLimit(limit)(req as any, res as any, next);
        };
    }

    // Request Validation
    static validateRequest(schema: any) {
        return (req: Request, res: Response, next: NextFunction) => {
            try {
                const { error, value } = schema.validate(req.body);
                if (error) {
                    return res.status(400).json({
                        success: false,
                        error: 'Validation error',
                        details: error.details.map((d: any) => d.message),
                        timestamp: new Date()
                    } as ApiResponse);
                }
                (req as any).body = value;
                next();
            } catch {
                res.status(500).json({
                    success: false,
                    error: 'Validation error',
                    timestamp: new Date()
                } as ApiResponse);
            }
        };
    }

    // Cache Control
    static cacheControl(maxAge: number = 300) {
        return (req: Request, res: Response, next: NextFunction) => {
            res.setHeader('Cache-Control', `public, max-age=${maxAge}`);
            next();
        };
    }

    // Health Check
    static healthCheck() {
        return (req: any, res: any) => {
            const health = {
                status: 'healthy',
                timestamp: new Date(),
                uptime: process.uptime(),
                version: process.env.npm_package_version || '1.0.0',
                environment: process.env.NODE_ENV || 'development',
                memory: process.memoryUsage(),
                lastCheck: new Date()
            };

            res.status(200).json(health);
        };
    }

    // Error Handling Middleware
    static errorHandler() {
        return (err: Error, req: Request, res: Response, _next: NextFunction) => {
            const requestId = (req as AuthenticatedRequest).requestId;

            console.error(`[Error ${requestId}]`, {
                error: err.message,
                stack: err.stack,
                url: req.url,
                method: req.method,
                ip: req.ip,
                userAgent: req.headers['user-agent']
            });

            // Don't leak error details in production
            const isDevelopment = process.env.NODE_ENV === 'development';

            res.status(500).json({
                success: false,
                error: isDevelopment ? err.message : 'Internal server error',
                requestId,
                timestamp: new Date(),
                ...(isDevelopment && { stack: err.stack })
            } as ApiResponse);
        };
    }

    // 404 Handler
    static notFoundHandler() {
        return (req: any, res: any) => {
            res.status(404).json({
                success: false,
                error: 'Endpoint not found',
                path: req.path,
                method: req.method,
                timestamp: new Date()
            } as ApiResponse);
        };
    }
}

// API Response Helpers
export class ResponseHelper {
    static success<T>(res: Response, data: T, message?: string, statusCode: number = 200) {
        return res.status(statusCode).json({
            success: true,
            data,
            message,
            timestamp: new Date()
        } as any);
    }

    static error(res: Response, error: string, statusCode: number = 500, details?: any) {
        return res.status(statusCode).json({
            success: false,
            error,
            details,
            timestamp: new Date()
        } as ApiResponse);
    }

    static paginated<T>(res: Response, data: T[], page: number, limit: number, total: number) {
        const totalPages = Math.ceil(total / limit);
        return res.status(200).json({
            success: true,
            data,
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1
            },
            timestamp: new Date()
        } as ApiResponse);
    }
}

// Request Validation Schemas
export const ValidationSchemas = {
    message: {
        userId: { type: 'string', required: true },
        text: { type: 'string', required: true, minLength: 1, maxLength: 10000 },
        channelId: { type: 'string', optional: true },
        metadata: { type: 'object', optional: true }
    },

    channelSend: {
        channelId: { type: 'string', required: true },
        content: { type: 'string', required: true, minLength: 1, maxLength: 5000 },
        options: { type: 'object', optional: true }
    },

    skillExecution: {
        skillId: { type: 'string', required: true },
        userId: { type: 'string', required: true },
        workspaceId: { type: 'string', optional: true },
        input: { type: 'string', required: true, minLength: 1, maxLength: 10000 }
    }
};

// Rate Limiting Presets
export const RateLimitPresets = {
    strict: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        maxRequests: 10
    },
    moderate: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        maxRequests: 100
    },
    lenient: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        maxRequests: 1000
    },
    upload: {
        windowMs: 60 * 60 * 1000, // 1 hour
        maxRequests: 50
    }
};

