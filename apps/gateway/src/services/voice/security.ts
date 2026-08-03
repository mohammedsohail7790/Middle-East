import type { Request, Response, NextFunction } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';

import { logger } from '../logger.js';
import { resolveTenantIdFromRequest } from '../auth/resolve-tenant.js';
import { attachTenantContext } from '../auth/tenant-context.js';
import {
  logAuthResolution,
  logTenantShadowMismatch,
} from '../observability/validation-telemetry.js';
import { patchCorrelation } from '../observability/correlation-context.js';

const voiceRateState = new Map<string, { count: number; resetsAt: number }>();

function normalizeHost(host?: string): string {
    return (host || '').toLowerCase().trim();
}

function normalizeIp(ip?: string): string {
    return (ip || '').replace('::ffff:', '').trim();
}

/** Twilio Media Streams connect without a browser Origin — do not apply dashboard origin rules to them */
export function isTwilioMediaStreamUpgrade(request: { url?: string; headers?: Record<string, string | string[] | undefined> }): boolean {
    const url = request.url || '';
    if (!url.includes('/ws/realtime/')) return false;
    const origin = request.headers?.origin;
    if (!origin) return true;
    if (typeof origin === 'string' && origin.toLowerCase().includes('twilio')) return true;
    return false;
}

export function isAllowedVoiceWebSocketSource(
    origin: string | undefined,
    ipAddress: string | undefined,
    request?: { url?: string; headers?: Record<string, string | string[] | undefined> }
): boolean {
    if (request && isTwilioMediaStreamUpgrade(request)) {
        return true;
    }

    const allowedOrigins = (process.env.VOICE_WS_ALLOWED_ORIGINS || '').split(',').map((v) => v.trim()).filter(Boolean);
    const allowedIps = (process.env.VOICE_WS_ALLOWED_IPS || '').split(',').map((v) => normalizeIp(v)).filter(Boolean);

    if (origin && allowedOrigins.length > 0) {
        if (!allowedOrigins.includes(origin)) return false;
    }

    if (allowedIps.length > 0) {
        const ip = normalizeIp(ipAddress);
        if (!allowedIps.includes(ip)) return false;
    }

    return true;
}

function serializeTwilioParams(body: Record<string, unknown>): string {
    return Object.keys(body)
        .sort()
        .map((key) => `${key}${String(body[key] ?? '')}`)
        .join('');
}

function buildTwilioRequestUrl(req: Request): string {
    const forwardedProto = (req.headers['x-forwarded-proto'] as string) || req.protocol;
    const host = normalizeHost((req.headers['x-forwarded-host'] as string) || req.get('host') || '');
    return `${forwardedProto}://${host}${req.originalUrl}`;
}

export function validateTwilioSignature(req: Request): boolean {
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const signature = String(req.header('x-twilio-signature') || '');
    if (!authToken || !signature) return false;

    const payload = `${buildTwilioRequestUrl(req)}${serializeTwilioParams((req as any).body || {})}`;
    const expected = createHmac('sha1', authToken).update(payload).digest('base64');

    const expectedBuffer = Buffer.from(expected);
    const actualBuffer = Buffer.from(signature);
    if (expectedBuffer.length !== actualBuffer.length) return false;
    return timingSafeEqual(expectedBuffer, actualBuffer);
}

export function twilioWebhookGuard(req: Request, res: Response, next: NextFunction): void {
    const skipSignature =
        process.env.TWILIO_SKIP_SIGNATURE_VALIDATION === 'true' &&
        process.env.NODE_ENV !== 'production';

    if (skipSignature) {
        logger.warn('Twilio signature validation skipped (TWILIO_SKIP_SIGNATURE_VALIDATION)', {
            path: req.originalUrl,
        });
        next();
        return;
    }

    try {
        const allowedTwilioIps = (process.env.TWILIO_ALLOWED_IPS || '')
            .split(',')
            .map((value) => normalizeIp(value))
            .filter(Boolean);
        if (allowedTwilioIps.length > 0 && !allowedTwilioIps.includes(normalizeIp(req.ip))) {
            logger.warn('Twilio webhook rejected from non-allowlisted IP', {
                ip: req.ip,
                path: req.originalUrl,
            });
            res.status(403).send('Forbidden');
            return;
        }

        const valid = validateTwilioSignature(req);
        if (!valid) {
            logger.warn('Twilio webhook rejected due to invalid signature', {
                ip: req.ip,
                path: req.originalUrl,
            });
            res.status(403).send('Forbidden');
            return;
        }
        next();
    } catch (error) {
        logger.error('Twilio signature validation failed unexpectedly', { error: String(error) });
        res.status(403).send('Forbidden');
    }
}

export async function requireVoiceApiAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
    // CORS preflight must not require JWT (browser sends OPTIONS before Authorization)
    if (req.method === 'OPTIONS') {
        next();
        return;
    }

    const { getTenantContext } = await import('../auth/tenant-context.js');
    const existingTenant = getTenantContext(req);
    if (existingTenant?.id) {
        patchCorrelation({
            tenantId: existingTenant.id,
            requestId: (req as { requestId?: string }).requestId,
        });
        req.headers['x-tenant-id'] = existingTenant.id;
        next();
        return;
    }

    const internalApiKey = String(req.header('x-internal-api-key') || '');
    const authHeader = String(req.header('authorization') || '');

    const queryToken =
        typeof (req as any).query?.token === 'string' ? (req as any).query.token : undefined;
    const queryTenant =
        typeof (req as any).query?.tenant_id === 'string' ? (req as any).query.tenant_id : undefined;

    const resolved = await resolveTenantIdFromRequest(
        authHeader,
        req.header('x-tenant-id') || queryTenant || undefined,
        queryToken,
        internalApiKey || undefined
    );

    if ('error' in resolved) {
        logAuthResolution(req, {
          tenantId: '',
          source: internalApiKey ? 'internal_service' : 'user_jwt',
          status: resolved.status,
          error: resolved.error,
        });
        res.status(resolved.status).json({ success: false, error: resolved.error });
        return;
    }

    const source = internalApiKey ? 'internal_service' : 'user_jwt';
    const clientHint = req.header('x-tenant-id') || queryTenant || undefined;
    attachTenantContext(req, {
      id: resolved.tenantId,
      source: source as 'internal_service' | 'user_jwt',
    });
    patchCorrelation({
      tenantId: resolved.tenantId,
      requestId: (req as { requestId?: string }).requestId,
    });
    logTenantShadowMismatch(req, {
      authoritativeTenantId: resolved.tenantId,
      clientTenantHint: clientHint,
      source: source as 'internal_service' | 'user_jwt',
    });
    logAuthResolution(req, {
      tenantId: resolved.tenantId,
      source: source as 'internal_service' | 'user_jwt',
      status: 200,
    });
    req.headers['x-tenant-id'] = resolved.tenantId;
    next();
}

export function voiceRateLimit(req: Request, res: Response, next: NextFunction): void {
    const windowMs = Number(process.env.VOICE_RATE_LIMIT_WINDOW_MS || 60000);
    const maxPerWindow = Number(process.env.VOICE_RATE_LIMIT_MAX || 60);

    const tenantId = req.header('x-tenant-id') || 'public';
    const ip = normalizeIp(req.ip);
    const key = `${tenantId}:${ip}`;
    const now = Date.now();
    const current = voiceRateState.get(key);

    if (!current || now > current.resetsAt) {
        voiceRateState.set(key, { count: 1, resetsAt: now + windowMs });
        next();
        return;
    }

    if (current.count >= maxPerWindow) {
        res.status(429).json({
            success: false,
            error: 'Rate limit exceeded',
            retryAfterSeconds: Math.ceil((current.resetsAt - now) / 1000),
        });
        return;
    }

    current.count += 1;
    voiceRateState.set(key, current);
    next();
}

