import { logger } from '../logger.js';
import { voiceDb } from './tenant-scope.js';
import { voiceRedis } from './redis.client.js';
import { getGatewayPublicHttpsBase } from '../env.js';

const CONTEXT_TTL_SECONDS = 3600;

export interface OutboundCallContext {
    tenantId: string;
    toNumber: string;
    fromNumber: string;
    agentId?: string | null;
    reason: string; // e.g. "appointment_reminder", "follow_up", "sales_campaign", "click_to_call"
    /** Free-form context the AI should open the call with (lead name, appointment time, script hook). */
    openingContext?: string;
    campaignCallId?: string | null;
    leadId?: string | null;
    customerId?: string | null;
}

function outboundContextKey(callSid: string): string {
    return `outbound_call_ctx:${callSid}`;
}

export async function getOutboundCallContext(callSid: string): Promise<OutboundCallContext | null> {
    try {
        const raw = await voiceRedis.get(outboundContextKey(callSid));
        if (!raw) return null;
        return JSON.parse(raw) as OutboundCallContext;
    } catch {
        return null;
    }
}

function baseUrl(): string {
    return (getGatewayPublicHttpsBase() || 'https://gateway.hallaai.com').replace(/\/$/, '');
}

/** Places an outbound call via the Twilio REST API and stashes context for the
 *  /outbound-answer webhook + realtime session to pick up once Twilio connects. */
export async function initiateOutboundCall(
    ctx: OutboundCallContext
): Promise<{ callSid: string }> {
    const twilioClient = (await import('twilio')).default(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
    );

    const answerUrl = `${baseUrl()}/api/v1/voice/outbound-answer`;
    const statusCallback = `${baseUrl()}/api/v1/voice/call-status`;

    const call = await twilioClient.calls.create({
        to: ctx.toNumber,
        from: ctx.fromNumber,
        url: answerUrl,
        method: 'POST',
        statusCallback,
        statusCallbackMethod: 'POST',
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
    });

    await voiceRedis
        .setex(outboundContextKey(call.sid), CONTEXT_TTL_SECONDS, JSON.stringify(ctx))
        .catch((err) => {
            logger.warn('OUTBOUND_CONTEXT_CACHE_FAILED', { callSid: call.sid, error: String(err) });
        });

    await voiceDb.query(
        `INSERT INTO public.calls (tenant_id, call_sid, transcript, language, latency, duration_ms, direction, from_number, to_number, campaign_call_id, outbound_reason)
         VALUES ($1, $2, '', 'en', 0, 0, 'outbound', $3, $4, $5, $6)
         ON CONFLICT (call_sid) DO NOTHING`,
        [ctx.tenantId, call.sid, ctx.fromNumber, ctx.toNumber, ctx.campaignCallId ?? null, ctx.reason]
    );

    if (ctx.campaignCallId) {
        await voiceDb
            .query(
                `UPDATE public.campaign_calls SET status = 'calling', called_at = NOW()
                 WHERE id = $1`,
                [ctx.campaignCallId]
            )
            .catch((err) => logger.warn('CAMPAIGN_CALL_STATUS_UPDATE_FAILED', { error: String(err) }));
    }

    logger.info('OUTBOUND_CALL_INITIATED', {
        tenantId: ctx.tenantId,
        callSid: call.sid,
        reason: ctx.reason,
        campaignCallId: ctx.campaignCallId ?? null,
    });

    return { callSid: call.sid };
}

export function parseCampaignCallContext(raw: unknown): string | undefined {
    if (!raw) return undefined;
    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (parsed && typeof parsed === 'object' && 'openingContext' in parsed) {
            const ctx = (parsed as { openingContext?: unknown }).openingContext;
            return typeof ctx === 'string' && ctx.trim() ? ctx.trim() : undefined;
        }
    } catch {
        return undefined;
    }
    return undefined;
}

const TERMINAL_CALL_STATUSES = new Set(['completed', 'busy', 'failed', 'no-answer', 'canceled']);

function mapTwilioStatusToCampaignCall(status: string): 'completed' | 'failed' | 'no_answer' {
    const normalized = status.toLowerCase();
    if (normalized === 'completed') return 'completed';
    if (normalized === 'no-answer') return 'no_answer';
    return 'failed';
}

async function refreshCampaignStats(campaignId: string): Promise<void> {
    const agg = await voiceDb.query(
        `SELECT
           count(*) FILTER (WHERE status IN ('completed', 'failed', 'no_answer'))::int AS completed_count,
           count(*) FILTER (WHERE status = 'completed')::int AS success_count,
           count(*) FILTER (WHERE status IN ('failed', 'no_answer'))::int AS failed_count,
           count(*) FILTER (WHERE status IN ('pending', 'calling'))::int AS remaining
         FROM public.campaign_calls
         WHERE campaign_id = $1`,
        [campaignId]
    );
    const row = agg.rows[0];
    if (!row) return;

    const nextStatus =
        Number(row.remaining) === 0 && Number(row.completed_count) > 0 ? 'completed' : null;

    await voiceDb.query(
        `UPDATE public.campaigns
         SET completed_count = $2,
             success_count = $3,
             failed_count = $4,
             status = COALESCE($5, status),
             updated_at = NOW()
         WHERE id = $1`,
        [campaignId, row.completed_count, row.success_count, row.failed_count, nextStatus]
    );
}

/** Twilio call-status webhook — updates call duration and campaign dial progress. */
export async function handleTwilioCallStatus(payload: {
    callSid: string;
    callStatus: string;
    callDuration?: string;
}): Promise<void> {
    const callSid = payload.callSid?.trim();
    const callStatus = payload.callStatus?.trim().toLowerCase();
    if (!callSid || !callStatus) return;

    if (callStatus === 'completed') {
        const durationSec = parseInt(payload.callDuration || '0', 10) || 0;
        await voiceDb
            .query(
                `UPDATE public.calls
                 SET duration_ms = GREATEST(duration_ms, $2),
                     outcome = COALESCE(outcome, 'completed')
                 WHERE call_sid = $1`,
                [callSid, durationSec * 1000]
            )
            .catch((err) => logger.warn('CALL_STATUS_DURATION_UPDATE_FAILED', { callSid, error: String(err) }));
    }

    if (!TERMINAL_CALL_STATUSES.has(callStatus)) return;

    const callRow = await voiceDb.query(
        `SELECT campaign_call_id FROM public.calls WHERE call_sid = $1 LIMIT 1`,
        [callSid]
    );
    const campaignCallId = callRow.rows[0]?.campaign_call_id as string | undefined;
    if (!campaignCallId) return;

    const ccStatus = mapTwilioStatusToCampaignCall(callStatus);
    const campaignRow = await voiceDb.query(
        `UPDATE public.campaign_calls
         SET status = $2, result = $3
         WHERE id = $1
         RETURNING campaign_id`,
        [campaignCallId, ccStatus, callStatus]
    );
    const campaignId = campaignRow.rows[0]?.campaign_id as string | undefined;
    if (campaignId) {
        await refreshCampaignStats(campaignId);
    }
}
