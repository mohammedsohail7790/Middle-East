import type { Application } from 'express';
import { asyncHandler } from '../middleware/index.js';
import { CacheManager } from '../services/cache.js';
import { logger } from '../services/logger.js';

export function registerHealthRoutes(app: Application, cacheManager: CacheManager): void {
    app.get('/', (_req, res) => {
        res.status(200).json({
            success: true,
            service: 'Halla AI Gateway',
            status: 'running',
            timestamp: new Date().toISOString(),
        });
    });

    app.get('/health', (_req, res) => {
        res.status(200).json({ status: 'ok', service: 'halla-ai-gateway' });
    });

    app.get('/ready', asyncHandler(async (_req, res) => {
        const start = Date.now();
        const checks: Record<string, { ok: boolean; latencyMs?: number; error?: string }> = {};

        try {
            const t0 = Date.now();
            const { voiceDb } = await import('../services/voice/tenant-scope.js');
            await voiceDb.query('SELECT 1');
            checks.database = { ok: true, latencyMs: Date.now() - t0 };
        } catch (error) {
            checks.database = { ok: false, error: String(error).slice(0, 120) };
            logger.warn('Readiness: database unavailable', { error: String(error) });
        }

        try {
            const t0 = Date.now();
            const cache = new CacheManager();
            await cache.set('health:ping', 'pong', { ttl: 10 });
            const result = await cache.get<string>('health:ping');
            checks.redis = { ok: result === 'pong', latencyMs: Date.now() - t0 };
        } catch (error) {
            checks.redis = { ok: false, error: String(error).slice(0, 120) };
            logger.warn('Readiness: redis unavailable', { error: String(error) });
        }

        checks.stripe = { ok: Boolean(process.env.STRIPE_SECRET_KEY) };
        checks.twilio = { ok: Boolean(process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_ACCOUNT_SID) };
        checks.openai = { ok: Boolean(process.env.OPENAI_API_KEY) };
        checks.resend = { ok: Boolean(process.env.RESEND_API_KEY) };

        const criticalOk = checks.database.ok && checks.redis.ok;
        const allConfigOk = checks.stripe.ok && checks.twilio.ok && checks.openai.ok;
        const isReady = criticalOk;
        const statusCode = isReady ? 200 : 503;

        res.status(statusCode).json({
            status: isReady ? 'ready' : 'not_ready',
            ready: isReady,
            configured: allConfigOk,
            timestamp: new Date().toISOString(),
            totalMs: Date.now() - start,
            checks,
        });
    }));

    app.get('/stats', asyncHandler(async (_req, res) => {
        const cacheKey = 'system:stats';
        const cached = await cacheManager.get<Record<string, unknown>>(cacheKey);
        if (cached) {
            res.json({ success: true, data: cached, cached: true });
            return;
        }

        const stats = {
            userTier: 'N/A',
            usagePercent: 0,
            errorRate: 0,
            responseTime: 0,
            lastUpdated: new Date(),
        };

        await cacheManager.set(cacheKey, stats, { ttl: 30 });
        res.json({ success: true, data: stats });
    }));
}
