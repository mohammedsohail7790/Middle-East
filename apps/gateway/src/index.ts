import './bootstrap.js';

// Node's own guidance: do not resume normal operation after uncaughtException —
// the process may be in a corrupted state (leaked handles, half-written state)
// that's unsafe to keep serving from. Log then exit; Render restarts the
// process. This does mean any calls in progress at that exact instant drop,
// but that's strictly safer than continuing to run in an undefined state.
process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION:', err.message, err.stack?.substring(0, 500));
    try { logger.error('UNCAUGHT_EXCEPTION', { message: err.message, stack: err.stack?.substring(0, 500) }); } catch { /* ignore */ }
    process.exit(1);
});
// Left as log-only (not fatal): several existing fire-and-forget calls in this
// codebase (e.g. background event publishing) don't yet have .catch() handlers
// and would turn a harmless background failure into an unwanted full-process
// restart if this were made fatal. Revisit once those call sites are audited
// and hardened with explicit .catch() blocks.
process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    console.error('UNHANDLED REJECTION:', err.message);
    try { logger.error('UNHANDLED_REJECTION', { message: err.message, stack: err.stack?.substring(0, 500) }); } catch { /* ignore */ }
});

import { createServer } from 'http';
import express from 'express';
import cors from 'cors';

import {
    MiddlewareFactory,
    errorHandler,
    notFoundHandler,
} from './middleware/index.js';
import { CacheManager } from './services/cache.js';
import { logger } from './services/logger.js';
import { registerDefaultHealthChecks } from './services/health-check.js';
import { RealtimeGateway } from './services/realtime/realtime.gateway.js';
import { validateEnvironment, getAllowedOrigins, isAllowedCorsOrigin } from './services/env.js';
import { knowledgeService } from './services/knowledge/knowledge.service.js';
import { productionTelemetry } from './services/voice/production-telemetry.js';
import { handleStripeBillingWebhook } from './services/billing/stripe-webhook.js';
import { startRetentionWorker } from './workers/retention-worker.js';
import { startIntegrationSyncWorker } from './workers/integration-sync.worker.js';
import { startScimSyncWorker } from './workers/scim-sync.worker.js';
import { startSelfHealingLoop } from './operations/self-healing/self-healing.service.js';
import { bootstrapOtel } from './observability/otel/otel-bootstrap.js';
import { requestTracingMiddleware } from './middleware/request-tracing.js';
import { httpsRedirectMiddleware, securityHeadersMiddleware } from './middleware/security-headers.js';
import {
    tieredRateLimitMiddleware,
    publicRootRateLimitMiddleware,
    inboundWebhookRateLimitMiddleware,
} from './security/tiered-rate-limit.js';
import { requestHardeningMiddleware } from './security/request-hardening.js';
import { integrationService } from './services/integrations/integration.service.js';
import { registerService, shutdown } from './services/graceful-shutdown.js';
import { wsRateLimiter } from './services/ws-rate-limiter.js';
import { healthCheckService } from './services/health-check.js';
import { createApiRouter } from './routes/register-api-routes.js';
import { registerHealthRoutes } from './routes/register-health-routes.js';
import { registerMetricsRoutes } from './routes/register-metrics-routes.js';
import { registerDebugRoutes } from './routes/register-debug-routes.js';
import { attachWebSocketUpgradeHandler } from './server/ws-upgrade-handler.js';

validateEnvironment();
bootstrapOtel();

// Workers: run in gateway process only when GATEWAY_RUN_WORKERS=true
// In production, deploy apps/worker as a separate service instead.
if (process.env.GATEWAY_RUN_WORKERS === 'true') {
  startRetentionWorker();
  startIntegrationSyncWorker();
  startScimSyncWorker();
  logger.info('WORKERS_STARTED_IN_GATEWAY', { note: 'Consider deploying apps/worker separately' });
} else {
  logger.info('WORKERS_NOT_STARTED', { note: 'Set GATEWAY_RUN_WORKERS=true to co-locate, or deploy apps/worker' });
}

startSelfHealingLoop();

// Database connection test on boot
(async () => {
    try {
        const { voiceDb } = await import('./services/voice/tenant-scope.js');
        await voiceDb.query('SELECT 1');
        logger.info('Database connection established successfully', {
            dbUrl: (process.env.DATABASE_URL || '').replace(/\/\/.*@/, '//***@'),
            pgSslMode: process.env.PGSSLMODE || 'not set',
        });
    } catch (error) {
        logger.warn('Database connection failed on boot', { error: String(error) });
    }
})();

// PART 6 — start the integration worker immediately on boot so queued jobs
// from previous runs are processed without waiting for the first new call.
integrationService.startWorkerOnBoot();

import('./events/platform-event-bus.js')
  .then(({ startPlatformEventBus }) => startPlatformEventBus())
  .catch((err) => {
    logger.warn('PLATFORM_EVENT_BUS_START_FAILED', { error: String(err) });
  });

if ((process.env.ENABLE_KNOWLEDGE_INGESTION || 'true').toLowerCase() === 'true') {
    knowledgeService.ingestFromFileOnce().catch((error) => {
        logger.error('Knowledge ingestion failed', { error: String(error) });
    });
}

const app = express();
app.set('trust proxy', 1);
app.use(httpsRedirectMiddleware);
app.use(securityHeadersMiddleware);
const server = createServer(app as any);
const port = Number(process.env.PORT) || 3003;
console.log('PORT ENV:', process.env.PORT, '→ using:', port);

// Initialize WebSocket server (attached to SAME http.Server as Express below — verified: no separate server.listen())
const cacheManager = new CacheManager();
const realtimeGateway = new RealtimeGateway();
console.log('[WS] RealtimeGateway created (OpenAI Realtime API)');

// Register default health checks
registerDefaultHealthChecks();

// Enhanced middleware setup
app.use(MiddlewareFactory.security() as any);
app.use(MiddlewareFactory.compressionMiddleware());
app.use(MiddlewareFactory.requestId());
(app as any).post(
  '/api/v1/billing/webhook',
  (req: any, res: any, next: any) => {
    void inboundWebhookRateLimitMiddleware(req, res, next);
  },
  (express as any).raw({ type: 'application/json' }),
  handleStripeBillingWebhook
);

(app as any).post(
  '/api/v1/calendar/calendly/webhook',
  (req: any, res: any, next: any) => {
    void inboundWebhookRateLimitMiddleware(req, res, next);
  },
  (express as any).raw({ type: 'application/json' }),
  async (req: any, res: any) => {
    try {
      const { verifyCalendlyWebhookSignature } = await import(
        './services/calendar/calendly.webhook.js'
      );
      const { calendlyService } = await import('./services/calendar/calendly.service.js');
      const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
      const sig = req.headers['calendly-webhook-signature'] as string | undefined;
      if (!verifyCalendlyWebhookSignature(raw, sig)) {
        res.status(401).json({ error: 'Invalid Calendly webhook signature' });
        return;
      }
      const tenantId = typeof req.query.tenant_id === 'string' ? req.query.tenant_id.trim() : '';
      if (!tenantId) {
        res.status(400).json({ error: 'Missing tenant_id' });
        return;
      }
      // Validate tenant_id exists in our database to prevent cross-tenant event routing
      const { voiceDb } = await import('./services/voice/tenant-scope.js');
      const tenantCheck = await voiceDb.query('SELECT id FROM public.voice_tenants WHERE id = $1 LIMIT 1', [tenantId]);
      if (tenantCheck.rows.length === 0) {
        res.status(400).json({ error: 'Invalid tenant_id' });
        return;
      }
      const payload = JSON.parse(raw.toString('utf8')) as Record<string, unknown>;
      await calendlyService.handleWebhookPayload(tenantId, payload);
      res.status(200).json({ received: true });
    } catch (err) {
      const { logger } = await import('./services/logger.js');
      logger.error('[Calendly] Webhook error', { error: String(err) });
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  }
);

app.use(express.json({ limit: '10mb' }));
app.use(requestHardeningMiddleware);

// CORS — ALLOWED_ORIGINS + DASHBOARD_URL (set from Render blueprint)
const allowedOrigins = getAllowedOrigins();
app.use(cors({
    origin: (origin: any, callback: any) => {
        if (!origin) {
            callback(null, true);
            return;
        }
        if (allowedOrigins.includes(origin) || isAllowedCorsOrigin(origin)) {
            callback(null, true);
            return;
        }
        if (process.env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
            callback(null, true);
            return;
        }
        callback(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'x-tenant-id',
        'x-internal-api-key',
        'x-request-id',
        'x-csrf-token',
    ],
    exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset', 'X-Request-ID'],
    credentials: true,
    maxAge: 86400, // 24 hours
}));

app.use(requestTracingMiddleware);
app.use(logger.requestLogger());

attachWebSocketUpgradeHandler(server, realtimeGateway);

// Tiered per-route rate limits (see security/tiered-rate-limit.ts)
app.use('/api/', (req, res, next) => {
    void tieredRateLimitMiddleware(req, res, next);
});

// Public non-API routes (health probes, root) — IP rate limit
app.use((req, res, next) => {
    const path = req.path || '';
    if (path === '/' || path === '/health' || path === '/ready' || path === '/stats') {
        void publicRootRateLimitMiddleware(req, res, next);
        return;
    }
    next();
});

registerHealthRoutes(app, cacheManager);

const apiRouter = createApiRouter();
app.use('/api/v1', apiRouter);
app.use('/api', apiRouter);

registerMetricsRoutes(app, realtimeGateway);
registerDebugRoutes(app, realtimeGateway);

// 404 handler
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

// Start server
server.listen(port, '0.0.0.0', () => {
    logger.info(`🚀 Call IQ gateway running on port ${port}`, {
        port,
        env: process.env.NODE_ENV || 'development',
        version: process.env.npm_package_version || '1.0.0',
    });

    void import('./services/billing/billing.service.js').then(({ warmStripePriceCache, validateStripeBillingConfig }) => {
        warmStripePriceCache()
            .then(() => validateStripeBillingConfig())
            .catch((err) => {
                logger.warn('STRIPE_CATALOG_INIT_FAILED', { error: String(err) });
            });
    });
    
    if (process.env.NODE_ENV !== 'production') {
        setInterval(() => {
            console.log('⏳ WAITING FOR TWILIO WEBHOOK...');
        }, 10000);
    }
});

// PART 7 — Graceful shutdown with service draining
registerService({
    name: 'production-telemetry',
    shutdown: async () => { productionTelemetry.destroy(); },
});

registerService({
    name: 'health-check-service',
    shutdown: async () => { healthCheckService.destroy(); },
});

registerService({
    name: 'realtime-gateway',
    shutdown: async () => {
        if (typeof (realtimeGateway as any).shutdownAll === 'function') {
            await (realtimeGateway as any).shutdownAll();
        }
    },
});

registerService({
    name: 'ws-rate-limiter',
    shutdown: async () => {
        if (typeof (wsRateLimiter as any).destroy === 'function') {
            (wsRateLimiter as any).destroy();
        }
    },
});

registerService({
    name: 'integration-worker',
    shutdown: async () => {
        if (typeof (integrationService as any).closeWorker === 'function') {
            await (integrationService as any).closeWorker();
        }
    },
});

registerService({
    name: 'postgres-pool',
    shutdown: async () => {
        const { pool } = await import('./services/db/pool.js');
        await pool.end();
    },
});

process.on('SIGTERM', () => shutdown('SIGTERM', server));
process.on('SIGINT', () => shutdown('SIGINT', server));

