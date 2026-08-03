import type { Application } from 'express';
import { asyncHandler } from '../middleware/index.js';
import type { RealtimeGateway } from '../services/realtime/realtime.gateway.js';
import { productionTelemetry } from '../services/voice/production-telemetry.js';
import { audioDiagnosticsManager } from '../services/realtime/realtime.audio-diag.js';

function metricsGate(res: any): boolean {
    if (process.env.NODE_ENV === 'production' && process.env.ENABLE_PUBLIC_METRICS !== 'true') {
        res.status(404).json({ success: false, error: 'Not found' });
        return false;
    }
    return true;
}

export function registerMetricsRoutes(app: Application, realtimeGateway: RealtimeGateway): void {
    app.get('/metrics/system', asyncHandler(async (_req, res) => {
        if (!metricsGate(res)) return;
        const { buildOpsSnapshot } = await import('../observability/enterprise/ops-snapshot.js');
        const data = await buildOpsSnapshot();
        res.json({ success: true, data, timestamp: new Date().toISOString() });
    }));

    app.get('/metrics/runtime', asyncHandler(async (_req, res) => {
        if (!metricsGate(res)) return;
        const { sessionRegistry } = await import('../services/realtime/session-registry.js');
        const { sessionWatchdog } = await import('../services/realtime/session-watchdog.js');
        res.json({
            success: true,
            data: {
                activeSessions: sessionRegistry.listActive().map((s) => ({
                    sessionId: s.sessionId,
                    tenantId: s.tenantId,
                    callSid: s.callSid,
                    state: s.state,
                    reconnectCount: s.metrics.reconnectCount,
                })),
                watchdog: sessionWatchdog.getMetrics(),
            },
            timestamp: new Date().toISOString(),
        });
    }));

    app.get('/metrics/prometheus', asyncHandler(async (_req, res) => {
        if (!metricsGate(res)) return;
        const { syncLiveMetricsToRegistry } = await import('../observability/metrics-sync.js');
        const { toPrometheusText } = await import('../observability/enterprise/metrics-registry.js');
        await syncLiveMetricsToRegistry();
        res.setHeader('Content-Type', 'text/plain; version=0.0.4');
        res.send(toPrometheusText());
    }));

    app.get('/metrics/topology', asyncHandler(async (req, res) => {
        if (!metricsGate(res)) return;
        const { buildRuntimeTopology } = await import('../observability/topology/topology.service.js');
        const tenantId = typeof req.query.tenantId === 'string' ? req.query.tenantId : undefined;
        const data = await buildRuntimeTopology(tenantId);
        res.json({ success: true, data, timestamp: new Date().toISOString() });
    }));

    app.get('/metrics/ai', asyncHandler(async (req, res) => {
        if (!metricsGate(res)) return;
        const { aiGovernanceService } = await import('../services/ai-governance/ai-governance.service.js');
        const { listRecentAuditBuffer } = await import('../services/ai-governance/execution-audit.js');
        const tenantId = typeof req.query.tenantId === 'string' ? req.query.tenantId : undefined;
        res.json({
            success: true,
            data: {
                metrics: aiGovernanceService.getMetricsSnapshot(),
                recentAudit: listRecentAuditBuffer(tenantId, 30),
            },
            timestamp: new Date().toISOString(),
        });
    }));

    app.get('/internal/ai-governance', asyncHandler(async (req, res) => {
        const internalKey = process.env.INTERNAL_API_KEY || process.env.VOICE_INTERNAL_API_KEY;
        if (!internalKey || req.headers['x-internal-api-key'] !== internalKey) {
            res.status(401).json({ success: false, error: 'Unauthorized' });
            return;
        }
        const { aiGovernanceService } = await import('../services/ai-governance/ai-governance.service.js');
        const { listRecentAuditBuffer, listSessionAudit } = await import('../services/ai-governance/execution-audit.js');
        const tenantId = typeof req.query.tenantId === 'string' ? req.query.tenantId : undefined;
        const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : undefined;
        const audit = sessionId && tenantId
            ? await listSessionAudit(tenantId, sessionId)
            : listRecentAuditBuffer(tenantId, 100);
        res.json({
            success: true,
            data: {
                metrics: aiGovernanceService.getMetricsSnapshot(),
                audit,
                policyVersion: 'p3-v1',
            },
        });
    }));

    app.get('/metrics/events', asyncHandler(async (_req, res) => {
        if (!metricsGate(res)) return;
        const { getPlatformEventBus } = await import('../events/platform-event-bus.js');
        const { collectStreamDiagnostics } = await import('../events/event-metrics.js');
        const bus = getPlatformEventBus();
        if (!bus) {
            res.json({ success: true, data: { enabled: false } });
            return;
        }
        const diagnostics = await collectStreamDiagnostics(bus.getRedis());
        res.json({ success: true, data: { enabled: true, ...diagnostics }, timestamp: new Date().toISOString() });
    }));

    app.get('/metrics/realtime', asyncHandler(async (_req, res) => {
        if (!metricsGate(res)) return;
        const metrics = await realtimeGateway.getDetailedMetrics();
        res.json({ success: true, data: metrics, timestamp: new Date().toISOString() });
    }));

    app.get('/metrics/production', asyncHandler(async (_req, res) => {
        if (process.env.NODE_ENV === 'production' && process.env.ENABLE_PUBLIC_METRICS !== 'true') {
            res.status(404).json({ success: false, error: 'Not found' });
            return;
        }
        const coreTelemetry = productionTelemetry.getAllMetrics();
        const mem = process.memoryUsage();
        res.json({
            success: true,
            data: {
                telemetry: coreTelemetry,
                process: {
                    uptimeSec: Math.round(process.uptime()),
                    memoryRssMb: Math.round(mem.rss / 1024 / 1024),
                    memoryHeapMb: Math.round(mem.heapUsed / 1024 / 1024),
                    cpuUsage: process.cpuUsage(),
                },
                gateway: {
                    activeSessions: realtimeGateway.getDebugInfo().activeConnections,
                    activeCalls: realtimeGateway.getDebugInfo().activeSessions,
                },
            },
            timestamp: new Date().toISOString(),
        });
    }));

    app.get('/metrics/call/:callId', asyncHandler(async (req, res) => {
        if (!metricsGate(res)) return;
        const { callId } = req.params;
        const { getCallTelemetry } = await import('../services/voice/call-telemetry.service.js');
        const telemetry = await getCallTelemetry(callId);
        res.json({
            success: true,
            data: { callId, telemetry },
            timestamp: new Date().toISOString(),
        });
    }));

    app.get('/metrics/audio', asyncHandler(async (_req, res) => {
        if (process.env.NODE_ENV === 'production' && process.env.ENABLE_PUBLIC_METRICS !== 'true') {
            res.status(404).json({ success: false, error: 'Not found' });
            return;
        }
        const activeSessions = audioDiagnosticsManager.getActiveSessions();
        const stats: Record<string, unknown>[] = [];
        for (const sessionId of activeSessions) {
            const snap = audioDiagnosticsManager.getSnapshot(sessionId);
            if (snap) {
                stats.push({
                    sessionId: snap.sessionId,
                    callSid: snap.callSid,
                    tenantId: snap.tenantId,
                    durationMs: Date.now() - snap.startTime,
                    inboundFrames: snap.inbound.totalFrames,
                    outboundFrames: snap.outbound.totalFrames,
                    silencePercent: snap.inbound.totalFrames > 0
                        ? Math.round((snap.inbound.silenceFrames / snap.inbound.totalFrames) * 100)
                        : 0,
                    dropRate: snap.inbound.totalFrames > 0
                        ? Math.round((snap.inbound.droppedFrames / snap.inbound.totalFrames) * 100 * 100) / 100
                        : 0,
                    avgInboundLevel: Math.round(snap.inbound.averageLevel),
                    avgOutboundLevel: Math.round(snap.outbound.averageLevel),
                });
            }
        }
        res.json({
            success: true,
            data: {
                activeSessionCount: audioDiagnosticsManager.getSessionCount(),
                sessions: stats,
            },
            timestamp: new Date().toISOString(),
        });
    }));
}
