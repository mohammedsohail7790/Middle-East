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
    const statusCallback = `${baseUrl()}/api/v1/voice/stream-status`;

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
