import { voiceDb } from '../voice/tenant-scope.js';
import { requireVoiceApiAccess } from '../voice/security.js';
import { voiceRedis } from '../voice/redis.client.js';
import { createRedisClient } from '../redis-connection.js';
import {
    dashboardPushChannel,
    type DashboardPushPayload,
} from './dashboard-events.js';
import express from 'express';
import { getTenantId } from '../auth/tenant-context.js';
import { verifySseDashboardToken } from '../../security/sse-token.js';
import { scanKeys } from '../redis-scan.js';

/**
 * Shared Redis pub/sub subscriber for dashboard SSE.
 * One connection handles all tenant channels instead of opening a new connection
 * per SSE request (which would exhaust Redis connection limits under load).
 */
let sharedSseSub: ReturnType<typeof createRedisClient> | null = null;
const sseChannelListeners = new Map<string, Set<(message: string) => void>>();

function getSharedSseSub(): ReturnType<typeof createRedisClient> {
    if (!sharedSseSub) {
        sharedSseSub = createRedisClient(undefined, { label: 'dashboard-sse-shared-sub' });
        sharedSseSub.on('message', (channel: string, message: string) => {
            const listeners = sseChannelListeners.get(channel);
            if (listeners) {
                for (const fn of listeners) {
                    try { fn(message); } catch { /* ignore per-listener errors */ }
                }
            }
        });
    }
    return sharedSseSub;
}

function subscribeToChannel(channel: string, listener: (message: string) => void): void {
    const sub = getSharedSseSub();
    if (!sseChannelListeners.has(channel)) {
        sseChannelListeners.set(channel, new Set());
        sub.subscribe(channel).catch(() => {});
    }
    sseChannelListeners.get(channel)!.add(listener);
}

function unsubscribeFromChannel(channel: string, listener: (message: string) => void): void {
    const listeners = sseChannelListeners.get(channel);
    if (!listeners) return;
    listeners.delete(listener);
    if (listeners.size === 0) {
        sseChannelListeners.delete(channel);
        getSharedSseSub().unsubscribe(channel).catch(() => {});
    }
}

function getTenant(req: express.Request): string {
    try {
        return getTenantId(req);
    } catch {
        const queryToken =
            typeof (req as express.Request & { query?: { token?: string } }).query?.token ===
            'string'
                ? (req as express.Request & { query?: { token?: string } }).query!.token
                : undefined;
        const sse = queryToken ? verifySseDashboardToken(queryToken) : null;
        if (sse) return sse.tenantId;
        const tenantId = req.header('x-tenant-id');
        if (!tenantId) throw new Error('Tenant context missing');
        return tenantId;
    }
}

function currentBillingCycleStart(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
}

function parseDateParam(value: unknown): Date | null {
    if (!value || typeof value !== 'string') return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date;
}

function safeClientError(_error: unknown, fallback = 'Request failed'): string {
    return fallback;
}

function normalizeMissedReason(reason: string): string {
    const r = reason.trim().toLowerCase();
    if (r === 'timeout') return 'timeout';
    if (r === 'user_hangup') return 'user_hangup';
    if (r === 'hangup') return 'user_hangup';
    if (r === 'user hangup') return 'user_hangup';
    if (r === 'error') return 'error';
    if (r === 'transfer') return 'transfer';
    return 'other';
}

export function createDashboardRouter(): express.Router {
    const router = express.Router();

    /** Works before onboarding (no tenant_id on JWT yet). */
    router.get('/csrf-token', async (req, res) => {
        try {
            const authHeader = String(req.header('authorization') || '');
            if (!authHeader.startsWith('Bearer ')) {
                return res.status(401).json({ success: false, error: 'Unauthorized' });
            }
            const { verifySupabaseAuthOnly } = await import('../auth/jwt-tenant-verifier.js');
            const verified = await verifySupabaseAuthOnly(authHeader.slice(7));
            if ('error' in verified) {
                return res.status(verified.status).json({ success: false, error: verified.error });
            }
            const { issueCsrfTokenForUser } = await import('../../middleware/csrf.js');
            const token = await issueCsrfTokenForUser(verified.userId);
            res.json({ success: true, data: { csrfToken: token } });
        } catch {
            res.status(500).json({ success: false, error: 'Could not issue CSRF token' });
        }
    });

    router.use(requireVoiceApiAccess);

    router.get('/sse-token', async (req, res) => {
        try {
            const tenantId = getTenant(req);
            const { issueSseDashboardToken, sseTokenTtlSeconds } = await import('../../security/sse-token.js');
            const token = issueSseDashboardToken(tenantId);
            res.json({
                success: true,
                data: { token, expiresIn: sseTokenTtlSeconds() },
            });
        } catch {
            res.status(500).json({ success: false, error: 'Could not issue stream token' });
        }
    });

    /** Single round-trip payload for dashboard first paint (metrics, chart, recent calls, tenant, leads). */
    router.get('/bootstrap', async (req, res) => {
        try {
            const tenantId = getTenant(req);
            const [
                callsAgg,
                leadsAgg,
                volumeRows,
                leadVolumeRows,
                recentCalls,
                leadsPreview,
                tenantRow,
            ] = await Promise.all([
                voiceDb.query(
                    `select
                        count(*)::int as total,
                        count(*) filter (where outcome = 'completed')::int as successful,
                        count(*) filter (where outcome = 'failed')::int as failed,
                        coalesce(round(avg(nullif(latency, 0)))::int, 0) as avg_response_latency,
                        coalesce(round(avg(nullif(duration_ms, 0)) / 1000.0)::int, 0) as avg_call_duration
                     from public.calls
                     where tenant_id = $1`,
                    [tenantId]
                ),
                voiceDb.query(
                    `select count(*)::int as total from public.leads where tenant_id = $1`,
                    [tenantId]
                ),
                voiceDb.query(
                    `select to_char(created_at::date, 'Dy') as day,
                            to_char(created_at::date, 'YYYY-MM-DD') as date,
                            count(*)::int as calls
                     from public.calls
                     where tenant_id = $1
                       and created_at >= now() - interval '7 days'
                     group by created_at::date
                     order by created_at::date asc`,
                    [tenantId]
                ),
                voiceDb.query(
                    `select to_char(created_at::date, 'YYYY-MM-DD') as date, count(*)::int as leads
                     from public.leads
                     where tenant_id = $1
                       and created_at >= now() - interval '7 days'
                     group by created_at::date`,
                    [tenantId]
                ),
                voiceDb.query(
                    `select id, call_sid, duration_ms, outcome, created_at,
                            left(coalesce(transcript, ''), 120) as transcript_snippet
                     from public.calls
                     where tenant_id = $1
                     order by created_at desc
                     limit 6`,
                    [tenantId]
                ),
                voiceDb.query(
                    `select id, name, phone_number, email, status, score, source, created_at
                     from public.leads
                     where tenant_id = $1
                     order by created_at desc
                     limit 50`,
                    [tenantId]
                ),
                voiceDb.query(
                    `select id, company_name, phone_number, default_language, voice_tone, timezone
                     from public.voice_tenants
                     where id = $1
                     limit 1`,
                    [tenantId]
                ),
            ]);

            const totalCalls = callsAgg.rows[0]?.total || 0;
            const totalLeads = leadsAgg.rows[0]?.total || 0;
            const conversionRate =
                totalCalls > 0 ? Number(((totalLeads / totalCalls) * 100).toFixed(1)) : 0;
            const leadByDate = new Map(
                leadVolumeRows.rows.map((r: { date: string; leads: number }) => [r.date, r.leads])
            );
            const callVolume = volumeRows.rows.map(
                (r: { day: string; date: string; calls: number }) => ({
                    day: r.day,
                    calls: r.calls,
                    leads: leadByDate.get(r.date) || 0,
                })
            );
            const tenant = tenantRow.rows[0];

            res.json({
                success: true,
                data: {
                    metrics: {
                        totalCalls,
                        successfulCalls: callsAgg.rows[0]?.successful || 0,
                        failedCalls: callsAgg.rows[0]?.failed || 0,
                        avgResponseLatency: callsAgg.rows[0]?.avg_response_latency || 0,
                        avgCallDuration: callsAgg.rows[0]?.avg_call_duration || 0,
                        leads: totalLeads,
                        conversionRate,
                    },
                    callVolume,
                    recentCalls: recentCalls.rows,
                    leadsPreview: leadsPreview.rows,
                    tenant: tenant
                        ? {
                              id: tenant.id,
                              company_name: tenant.company_name,
                              companyName: tenant.company_name,
                              phone_number: tenant.phone_number,
                          }
                        : { id: tenantId },
                },
            });
        } catch (error) {
            res.status(400).json({ success: false, error: safeClientError(error) });
        }
    });

    router.get('/active-calls', async (req, res) => {
        try {
            const tenantId = getTenant(req);
            const key = `active_calls:${tenantId}`;
            const callIds = await voiceRedis.smembers(key);

            // Fetch live call details from Redis hashes — use SCAN not KEYS
            const liveCalls: any[] = [];
            const { keys: liveCallKeys } = await scanKeys({ pattern: `live_call:${tenantId}:*`, batchSize: 100, timeoutMs: 3000 });
            for (const liveKey of liveCallKeys) {
                const data = await voiceRedis.hgetall(liveKey);
                if (data?.startTime) {
                    liveCalls.push({
                        sessionId: data.sessionId,
                        callSid: data.callSid,
                        callerPhone: data.callerPhone,
                        voice: data.voice,
                        language: data.language,
                        status: data.status,
                        durationSec: Math.round(
                            (Date.now() - parseInt(data.startTime || '0', 10)) / 1000
                        ),
                    });
                }
            }

            res.json({ success: true, data: { count: callIds.length, callIds, liveCalls } });
        } catch (error) {
            res.status(400).json({ success: false, error: safeClientError(error) });
        }
    });

    router.get('/call-volume', async (req, res) => {
        try {
            const tenantId = getTenant(req);
            const result = await voiceDb.query(
                `select to_char(created_at::date, 'Dy') as day,
                        to_char(created_at::date, 'YYYY-MM-DD') as date,
                        count(*)::int as calls
                 from public.calls
                 where tenant_id = $1
                   and created_at >= now() - interval '7 days'
                 group by created_at::date
                 order by created_at::date asc`,
                [tenantId]
            );
            const leadRows = await voiceDb.query(
                `select to_char(created_at::date, 'YYYY-MM-DD') as date, count(*)::int as leads
                 from public.leads
                 where tenant_id = $1
                   and created_at >= now() - interval '7 days'
                 group by created_at::date`,
                [tenantId]
            );
            const leadByDate = new Map(leadRows.rows.map((r: { date: string; leads: number }) => [r.date, r.leads]));
            const data = result.rows.map((r: { day: string; date: string; calls: number }) => ({
                day: r.day,
                calls: r.calls,
                leads: leadByDate.get(r.date) || 0,
            }));
            res.json({ success: true, data });
        } catch (error) {
            res.status(400).json({ success: false, error: safeClientError(error) });
        }
    });

    router.get('/call-history', async (req, res) => {
        try {
            const tenantId = getTenant(req);
            const limit = Math.min(Math.max(parseInt(String(req.query.limit || '50'), 10) || 50, 1), 200);
            const offset = Math.max(parseInt(String(req.query.offset || '0'), 10) || 0, 0);
            const result = await voiceDb.query(
                `select id, call_sid, duration_ms, latency, outcome, missed_reason, language, created_at
                 from public.calls
                 where tenant_id = $1
                 order by created_at desc
                 limit $2 offset $3`,
                [tenantId, limit, offset]
            );
            res.json({ success: true, data: result.rows, limit, offset });
        } catch (error) {
            res.status(400).json({ success: false, error: safeClientError(error) });
        }
    });

    router.get('/usage', async (req, res) => {
        try {
            const tenantId = getTenant(req);
            const cycleStart = currentBillingCycleStart();
            const keys = [];
            const now = new Date();
            for (let d = new Date(cycleStart); d <= now; d.setUTCDate(d.getUTCDate() + 1)) {
                keys.push(d.toISOString().slice(0, 10));
            }
            const pipeline = voiceRedis.pipeline();
            for (const day of keys) {
                pipeline.get(`voice:usage:${tenantId}:${day}:duration_ms`);
            }
            const durationResults = await pipeline.exec();
            const totalMs = (durationResults || []).reduce((sum, [, val]) => sum + Number(val || 0), 0);
            res.json({ success: true, data: { minutesUsed: Math.round(totalMs / 60000), cycleStart: cycleStart.toISOString() } });
        } catch (error) {
            res.status(400).json({ success: false, error: safeClientError(error) });
        }
    });

    router.get('/metrics', async (req, res) => {
        try {
            const tenantId = getTenant(req);
            const [calls, leads] = await Promise.all([
                voiceDb.query(
                    `select
                        count(*)::int as total,
                        count(*) filter (where outcome = 'completed')::int as successful,
                        count(*) filter (where outcome = 'failed')::int as failed,
                        coalesce(round(avg(nullif(latency, 0)))::int, 0) as avg_response_latency,
                        coalesce(round(avg(nullif(duration_ms, 0)) / 1000.0)::int, 0) as avg_call_duration
                     from public.calls
                     where tenant_id = $1`,
                    [tenantId]
                ),
                voiceDb.query(`select count(*)::int as total from public.leads where tenant_id = $1`, [tenantId]),
            ]);
            const totalCalls = calls.rows[0]?.total || 0;
            const totalLeads = leads.rows[0]?.total || 0;
            const conversionRate =
                totalCalls > 0 ? Number(((totalLeads / totalCalls) * 100).toFixed(1)) : 0;
            res.json({
                success: true,
                data: {
                    totalCalls,
                    successfulCalls: calls.rows[0]?.successful || 0,
                    failedCalls: calls.rows[0]?.failed || 0,
                    avgResponseLatency: calls.rows[0]?.avg_response_latency || 0,
                    avgCallDuration: calls.rows[0]?.avg_call_duration || 0,
                    leads: totalLeads,
                    conversionRate,
                },
            });
        } catch (error) {
            res.status(400).json({ success: false, error: safeClientError(error) });
        }
    });

    router.get('/conversion', async (req, res) => {
        try {
            const tenantId = getTenant(req);
            const [calls, leads, appointments, won] = await Promise.all([
                voiceDb.query(`select count(*)::int as total from public.calls where tenant_id = $1`, [tenantId]),
                voiceDb.query(`select count(*)::int as total from public.leads where tenant_id = $1`, [tenantId]),
                voiceDb.query(
                    `select count(*)::int as total from public.appointments
                     where tenant_id = $1 and status in ('booked', 'confirmed')`,
                    [tenantId]
                ),
                voiceDb.query(
                    `select count(*)::int as total from public.leads
                     where tenant_id = $1 and status = 'won'`,
                    [tenantId]
                ),
            ]);
            const totalCalls = calls.rows[0]?.total || 0;
            const totalLeads = leads.rows[0]?.total || 0;
            const totalAppointments = appointments.rows[0]?.total || 0;
            const wonLeads = won.rows[0]?.total || 0;
            res.json({
                success: true,
                data: {
                    calls: totalCalls,
                    leads: totalLeads,
                    qualified: totalLeads,
                    appointments: totalAppointments,
                    confirmed: totalAppointments,
                    won: wonLeads,
                    conversionRate: totalCalls > 0 ? totalLeads / totalCalls : 0,
                },
            });
        } catch (error) {
            res.status(400).json({ success: false, error: safeClientError(error) });
        }
    });

    router.get('/missed-reasons', async (req, res) => {
        try {
            const tenantId = getTenant(req);
            const startDate = parseDateParam(req.query.start_date);
            const endDate = parseDateParam(req.query.end_date);

            // Default to last 30 days if not provided (bounded query window).
            const effectiveEnd = endDate ?? new Date();
            const effectiveStart = startDate ?? new Date(effectiveEnd.getTime() - 30 * 24 * 60 * 60 * 1000);

            const result = await voiceDb.query(
                `
                with filtered as (
                    select
                        case
                            when lower(btrim(missed_reason)) = 'timeout' then 'timeout'
                            when lower(btrim(missed_reason)) = 'user_hangup' then 'user_hangup'
                            when lower(btrim(missed_reason)) = 'hangup' then 'user_hangup'
                            when lower(btrim(missed_reason)) = 'user hangup' then 'user_hangup'
                            when lower(btrim(missed_reason)) = 'error' then 'error'
                            when lower(btrim(missed_reason)) = 'transfer' then 'transfer'
                            else 'other'
                        end as normalized_reason
                    from public.calls
                    where tenant_id = $1
                      and created_at >= $2
                      and created_at <= $3
                      and missed_reason is not null
                      and missed_reason <> ''
                ),
                totals as (
                    select count(*)::int as total from filtered
                )
                select
                    f.normalized_reason as reason,
                    count(*)::int as count,
                    case
                        when t.total = 0 then 0
                        else round((count(*)::numeric / t.total::numeric) * 100, 2)
                    end as percentage
                from filtered f
                cross join totals t
                group by f.normalized_reason, t.total
                order by count(*) desc
                `,
                [tenantId, effectiveStart.toISOString(), effectiveEnd.toISOString()]
            );

            const totalMissedCalls = result.rows.reduce((sum, row) => sum + Number(row.count || 0), 0);

            res.json({
                success: true,
                data: {
                    start_date: effectiveStart.toISOString(),
                    end_date: effectiveEnd.toISOString(),
                    total_missed_calls: totalMissedCalls,
                    breakdown: result.rows.map((row: any) => ({
                        reason: normalizeMissedReason(String(row.reason)),
                        count: Number(row.count),
                        percentage: Number(row.percentage),
                    })),
                },
            });
        } catch {
            res.status(400).json({ success: false, error: 'Invalid request' });
        }
    });

    // SSE — instant Redis push events + metrics heartbeat (~2s)
    router.get('/stream', async (req: any, res: any) => {
        let tenantId: string;
        try {
            tenantId = getTenant(req);
        } catch {
            res.status(401).json({ success: false, error: 'Unauthorized' });
            return;
        }

        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
        });
        res.write('data: {"connected":true}\n\n');
        if (typeof res.flushHeaders === 'function') {
            res.flushHeaders();
        }
        if (typeof (res as { flush?: () => void }).flush === 'function') {
            (res as { flush: () => void }).flush();
        }

        const pushChannel = dashboardPushChannel(tenantId);

        let lastSnapshot = {
            totalCalls: -1,
            totalLeads: -1,
            activeCalls: -1,
            callsToday: -1,
            leadsToday: -1,
        };

        let pendingPushScopes: string[] = [];
        let metricsDebounce: ReturnType<typeof setTimeout> | null = null;
        let closed = false;

        const sendMetrics = async (extraChanged: string[] = []) => {
            if (closed) return;
            try {
                const [callsResult, leadsResult] = await Promise.all([
                    voiceDb.query(
                        `select count(*)::int as total,
                                count(*) filter (where outcome = 'completed')::int as completed,
                                count(*) filter (where created_at > now() - interval '24 hours')::int as today
                         from public.calls where tenant_id = $1`,
                        [tenantId]
                    ),
                    voiceDb.query(
                        `select count(*)::int as total,
                                count(*) filter (where created_at > now() - interval '24 hours')::int as today
                         from public.leads where tenant_id = $1`,
                        [tenantId]
                    ),
                ]);

                let activeCallsRaw: string[] = [];
                let liveCalls: any[] = [];
                try {
                    activeCallsRaw = await voiceRedis.smembers(`active_calls:${tenantId}`);
                    // Use SCAN instead of KEYS to avoid blocking Redis
                    const { keys: liveCallKeys } = await scanKeys({
                        pattern: `live_call:${tenantId}:*`,
                        batchSize: 100,
                        timeoutMs: 2000,
                    });
                    for (const key of liveCallKeys) {
                        const data = await voiceRedis.hgetall(key);
                        if (data?.startTime) {
                            liveCalls.push({
                                callSid: data.callSid,
                                callerPhone: data.callerPhone,
                                voice: data.voice,
                                language: data.language,
                                durationSec: Math.round(
                                    (Date.now() - parseInt(data.startTime, 10)) / 1000
                                ),
                            });
                        }
                    }
                } catch {
                    activeCallsRaw = [];
                    liveCalls = [];
                }

                const totalCalls = callsResult.rows[0]?.total || 0;
                const totalLeads = leadsResult.rows[0]?.total || 0;
                const activeCalls = activeCallsRaw.length;
                const callsToday = callsResult.rows[0]?.today || 0;
                const leadsToday = leadsResult.rows[0]?.today || 0;

                const changed: string[] = [...extraChanged];
                const add = (s: string) => {
                    if (!changed.includes(s)) changed.push(s);
                };

                if (lastSnapshot.totalCalls >= 0 && totalCalls !== lastSnapshot.totalCalls) {
                    add('calls');
                    add('metrics');
                    add('analytics');
                }
                if (lastSnapshot.totalLeads >= 0 && totalLeads !== lastSnapshot.totalLeads) {
                    add('leads');
                    add('metrics');
                    add('analytics');
                }
                if (lastSnapshot.activeCalls >= 0 && activeCalls !== lastSnapshot.activeCalls) {
                    add('calls');
                    if (activeCalls < lastSnapshot.activeCalls) {
                        add('calendar');
                        add('analytics');
                    }
                }
                if (lastSnapshot.callsToday >= 0 && callsToday !== lastSnapshot.callsToday) {
                    add('calls');
                }
                if (lastSnapshot.leadsToday >= 0 && leadsToday !== lastSnapshot.leadsToday) {
                    add('leads');
                }

                lastSnapshot = { totalCalls, totalLeads, activeCalls, callsToday, leadsToday };

                const metrics = {
                    timestamp: new Date().toISOString(),
                    activeCalls,
                    liveCalls,
                    totalCalls,
                    completedCalls: callsResult.rows[0]?.completed || 0,
                    callsToday,
                    totalLeads,
                    leadsToday,
                    changed,
                };

                res.write(`data: ${JSON.stringify(metrics)}\n\n`);
            } catch (err) {
                res.write(`data: {"error":"${String(err).slice(0, 100)}"}\n\n`);
            }
        };

        const scheduleMetrics = (scopes: string[]) => {
            if (scopes.length) pendingPushScopes.push(...scopes);
            if (metricsDebounce) clearTimeout(metricsDebounce);
            metricsDebounce = setTimeout(() => {
                const extra = [...new Set(pendingPushScopes)];
                pendingPushScopes = [];
                void sendMetrics(extra);
            }, 120);
        };

        const onPushMessage = (message: string) => {
            if (closed) return;
            try {
                const payload = JSON.parse(message) as DashboardPushPayload;
                const scopes = payload.scopes?.length ? payload.scopes : [];
                res.write(
                    `data: ${JSON.stringify({
                        push: true,
                        type: payload.type,
                        changed: scopes,
                        at: payload.at,
                        meta: payload.meta ?? undefined,
                    })}\n\n`
                );
                scheduleMetrics(scopes);
            } catch {
                /* ignore malformed */
            }
        };

        // Use shared subscriber — no new Redis connection per SSE tab
        subscribeToChannel(pushChannel, onPushMessage);
        setImmediate(() => { void sendMetrics(); });

        // Keep proxies/load balancers from closing idle SSE (~15s timeouts on many hosts)
        const keepalive = setInterval(() => {
            if (closed) return;
            try {
                res.write(': keepalive\n\n');
            } catch {
                closed = true;
            }
        }, 8000);

        // Live calls: ~2s updates; idle tenants: ~10s heartbeat (less client churn)
        let metricTicks = 0;
        const interval = setInterval(() => {
            metricTicks += 1;
            const hasLive = lastSnapshot.activeCalls > 0;
            if (hasLive || metricTicks % 5 === 0) {
                void sendMetrics();
            }
        }, 2000);

        req.on('close', () => {
            closed = true;
            clearInterval(interval);
            clearInterval(keepalive);
            if (metricsDebounce) clearTimeout(metricsDebounce);
            unsubscribeFromChannel(pushChannel, onPushMessage);
        });
    });

    return router;
}

