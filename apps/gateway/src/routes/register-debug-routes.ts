import type { Application } from 'express';
import { timingSafeEqual } from 'crypto';
import { asyncHandler } from '../middleware/index.js';
import type { RealtimeGateway } from '../services/realtime/realtime.gateway.js';
import { audioDiagnosticsManager } from '../services/realtime/realtime.audio-diag.js';

function requireInternalKey(req: any, res: any): boolean {
    const internalKey = process.env.INTERNAL_API_KEY || process.env.VOICE_INTERNAL_API_KEY;
    const provided = String(req.headers['x-internal-api-key'] || '');
    if (!internalKey || !provided) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return false;
    }
    const a = Buffer.from(internalKey);
    const b = Buffer.from(provided.padEnd(internalKey.length, '\0').slice(0, internalKey.length));
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return false;
    }
    return true;
}

export function registerDebugRoutes(app: Application, realtimeGateway: RealtimeGateway): void {
    app.get('/debug/env', asyncHandler(async (req, res) => {
        if (!requireInternalKey(req, res)) return;
        const keys = [
            'DATABASE_URL', 'GATEWAY_DATABASE_URL', 'OPENAI_API_KEY', 'DEEPGRAM_API_KEY',
            'ELEVENLABS_API_KEY', 'TWILIO_AUTH_TOKEN', 'JWT_SECRET', 'VOICE_INTERNAL_API_KEY',
            'ADMIN_API_KEY', 'REDIS_URL', 'STRIPE_SECRET_KEY',
        ];
        const env: Record<string, boolean> = {};
        for (const k of keys) env[k] = !!process.env[k];
        res.json({ success: true, env, nodeEnv: process.env.NODE_ENV || 'not set' });
    }));

    app.get('/debug/realtime', asyncHandler(async (req, res) => {
        if (!requireInternalKey(req, res)) return;
        res.json({
            success: true,
            data: realtimeGateway.getDebugInfo(),
            timestamp: new Date().toISOString(),
        });
    }));

    app.get('/health/realtime', asyncHandler(async (_req, res) => {
        const healthStatus = await realtimeGateway.getHealthStatus();
        const statusCode = healthStatus.overall === 'healthy' ? 200 :
            healthStatus.overall === 'degraded' ? 200 : 503;

        res.status(statusCode).json({
            success: statusCode === 200,
            data: healthStatus,
            timestamp: new Date().toISOString(),
        });
    }));

    app.get('/debug/audio/:sessionId', asyncHandler(async (req, res) => {
        if (!requireInternalKey(req, res)) return;
        const { sessionId } = req.params;
        const snapshot = audioDiagnosticsManager.getSnapshot(sessionId);
        if (!snapshot) {
            res.status(404).json({ success: false, error: 'Session not found or already completed' });
            return;
        }
        res.json({ success: true, data: snapshot, timestamp: new Date().toISOString() });
    }));

    app.get('/debug/tenant', asyncHandler(async (req, res) => {
        if (!requireInternalKey(req, res)) return;

        const phone = (req.query.phone as string) || '';
        if (!phone.trim()) {
            res.status(400).json({ success: false, error: 'Query param phone is required' });
            return;
        }
        const normalized = phone.replace(/[^\d+]/g, '');
        const { voiceDb } = await import('../services/voice/tenant-scope.js');

        let tpnResult = { rows: [] as unknown[], error: null as string | null };
        let lookupResult = { rows: [] as unknown[], error: null as string | null };

        try {
            tpnResult = await voiceDb.query(
                `SELECT tpn.phone_number, tpn.status, tpn.tenant_id, vt.company_name
                 FROM public.tenant_phone_numbers tpn
                 JOIN public.voice_tenants vt ON vt.id = tpn.tenant_id
                 WHERE tpn.phone_number = $1`,
                [normalized]
            );
        } catch (e: unknown) {
            tpnResult = { rows: [], error: e instanceof Error ? e.message : String(e) };
        }

        try {
            lookupResult = await voiceDb.query(
                `SELECT tenant_id, company_name FROM public.get_tenant_by_phone_number($1)`,
                [normalized]
            );
        } catch (e: unknown) {
            lookupResult = { rows: [], error: e instanceof Error ? e.message : String(e) };
        }

        res.json({
            success: true,
            queriedPhone: normalized,
            tenantPhoneNumbers: {
                count: tpnResult.rows.length,
                rows: tpnResult.rows,
                error: tpnResult.error,
            },
            lookupFunction: {
                count: lookupResult.rows.length,
                rows: lookupResult.rows,
                error: lookupResult.error,
            },
            timestamp: new Date().toISOString(),
        });
    }));
}
