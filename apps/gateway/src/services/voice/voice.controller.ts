import { createHash } from 'crypto';
import { logger } from '../logger.js';
import { queryTenantRows, voiceDb } from './tenant-scope.js';
import { requireSupabaseUser } from '../auth/require-supabase-user.js';
import { requireVoiceApiAccess, twilioWebhookGuard, voiceRateLimit } from './security.js';
import { validate } from '../../middleware/validation.js';
import { tenantCreateBodySchema } from '../../security/validation-schemas.js';
import { getAdminApiKey } from '../../security/secrets.js';
import { integrationService } from '../integrations/integration.service.js';
import { listIndustries, buildIndustryConfig } from '../industry/index.js';
import express from 'express';
import { getGatewayPublicHttpsBase, getTwilioStreamWssBase } from '../env.js';
import { clientErrorMessage } from '../../security/safe-error.js';
import { requireEssentialOrHigher, requireCallMinutes } from '../../middleware/plan-gating.js';

function fallbackRequestHost(): string {
    const base = getGatewayPublicHttpsBase();
    if (base) {
        try {
            return new URL(base).host;
        } catch {
            /* ignore */
        }
    }
    return 'gateway.hallaai.com';
}

/** Start recording a call via the Twilio REST API. Fire-and-forget after a short
 *  delay so the <Connect><Stream> has time to establish first. */
function startCallRecording(callSid: string, tenantId: string): void {
    (async () => {
        try {
            const twilioClient = (await import('twilio')).default(
                process.env.TWILIO_ACCOUNT_SID,
                process.env.TWILIO_AUTH_TOKEN
            );
            const baseUrl =
                process.env.GATEWAY_PUBLIC_URL ||
                process.env.RENDER_EXTERNAL_URL ||
                process.env.TWILIO_STREAM_WSS_URL?.replace(/^wss:/i, 'https://') ||
                '';

            setTimeout(async () => {
                try {
                    await twilioClient.calls(callSid).recordings.create({
                        recordingStatusCallback: `${baseUrl.replace(/\/$/, '')}/api/v1/voice/recording-status`,
                        recordingStatusCallbackMethod: 'POST',
                        recordingChannels: 'dual',
                    });
                    logger.info('RECORDING_STARTED', { callSid, tenantId });
                } catch (recErr: unknown) {
                    logger.warn('RECORDING_START_FAILED', { callSid, error: String(recErr) });
                }
            }, 3000);
        } catch {
            /* ignore recording setup errors */
        }
    })();
}

// In-memory dedup for Twilio CallSids — retries reuse cached TwiML (never Hangup on retry)
const recentCallSids = new Set<string>();
const twimlByCallSid = new Map<string, { twiml: string; expiresAt: number }>();
const CALLSID_DEDUP_TTL_MS = 60_000;
const TWIML_CACHE_TTL_MS = 300_000;

function cacheIncomingCallTwiml(callSid: string, twiml: string): void {
    if (!callSid) return;
    twimlByCallSid.set(callSid, { twiml, expiresAt: Date.now() + TWIML_CACHE_TTL_MS });
}

function getCachedIncomingCallTwiml(callSid: string): string | null {
    const row = twimlByCallSid.get(callSid);
    if (!row) return null;
    if (Date.now() > row.expiresAt) {
        twimlByCallSid.delete(callSid);
        return null;
    }
    return row.twiml;
}

function dedupCallSid(callSid: string): boolean {
    if (recentCallSids.has(callSid)) return false; // duplicate
    recentCallSids.add(callSid);
    setTimeout(() => recentCallSids.delete(callSid), CALLSID_DEDUP_TTL_MS);
    return true;
}

interface TenantInfo {
    id: string;
    businessName: string;
    phoneNumber: string;
    aiAgentId?: string | null;
}

async function getTenantByPhone(toNumber: string): Promise<TenantInfo | null> {
    const normalized = toNumber.replace(/[^\d+]/g, '');
    try {
        // Use the multi-number lookup function (checks tenant_phone_numbers first, then falls back to voice_tenants.phone_number)
        const result = await voiceDb.query(
            `SELECT tenant_id, company_name, phone_number, ai_agent_id FROM public.get_tenant_by_phone_number($1)`,
            [normalized]
        );
        if (result.rows.length === 0) {
            logger.warn('No tenant found for phone number', { phoneNumber: normalized });
            return null;
        }
        const matched = result.rows[0];
        logger.info('Tenant resolved', {
            tenantId: matched.tenant_id,
            businessName: matched.company_name,
            matchedPhone: matched.phone_number,
        });
        return {
            id: matched.tenant_id,
            businessName: matched.company_name,
            phoneNumber: matched.phone_number,
            aiAgentId: matched.ai_agent_id || null,
        };
    } catch (error) {
        logger.error('Database error during tenant lookup', { error: String(error), phoneNumber: normalized });
        return null;
    }
}

/** Register call row at webhook time so recording callbacks can attach URLs. */
export async function ensureCallRecord(tenantId: string, callSid: string): Promise<void> {
    if (!tenantId || !callSid) return;
    await voiceDb.query(
        `INSERT INTO public.calls (tenant_id, call_sid, transcript, language, latency, duration_ms)
         VALUES ($1, $2, '', 'en', 0, 0)
         ON CONFLICT (call_sid) DO NOTHING`,
        [tenantId, callSid]
    );
    // Live call.started is published when the media stream session is ready (realtime.gateway).
}

export async function getPendingRecording(callSid: string): Promise<{ url: string; duration: number } | null> {
    const { voiceRedis } = await import('./redis.client.js');
    const raw = await voiceRedis.get(`pending_recording:${callSid}`);
    if (!raw) return null;
    try {
        return JSON.parse(raw) as { url: string; duration: number };
    } catch {
        return null;
    }
}

export async function clearPendingRecording(callSid: string): Promise<void> {
    const { voiceRedis } = await import('./redis.client.js');
    await voiceRedis.del(`pending_recording:${callSid}`);
}

export async function setPendingRecording(
    callSid: string,
    url: string,
    duration: number
): Promise<void> {
    const { voiceRedis } = await import('./redis.client.js');
    await voiceRedis.setex(
        `pending_recording:${callSid}`,
        86400,
        JSON.stringify({ url, duration })
    );
}

export async function storeCall(args: {
    tenantId: string;
    callSid: string;
    transcript: string;
    language?: string;
    latency: number;
    callId?: string;
    durationMs?: number;
    outcome?: string;
    missedReason?: string;
    transferTarget?: string;
    recordingUrl?: string | null;
    configHash?: string | null;
}): Promise<void> {
    const pending = await getPendingRecording(args.callSid);
    const recordingUrl = args.recordingUrl ?? pending?.url ?? null;
    const recordingDuration = pending?.duration;

    await voiceDb.query(
        `
      insert into public.calls (id, tenant_id, call_sid, transcript, recording_url, language, latency, duration_ms, outcome, missed_reason, transfer_target, config_hash, recording_duration)
      values (coalesce($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      on conflict (call_sid) do update
      set transcript = CASE WHEN excluded.transcript <> '' THEN excluded.transcript ELSE calls.transcript END,
          recording_url = coalesce(excluded.recording_url, calls.recording_url),
          recording_duration = coalesce(excluded.recording_duration, calls.recording_duration),
          language = excluded.language,
          latency = excluded.latency,
          duration_ms = excluded.duration_ms,
          outcome = excluded.outcome,
          missed_reason = excluded.missed_reason,
          transfer_target = excluded.transfer_target,
          config_hash = excluded.config_hash
      where calls.tenant_id = excluded.tenant_id
    `,
        [
            args.callId ?? null,
            args.tenantId,
            args.callSid,
            args.transcript,
            recordingUrl,
            args.language ?? 'en',
            args.latency,
            args.durationMs ?? 0,
            args.outcome ?? null,
            args.missedReason ?? null,
            args.transferTarget ?? null,
            args.configHash ?? null,
            recordingDuration ?? null,
        ]
    );

    if (pending) {
        await clearPendingRecording(args.callSid);
    }

    const { publishDashboardPushType } = await import('../dashboard/dashboard-events.js');
    publishDashboardPushType(args.tenantId, 'call.updated', [], {
        callSid: args.callSid,
        outcome: args.outcome ?? null,
    });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Resolve internal calls.id from Twilio call_sid (or pass through UUID). */
export async function resolveCallIdForLead(
    tenantId: string,
    callSidOrId?: string | null
): Promise<string | null> {
    if (!callSidOrId) return null;
    if (UUID_RE.test(callSidOrId)) return callSidOrId;
    try {
        const result = await voiceDb.query(
            `select id from public.calls where tenant_id = $1 and call_sid = $2 limit 1`,
            [tenantId, callSidOrId]
        );
        return result.rows[0]?.id ?? null;
    } catch {
        return null;
    }
}

async function publishLeadDashboardEvent(
    tenantId: string,
    leadId: string,
    created: boolean
): Promise<void> {
    const { publishDashboardPushType } = await import('../dashboard/dashboard-events.js');
    publishDashboardPushType(
        tenantId,
        created ? 'lead.created' : 'lead.updated',
        [],
        { leadId }
    );
}

export async function storeLead(args: {
    tenantId: string;
    callId?: string;
    name?: string;
    phone?: string;
    email?: string;
    service?: string;
    notes?: string;
    preferred_time?: string;
}): Promise<string | null> {
    if (!args.name && !args.phone && !args.service && !args.notes && !args.preferred_time) {
        return null;
    }

    let callId = args.callId ?? null;
    if (callId && !UUID_RE.test(callId)) {
        callId = await resolveCallIdForLead(args.tenantId, callId);
    }

    const fingerprint = createHash('sha256')
        .update(
            [
                args.tenantId,
                args.name || '',
                (args.phone || '').replace(/[^\d+]/g, ''),
                args.service || '',
                args.preferred_time || '',
            ].join('|')
        )
        .digest('hex');
    const params = [
        args.tenantId,
        callId,
        args.name ?? null,
        args.phone ?? null,
        args.email ?? null,
        args.service ?? null,
        args.notes ?? null,
        args.preferred_time ?? null,
        fingerprint,
    ];

    try {
        const inserted = await voiceDb.query(
            `
      insert into public.leads (
        tenant_id, call_id, name, phone, email, service, notes, preferred_time, fingerprint, source, status, score
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'inbound_call', 'new', 35)
      on conflict (tenant_id, fingerprint) do update set
        call_id = coalesce(excluded.call_id, leads.call_id),
        name = coalesce(excluded.name, leads.name),
        phone = coalesce(excluded.phone, leads.phone),
        email = coalesce(excluded.email, leads.email),
        service = coalesce(excluded.service, leads.service),
        notes = coalesce(excluded.notes, leads.notes),
        preferred_time = coalesce(excluded.preferred_time, leads.preferred_time)
      returning id, (xmax = 0) as inserted
    `,
            params
        );
        const row = inserted.rows[0] as { id?: string; inserted?: boolean } | undefined;
        if (row?.id) {
            void publishLeadDashboardEvent(args.tenantId, String(row.id), Boolean(row.inserted));
            return String(row.id);
        }
        return null;
    } catch (err: unknown) {
        const code = (err as { code?: string })?.code;
        if (code !== '42P10') {
            throw err;
        }
    }

    if (args.phone) {
        const updated = await voiceDb.query(
            `update public.leads
             set call_id = coalesce($3, call_id),
                 name = coalesce($4, name),
                 email = coalesce($5, email),
                 service = coalesce($6, service),
                 notes = coalesce($7, notes),
                 preferred_time = coalesce($8, preferred_time)
             where tenant_id = $1 and phone = $2
             returning id`,
            [
                args.tenantId,
                args.phone,
                callId,
                args.name ?? null,
                args.email ?? null,
                args.service ?? null,
                args.notes ?? null,
                args.preferred_time ?? null,
            ]
        );
        if (updated.rows.length > 0) {
            const leadId = String((updated.rows[0] as { id: string }).id);
            void publishLeadDashboardEvent(args.tenantId, leadId, false);
            return leadId;
        }
    }

    const fallback = await voiceDb.query(
        `
      insert into public.leads (
        tenant_id, call_id, name, phone, email, service, notes, preferred_time, fingerprint, source, status, score
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'inbound_call', 'new', 35)
      returning id
    `,
        params
    );
    const leadId = fallback.rows[0]?.id ? String(fallback.rows[0].id) : null;
    if (leadId) {
        void publishLeadDashboardEvent(args.tenantId, leadId, true);
    }
    return leadId;
}

function getTenantScope(req: Request): string {
    const resolved = (req as any).resolvedTenantId as string | undefined;
    if (resolved) return resolved;
    const tenantId = req.header('x-tenant-id');
    if (!tenantId) throw new Error('Tenant scope required (sign in or set x-tenant-id)');
    return tenantId;
}

function assertOwnTenant(req: Request, tenantId: string, res: any): boolean {
    const scope = getTenantScope(req);
    if (scope !== tenantId) {
        res.status(403).json({ success: false, error: 'Access denied for this workspace' });
        return false;
    }
    return true;
}

/** Load tenant row for dashboard; retries with fewer columns if migrations are behind. */
async function fetchTenantRowForDashboard(tenantId: string): Promise<Record<string, unknown> | null> {
    const fullSql = `select id, company_name, phone_number, default_language, voice_tone,
                            timezone, diagnostic_fee, transfer_phone_number, call_handling_mode,
                            metadata, created_at
                     from public.voice_tenants where id = $1 limit 1`;
    const minimalSql = `select id, company_name, phone_number, default_language, voice_tone,
                               timezone, metadata, created_at
                        from public.voice_tenants where id = $1 limit 1`;
    try {
        const result = await voiceDb.query(fullSql, [tenantId]);
        if (result.rows.length === 0) return null;
        return result.rows[0] as Record<string, unknown>;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!/column .* does not exist|42703/i.test(msg)) throw err;
        const result = await voiceDb.query(minimalSql, [tenantId]);
        if (result.rows.length === 0) return null;
        return {
            ...(result.rows[0] as Record<string, unknown>),
            transfer_phone_number: null,
            diagnostic_fee: null,
            call_handling_mode: 'message',
        };
    }
}

function mapTenantForDashboard(row: Record<string, unknown>) {
    return {
        id: row.id,
        companyName: row.company_name,
        company_name: row.company_name,
        language: row.default_language,
        default_language: row.default_language,
        timezone: row.timezone,
        tone: row.voice_tone,
        voice_tone: row.voice_tone,
        transferNumber: row.transfer_phone_number,
        transfer_phone_number: row.transfer_phone_number,
        diagnosticFee: row.diagnostic_fee,
        diagnostic_fee: row.diagnostic_fee,
        phone_number: row.phone_number,
        metadata: row.metadata,
        created_at: row.created_at,
    };
}

type TenantSettingsUpdateBody = {
    business_name?: string;
    company_name?: string;
    default_language?: string;
    voice_tone?: string;
    timezone?: string;
    diagnostic_fee?: number | null;
    transfer_phone_number?: string | null;
    call_handling_mode?: string;
    metadata?: Record<string, unknown>;
};

/** PUT tenant settings; retries without optional columns when migrations are behind. */
async function updateTenantForDashboard(
    tenantId: string,
    body: TenantSettingsUpdateBody,
    includeOptionalColumns: boolean
): Promise<Record<string, unknown> | null> {
    const {
        business_name,
        company_name,
        default_language,
        voice_tone,
        timezone,
        diagnostic_fee,
        transfer_phone_number,
        call_handling_mode,
        metadata,
    } = body;

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (business_name || company_name) {
        updates.push(`company_name = $${paramIdx++}`);
        values.push(business_name || company_name);
    }
    if (default_language) {
        updates.push(`default_language = $${paramIdx++}`);
        values.push(default_language);
    }
    if (voice_tone) {
        updates.push(`voice_tone = $${paramIdx++}`);
        values.push(voice_tone);
    }
    if (timezone) {
        updates.push(`timezone = $${paramIdx++}`);
        values.push(timezone);
    }
    if (includeOptionalColumns && diagnostic_fee !== undefined) {
        updates.push(`diagnostic_fee = $${paramIdx++}`);
        values.push(diagnostic_fee);
    }
    if (includeOptionalColumns && transfer_phone_number !== undefined) {
        updates.push(`transfer_phone_number = $${paramIdx++}`);
        values.push(transfer_phone_number);
    }
    if (includeOptionalColumns && call_handling_mode) {
        updates.push(`call_handling_mode = $${paramIdx++}`);
        values.push(call_handling_mode);
    }
    if (metadata) {
        updates.push(`metadata = metadata || $${paramIdx++}::jsonb`);
        values.push(JSON.stringify(metadata));
    }

    if (updates.length === 0) return null;

    values.push(tenantId);
    const result = await voiceDb.query(
        `UPDATE public.voice_tenants SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${paramIdx} RETURNING *`,
        values
    );
    if (result.rows.length === 0) return null;
    return result.rows[0] as Record<string, unknown>;
}

function getGatewayPublicBase(req?: express.Request): string {
    const fromEnv =
        process.env.GATEWAY_PUBLIC_URL?.trim() ||
        process.env.RENDER_EXTERNAL_URL?.trim() ||
        '';
    if (fromEnv) return fromEnv.replace(/\/$/, '');

    const wss = getTwilioStreamWssBase();
    if (wss) {
        return wss.replace(/^wss:/i, 'https://').replace(/^ws:/i, 'http://').replace(/\/$/, '');
    }

    if (req) {
        const proto = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
        const host = (req.headers as any)['x-forwarded-host'] || (req.headers as any).host || fallbackRequestHost();
        return `${proto}://${host}`;
    }
    return '';
}

function getStreamUrl(req: Request, tenantId: string, streamToken: string): string {
    const wsPath = '/ws/realtime';
    const qs = `token=${encodeURIComponent(streamToken)}`;

    const wsBaseUrl =
        getTwilioStreamWssBase() ||
        process.env.WS_BASE_URL?.trim().replace(/\/$/, '') ||
        '';

    if (wsBaseUrl) {
        return `${wsBaseUrl}${wsPath}/${tenantId}?${qs}`;
    }

    const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'wss' : 'ws';
    const host = (req.headers as any)['x-forwarded-host'] || (req.headers as any).host || fallbackRequestHost();
    return `${protocol}://${host}${wsPath}/${tenantId}?${qs}`;
}

export function createVoiceRouter(): express.Router {
    const router = express.Router();
    router.use(express.urlencoded({ extended: true }));
    router.use(voiceRateLimit);

    /** Twilio fetches this URL for outbound test calls (onboarding / API-initiated calls). */
    const testOutboundTwiml = (_req: any, res: any) => {
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">This is your Halla AI test call. Your line is working. Goodbye.</Say>
  <Hangup/>
</Response>`;
        return res.type('text/xml').send(twiml);
    };
    router.get('/test-outbound-twiml', twilioWebhookGuard, testOutboundTwiml);
    router.post('/test-outbound-twiml', twilioWebhookGuard, testOutboundTwiml);

    /** Twilio hits this once the callee picks up on a gateway-initiated outbound call
     *  (campaigns, click-to-call, reminders, follow-ups). Connects the same AI media
     *  stream pipeline used for inbound calls, primed with why we're calling. */
    router.post('/outbound-answer', twilioWebhookGuard, async (req: any, res: any) => {
        const callSid = String(req.body.CallSid || '');
        try {
            const { getOutboundCallContext } = await import('./outbound.service.js');
            const ctx = callSid ? await getOutboundCallContext(callSid) : null;

            if (!ctx) {
                logger.error('OUTBOUND_ANSWER_MISSING_CONTEXT', { callSid });
                return res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>We're unable to connect this call right now. Goodbye.</Say>
  <Hangup/>
</Response>`);
            }

            await ensureCallRecord(ctx.tenantId, callSid);
            const { issueStreamAuthToken } = await import('./ws-stream-auth.js');
            const streamToken = await issueStreamAuthToken(callSid, ctx.tenantId, ctx.agentId || undefined);

            const streamUrl = getStreamUrl(req, ctx.tenantId, streamToken);
            const streamStatusCallback = `${getGatewayPublicBase(req)}/api/v1/voice/stream-status`;
            const agentParam = ctx.agentId ? `<Parameter name="agentId" value="${ctx.agentId}" />` : '';
            const escapeAttr = (s: string) =>
                s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c] ?? c));
            const outboundContextParam = ctx.openingContext
                ? `<Parameter name="outboundContext" value="${escapeAttr(ctx.openingContext.slice(0, 800))}" />`
                : '';
            const outboundReasonParam = `<Parameter name="outboundReason" value="${escapeAttr(ctx.reason)}" />`;

            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${streamUrl}" statusCallback="${streamStatusCallback}" statusCallbackMethod="POST">
      <Parameter name="from" value="${ctx.fromNumber}" />
      <Parameter name="to" value="${ctx.toNumber}" />
      <Parameter name="streamToken" value="${streamToken}" />
      <Parameter name="direction" value="outbound" />
      ${agentParam}
      ${outboundReasonParam}
      ${outboundContextParam}
    </Stream>
  </Connect>
</Response>`;

            logger.info('OUTBOUND_ANSWER_TWIML_GENERATED', { tenantId: ctx.tenantId, callSid });
            return res.type('text/xml').send(twiml);
        } catch (error) {
            logger.error('OUTBOUND_ANSWER_ERROR', { callSid, error: String(error) });
            return res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>We're experiencing technical difficulties. Goodbye.</Say>
  <Hangup/>
</Response>`);
        }
    });

    router.post('/incoming-call', twilioWebhookGuard, async (req: any, res: any) => {
        // Dedup: Twilio sometimes retries the webhook with a new CallSid if the Stream fails
        if (!dedupCallSid(req.body.CallSid)) {
            const cachedTwiml = getCachedIncomingCallTwiml(req.body.CallSid);
            logger.warn('Duplicate incoming-call webhook — reusing cached TwiML', {
                callSid: req.body.CallSid,
                hasCachedTwiml: Boolean(cachedTwiml),
            });
            if (cachedTwiml) {
                return res.type('text/xml').send(cachedTwiml);
            }
            // No cache yet (rare race) — allow handler to build TwiML again
        }

        // NEVER return 500 to Twilio - always return valid TwiML
        try {
            const toNumber = String(req.body.To || '');
            const fromNumber = String(req.body.From || '');
            const callSid = String(req.body.CallSid || '');

            logger.info('Incoming call webhook received', {
                to: toNumber,
                from: fromNumber,
                callSid,
            });

            if (!toNumber) {
                logger.error('Missing To number in Twilio request');
                return res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Invalid request. Missing phone number.</Say>
  <Hangup/>
</Response>`);
            }

            const tenant = await getTenantByPhone(toNumber);

            if (!tenant) {
                logger.warn('Tenant not found for phone number', {
                    phoneNumber: toNumber,
                    callSid,
                });
                return res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>This number is not configured. Please contact support.</Say>
  <Hangup/>
</Response>`);
            }

            logger.info('Tenant resolved for incoming call', {
                phoneNumber: toNumber,
                tenantId: tenant.id,
                businessName: tenant.businessName,
                callSid,
            });

            const { evaluateSpam, markCallAsSpam, spamRejectTwiml } = await import('../spam/spam.service.js');
            const spamResult = await evaluateSpam({
                tenantId: tenant.id,
                callSid,
                fromNumber,
                toNumber,
                stirVerstat: req.body.StirVerstat ?? req.body.StirStatus,
                stirPassport: req.body.StirPassport,
            });
            if (spamResult.isSpam && spamResult.reason) {
                logger.info('Incoming call rejected as spam', {
                    tenantId: tenant.id,
                    callSid,
                    from: fromNumber,
                    reason: spamResult.reason,
                });
                await ensureCallRecord(tenant.id, callSid);
                try {
                    await markCallAsSpam(tenant.id, callSid, fromNumber, spamResult.reason);
                } catch (spamLogErr: unknown) {
                    logger.warn('markCallAsSpam failed — still rejecting call', {
                        tenantId: tenant.id,
                        callSid,
                        error: String(spamLogErr),
                    });
                }
                const twiml = spamRejectTwiml();
                cacheIncomingCallTwiml(callSid, twiml);
                return res.type('text/xml').send(twiml);
            }

            await ensureCallRecord(tenant.id, callSid);
            const { issueStreamAuthToken } = await import('./ws-stream-auth.js');
            const streamToken = await issueStreamAuthToken(callSid, tenant.id, tenant.aiAgentId || undefined);

            const streamUrl = getStreamUrl(req, tenant.id, streamToken);
            const streamStatusCallback = `${getGatewayPublicBase(req)}/api/v1/voice/stream-status`;
            const agentParam = tenant.aiAgentId
                ? `<Parameter name="agentId" value="${tenant.aiAgentId}" />`
                : '';
            const streamTokenParam = `<Parameter name="streamToken" value="${streamToken}" />`;

            if (streamUrl.includes('calliq-gateway.onrender.com')) {
                logger.error('STREAM_URL_DEAD_HOST', {
                    streamUrl,
                    hint: 'Use https://gateway.hallaai.com. Unset wrong TWILIO_STREAM_WSS_URL on Render.',
                    renderExternalUrl: process.env.RENDER_EXTERNAL_URL,
                });
            }

            // ── Compliance Center: AI disclosure, recording, consent ────────
            // Load compliance settings and prepend any required announcements.
            let compliancePreamble = '';
            let disclosureParam = '';
            let shouldRecord = process.env.ENABLE_CALL_RECORDING === 'true';
            try {
                const { complianceCenterService } = await import('../compliance/compliance-center.service.js');
                const opening = await complianceCenterService.buildCallOpeningTwiml(tenant.id);

                // AI Disclosure — always first. When it's the ONLY preamble (no
                // recording announcement, no consent gate), skip Twilio's <Say>
                // and let the AI speak the disclosure itself as the start of its
                // greeting: TwiML verbs run sequentially, so a <Say> before
                // <Connect> means the media stream (and all OpenAI session setup
                // behind it) only starts connecting AFTER the robo-voice finishes
                // — that serial handshake was a 3-4s dead-air gap between the
                // disclosure and the greeting. Recording announcements and
                // consent gates keep the <Say>/<Gather> path since their legal
                // ordering (announce before recording starts / DTMF consent)
                // requires it.
                if (opening.aiDisclosure) {
                    if (!opening.recordingAnnouncement && !opening.consentGate) {
                        const safeAttr = opening.aiDisclosure.slice(0, 400).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c] ?? c));
                        disclosureParam = `<Parameter name="aiDisclosure" value="${safeAttr}" />`;
                    } else {
                        compliancePreamble += `\n  <Say voice="Polly.Joanna">${opening.aiDisclosure.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c] ?? c))}</Say>`;
                    }
                }

                // Recording announcement — before stream starts
                if (opening.recordingAnnouncement) {
                    compliancePreamble += `\n  <Say voice="Polly.Joanna">${opening.recordingAnnouncement.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c] ?? c))}</Say>`;
                }

                // Consent gate — caller must press 1 (or, in choice mode, 1=record / 2=no record)
                if (opening.consentGate) {
                    // Use <Gather> to collect consent. If there's truly no input at all
                    // (caller stays silent through the timeout), Twilio falls through to
                    // the content after </Gather> without ever hitting /consent-response —
                    // that fallback must NOT hang up either: connect the call normally,
                    // just flagged so it isn't recorded or transcribed, same as an
                    // explicit decline.
                    const safeConsent = opening.consentGate.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c] ?? c));
                    const choiceParam = opening.consentOffersRecordingChoice ? '&amp;choice=1' : '';
                    const noInputStreamParam = '<Parameter name="consentDeclined" value="true" />';
                    compliancePreamble += `\n  <Gather numDigits="1" timeout="8" action="${getGatewayPublicBase(req)}/api/v1/voice/consent-response?callSid=${encodeURIComponent(callSid)}&amp;tenant=${encodeURIComponent(tenant.id)}${choiceParam}" method="POST">\n    <Say voice="Polly.Joanna">${safeConsent}</Say>\n  </Gather>\n  <Connect>\n    <Stream url="${streamUrl}" statusCallback="${streamStatusCallback}" statusCallbackMethod="POST">\n      <Parameter name="from" value="${fromNumber}" />\n      <Parameter name="to" value="${toNumber}" />\n      ${streamTokenParam}\n      ${agentParam}\n      ${noInputStreamParam}\n    </Stream>\n  </Connect>`;
                    // For consent gate we return early — the consent-response route resumes
                    // the call if the caller does press a digit before the Gather timeout.
                    const consentTwiml = `<?xml version="1.0" encoding="UTF-8"?>\n<Response>${compliancePreamble}\n</Response>`;
                    cacheIncomingCallTwiml(callSid, consentTwiml);
                    return res.type('text/xml').send(consentTwiml);
                }

                // Check if per-tenant recording is enabled
                const cs = await complianceCenterService.getSettings(tenant.id);
                if (cs.recordingEnabled) shouldRecord = true;
            } catch (complianceErr) {
                logger.warn('COMPLIANCE_CENTER_LOAD_ERROR', {
                    tenantId: tenant.id,
                    callSid,
                    error: String(complianceErr),
                });
            }

            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>${compliancePreamble}
  <Connect>
    <Stream url="${streamUrl}" statusCallback="${streamStatusCallback}" statusCallbackMethod="POST">
      <Parameter name="from" value="${fromNumber}" />
      <Parameter name="to" value="${toNumber}" />
      ${streamTokenParam}
      ${agentParam}
      ${disclosureParam}
    </Stream>
  </Connect>
</Response>`;

            if (shouldRecord) {
                startCallRecording(callSid, tenant.id);
            }

            logger.info('TwiML response generated', {
                tenantId: tenant.id,
                businessName: tenant.businessName,
                streamUrl,
                callSid,
            });
            cacheIncomingCallTwiml(callSid, twiml);
            return res.type('text/xml').send(twiml);

        } catch (error) {
            logger.error('Unhandled error in incoming call webhook', {
                error: String(error),
                stack: error instanceof Error ? error.stack : undefined,
            });

            return res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>We're experiencing technical difficulties. Please try again later.</Say>
  <Hangup/>
</Response>`);
        }
    });

    router.post('/integrations/retry/:jobId', requireVoiceApiAccess, async (req: any, res: any) => {
        try {
            const retried = await integrationService.retryDeadLetterJob(req.params.jobId);
            if (!retried) {
                return res.status(404).json({ success: false, error: 'DLQ job not found or invalid' });
            }
            return res.json({ success: true, retried: true });
        } catch (error) {
            logger.error('Manual integration retry failed', { error: String(error), jobId: req.params.jobId });
            return res.status(500).json({ success: false, error: 'Retry failed' });
        }
    });

    // Consent response: caller pressed a digit after the compliance consent gate.
    // In choice mode (opening.consentOffersRecordingChoice): 1 = consent to
    // recording, 2 = continue without recording. Otherwise: 1 = continue,
    // anything else = decline and hang up.
    router.post('/consent-response', twilioWebhookGuard, async (req: any, res: any) => {
        try {
            const digit = String(req.body?.Digits || '');
            const callSid = String(req.query.callSid || req.body?.CallSid || '');
            const tenantId = String(req.query.tenant || '');
            const choiceMode = req.query.choice === '1';

            // Digit 1 = full consent (record/transcribe per tenant/choice settings).
            // Anything else — decline, no input, timeout, or "2" in choice mode —
            // no longer disconnects the caller: the call proceeds normally, it
            // just isn't recorded or transcribed.
            const consented = digit === '1';
            const consentDeclined = !consented;
            logger.info(consented ? 'CONSENT_GRANTED' : 'CONSENT_DECLINED_CONTINUING', {
                callSid, tenantId, digit, choiceMode,
            });

            if (!tenantId) {
                return res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<Response><Hangup/></Response>`);
            }

            const tenantRow = await voiceDb.query(
                `SELECT id, company_name, phone_number FROM public.voice_tenants WHERE id = $1 LIMIT 1`,
                [tenantId]
            );
            if (!tenantRow.rows.length) {
                return res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<Response><Hangup/></Response>`);
            }

            let shouldRecord = process.env.ENABLE_CALL_RECORDING === 'true';
            if (consentDeclined) {
                shouldRecord = false;
            } else {
                try {
                    const { complianceCenterService } = await import('../compliance/compliance-center.service.js');
                    const cs = await complianceCenterService.getSettings(tenantId);
                    if (cs.recordingEnabled) shouldRecord = true;
                } catch (complianceErr) {
                    logger.warn('COMPLIANCE_CENTER_LOAD_ERROR', { tenantId, callSid, error: String(complianceErr) });
                }
            }
            if (shouldRecord) {
                startCallRecording(callSid, tenantId);
            }

            const { issueStreamAuthToken } = await import('./ws-stream-auth.js');
            const streamToken = await issueStreamAuthToken(callSid, tenantId, undefined);
            const streamUrl = getStreamUrl(req, tenantId, streamToken);
            const streamStatusCallback = `${getGatewayPublicBase(req)}/api/v1/voice/stream-status`;
            const streamTokenParam = `<Parameter name="streamToken" value="${streamToken}" />`;
            const consentDeclinedParam = consentDeclined
                ? '<Parameter name="consentDeclined" value="true" />'
                : '';

            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${streamUrl}" statusCallback="${streamStatusCallback}" statusCallbackMethod="POST">
      <Parameter name="from" value="${req.body?.From || ''}" />
      <Parameter name="to" value="${req.body?.To || ''}" />
      ${streamTokenParam}
      ${consentDeclinedParam}
    </Stream>
  </Connect>
</Response>`;
            cacheIncomingCallTwiml(callSid, twiml);
            return res.type('text/xml').send(twiml);
        } catch (err) {
            logger.error('CONSENT_RESPONSE_ERROR', { error: String(err) });
            return res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<Response><Hangup/></Response>`);
        }
    });

    // Twilio Media Stream status (connected / start / stop / error) — surfaces WS failures in logs
    router.post('/stream-status', twilioWebhookGuard, async (req: any, res: any) => {        const body = req.body || {};
        logger.info('TWILIO_STREAM_STATUS', {
            streamEvent: body.StreamEvent,
            streamSid: body.StreamSid,
            callSid: body.CallSid,
            streamName: body.StreamName,
            timestamp: body.Timestamp,
            error: body.Error,
        });
        return res.status(200).send('OK');
    });

    /** Twilio call lifecycle (initiated / ringing / answered / completed) for outbound dials. */
    router.post('/call-status', twilioWebhookGuard, async (req: any, res: any) => {
        const body = req.body || {};
        try {
            const { handleTwilioCallStatus } = await import('./outbound.service.js');
            await handleTwilioCallStatus({
                callSid: String(body.CallSid || ''),
                callStatus: String(body.CallStatus || ''),
                callDuration: body.CallDuration != null ? String(body.CallDuration) : undefined,
            });
        } catch (error) {
            logger.error('TWILIO_CALL_STATUS_ERROR', { error: String(error), callSid: body.CallSid });
        }
        return res.status(200).send('OK');
    });

    // Twilio Recording Status Callback — called when Twilio finishes encoding a call recording
    router.post('/recording-status', twilioWebhookGuard, async (req: any, res: any) => {
        try {
            const { CallSid, RecordingUrl, RecordingDuration, RecordingStatus } = req.body;

            if (!CallSid) {
                return res.status(200).send('OK');
            }

            if (RecordingStatus === 'completed' && RecordingUrl) {
                const mp3Url = RecordingUrl.replace('.wav', '.mp3');
                const duration = parseInt(RecordingDuration, 10) || 0;

                const callCheck = await voiceDb.query(
                    `SELECT tenant_id FROM public.calls WHERE call_sid = $1 LIMIT 1`,
                    [CallSid]
                );

                if (callCheck.rows.length > 0) {
                    const tenantId = callCheck.rows[0].tenant_id as string;
                    await voiceDb.query(
                        `update public.calls
                         set recording_url = $1, recording_duration = $2
                         where call_sid = $3 AND tenant_id = $4`,
                        [mp3Url, duration, CallSid, tenantId]
                    );
                    await clearPendingRecording(CallSid);
                    const { publishDashboardPushType } = await import('../dashboard/dashboard-events.js');
                    publishDashboardPushType(tenantId, 'call.updated', [], {
                        callSid: CallSid,
                        recordingReady: true,
                    });
                } else {
                    await setPendingRecording(CallSid, mp3Url, duration);
                    logger.info('Recording callback: queued pending recording', { callSid: CallSid });
                }

                logger.info('Recording URL stored', { callSid: CallSid, recordingUrl: mp3Url });
            }

            return res.status(200).send('OK');
        } catch (error) {
            logger.error('Recording callback error', { error: String(error) });
            return res.status(200).send('OK');
        }
    });

    return router;
}

export function createLeadsRouter(): express.Router {
    const router = express.Router();
    router.use(requireVoiceApiAccess);
    router.use(voiceRateLimit);
    router.get('/', async (req, res) => {
        try {
            const tenantId = getTenantScope(req);
            const rows = await queryTenantRows(
                tenantId,
                `select id, tenant_id, name, phone, service, notes, preferred_time, created_at
                 from public.leads
                 order by created_at desc
                 limit 200`
            );
            res.json({ success: true, data: rows });
        } catch (error) {
            res.status(400).json({ success: false, error: clientErrorMessage(error, 'Request failed') });
        }
    });
    return router;
}

export function createCallsRouter(): express.Router {
    const router = express.Router();

    const isMissingColumn = (err: unknown) =>
      /column .* does not exist|42703/i.test(err instanceof Error ? err.message : String(err));

    const updateCallTags = async (tenantId: string, callId: string, tags: string[]) => {
      try {
        await voiceDb.query(
          `update public.calls set call_tags = $1, updated_at = now() where tenant_id = $2 and id = $3`,
          [tags, tenantId, callId]
        );
      } catch (err) {
        if (!isMissingColumn(err)) throw err;
        await voiceDb.query(
          `update public.calls set call_tags = $1 where tenant_id = $2 and id = $3`,
          [tags, tenantId, callId]
        );
      }
    };

    const updateCallDisposition = async (
      tenantId: string,
      callId: string,
      disposition: string
    ) => {
      try {
        return await voiceDb.query(
          `update public.calls set call_disposition = $1, updated_at = now()
           where tenant_id = $2 and id = $3
           returning call_disposition`,
          [disposition, tenantId, callId]
        );
      } catch (err) {
        if (!isMissingColumn(err)) throw err;
        return await voiceDb.query(
          `update public.calls set call_disposition = $1
           where tenant_id = $2 and id = $3
           returning call_disposition`,
          [disposition, tenantId, callId]
        );
      }
    };
    router.use(requireVoiceApiAccess);
    router.use(voiceRateLimit);

    /** Click-to-call / single outbound dial (reminders, follow-ups, ad-hoc agent-triggered calls). */
    router.post('/outbound', requireEssentialOrHigher(), requireCallMinutes(), async (req: any, res: any) => {
        try {
            const tenantId = getTenantScope(req);
            const toNumber = String(req.body?.toNumber || '').trim();
            const reason = String(req.body?.reason || 'click_to_call').trim();
            const openingContext = typeof req.body?.openingContext === 'string' ? req.body.openingContext.trim() : undefined;
            const fromNumberInput = typeof req.body?.fromNumber === 'string' ? req.body.fromNumber.trim() : undefined;
            const phoneNumberId = typeof req.body?.phoneNumberId === 'string' ? req.body.phoneNumberId.trim() : undefined;

            if (!toNumber) {
                return res.status(400).json({ success: false, error: 'toNumber is required' });
            }

            const { resolveOutboundCallerId } = await import('./resolve-outbound-caller-id.js');
            const caller = await resolveOutboundCallerId(tenantId, {
                fromNumber: fromNumberInput,
                phoneNumberId,
            });
            if (!caller) {
                return res.status(400).json({
                    success: false,
                    error: 'No authorized outbound phone number configured for this workspace',
                });
            }

            const { initiateOutboundCall } = await import('./outbound.service.js');
            const { callSid } = await initiateOutboundCall({
                tenantId,
                toNumber,
                fromNumber: caller.fromNumber,
                agentId: caller.agentId,
                reason,
                openingContext,
            });

            return res.json({ success: true, callSid });
        } catch (error) {
            res.status(500).json({ success: false, error: clientErrorMessage(error, 'Failed to place outbound call') });
        }
    });

    router.get('/', async (req, res) => {
        try {
            const tenantId = getTenantScope(req);
            const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
            const outcome = typeof req.query.outcome === 'string' ? req.query.outcome.trim() : '';
            const searchPattern = search ? `%${search}%` : null;
            const limit = Math.min(Math.max(parseInt(String(req.query.limit || '50'), 10) || 50, 1), 200);
            const offset = Math.max(parseInt(String(req.query.offset || '0'), 10) || 0, 0);
            const [result, countResult] = await Promise.all([
                voiceDb.query(
                    `SELECT id, tenant_id, call_sid, recording_url, latency, duration_ms, created_at, language, outcome,
                            call_tags, call_disposition, missed_reason, transfer_target,
                            CASE WHEN $3::text IS NOT NULL AND transcript ILIKE $3 THEN left(transcript, 120) ELSE NULL END AS transcript_snippet
                     FROM public.calls
                     WHERE tenant_id = $1
                       AND ($2::text IS NULL OR outcome = $2)
                       AND (
                         $3::text IS NULL
                         OR call_sid ILIKE $3
                         OR transcript ILIKE $3
                       )
                     ORDER BY created_at DESC
                     LIMIT $4 OFFSET $5`,
                    [tenantId, outcome || null, searchPattern, limit, offset]
                ),
                voiceDb.query(
                    `SELECT COUNT(*)::int AS total
                     FROM public.calls
                     WHERE tenant_id = $1
                       AND ($2::text IS NULL OR outcome = $2)
                       AND (
                         $3::text IS NULL
                         OR call_sid ILIKE $3
                         OR transcript ILIKE $3
                       )`,
                    [tenantId, outcome || null, searchPattern]
                ),
            ]);
            const total = Number(countResult.rows[0]?.total ?? 0);
            res.json({
                success: true,
                data: result.rows,
                limit,
                offset,
                total,
                hasMore: offset + result.rows.length < total,
            });
        } catch (error) {
            res.status(400).json({ success: false, error: clientErrorMessage(error, 'Request failed') });
        }
    });

    router.get('/:id', async (req, res) => {
        try {
            const tenantId = getTenantScope(req);
            const result = await voiceDb.query(
                `SELECT c.id, c.tenant_id, c.call_sid, c.transcript, c.recording_url, c.latency, c.duration_ms,
                        c.created_at, c.language, c.outcome, c.call_tags, c.call_disposition, c.missed_reason,
                        c.transfer_target, vt.company_name, vt.metadata
                 FROM public.calls c
                 JOIN public.voice_tenants vt ON vt.id = c.tenant_id
                 WHERE c.tenant_id = $1 AND c.id = $2
                 LIMIT 1`,
                [tenantId, req.params.id]
            );
            if (!result.rows.length) {
                return res.status(404).json({ success: false, error: 'Call not found' });
            }
            const row = result.rows[0];
            let meta = row.metadata || {};
            if (typeof meta === 'string') {
                try { meta = JSON.parse(meta); } catch { meta = {}; }
            }
            const { getBookingForCall } = await import('../appointments/appointment.service.js');
            const booking = await getBookingForCall(tenantId, req.params.id);

            let sentiment = 'neutral';
            try {
                const sentimentResult = await voiceDb.query(
                    `SELECT sentiment FROM public.call_quality_scores WHERE call_id = $1 AND tenant_id = $2 LIMIT 1`,
                    [req.params.id, tenantId]
                );
                if (sentimentResult.rows.length > 0 && sentimentResult.rows[0].sentiment) {
                    sentiment = sentimentResult.rows[0].sentiment;
                }
            } catch { /* sentiment not yet computed */ }

            res.json({
                success: true,
                data: {
                    id: row.id,
                    call_sid: row.call_sid,
                    transcript: row.transcript,
                    audio_url: row.recording_url,
                    recording_url: row.recording_url,
                    duration_ms: row.duration_ms,
                    latency: row.latency,
                    outcome: row.outcome,
                    language: row.language,
                    created_at: row.created_at,
                    tags: row.call_tags || [],
                    disposition: row.call_disposition,
                    caller_number: row.transfer_target || null,
                    agent_name: meta.agent_name || meta.agent_display_name || 'AI Assistant',
                    sentiment,
                    lead: booking.lead,
                    appointment: booking.appointment,
                    can_create_appointment: booking.canCreateFromCall,
                },
            });
        } catch (error) {
            res.status(500).json({ success: false, error: clientErrorMessage(error, 'Request failed') });
        }
    });

    router.post('/:id/tags', async (req, res) => {
        try {
            const tenantId = getTenantScope(req);
            const incoming: string[] = Array.isArray(req.body?.tags)
                ? req.body.tags
                : typeof req.body?.tag === 'string'
                  ? [req.body.tag.trim()]
                  : [];
            if (!incoming.length) {
                return res.status(400).json({ success: false, error: 'Provide tag or tags' });
            }
            const existing = await voiceDb.query(
                `select call_tags from public.calls where tenant_id = $1 and id = $2 limit 1`,
                [tenantId, req.params.id]
            );
            if (!existing.rows.length) {
                return res.status(404).json({ success: false, error: 'Call not found' });
            }
            const prior: string[] = existing.rows[0].call_tags || [];
            const merged = [...new Set([...prior, ...incoming.filter(Boolean)])];
            await updateCallTags(tenantId, req.params.id, merged);
            const { publishDashboardPushType } = await import('../dashboard/dashboard-events.js');
            publishDashboardPushType(tenantId, 'call.updated', [], { callId: req.params.id });
            res.json({ success: true, data: { tags: merged } });
        } catch (error) {
            res.status(500).json({ success: false, error: clientErrorMessage(error, 'Request failed') });
        }
    });

    router.delete('/:id/tags/:tag', async (req, res) => {
        try {
            const tenantId = getTenantScope(req);
            const tag = decodeURIComponent(req.params.tag);
            const existing = await voiceDb.query(
                `select call_tags from public.calls where tenant_id = $1 and id = $2 limit 1`,
                [tenantId, req.params.id]
            );
            if (!existing.rows.length) {
                return res.status(404).json({ success: false, error: 'Call not found' });
            }
            const prior: string[] = existing.rows[0].call_tags || [];
            const next = prior.filter((t) => t !== tag);
            await updateCallTags(tenantId, req.params.id, next);
            const { publishDashboardPushType } = await import('../dashboard/dashboard-events.js');
            publishDashboardPushType(tenantId, 'call.updated', [], { callId: req.params.id });
            res.json({ success: true, data: { tags: next } });
        } catch (error) {
            res.status(500).json({ success: false, error: clientErrorMessage(error, 'Request failed') });
        }
    });

    router.post('/:id/appointment', async (req, res) => {
        try {
            const tenantId = getTenantScope(req);
            const { createAppointmentFromCall } = await import('../appointments/appointment.service.js');
            const result = await createAppointmentFromCall(tenantId, req.params.id, {
                scheduled_time: req.body?.scheduled_time,
            });
            if (!result.success) {
                return res.status(400).json({ success: false, error: result.message });
            }
            const booking = await (
                await import('../appointments/appointment.service.js')
            ).getBookingForCall(tenantId, req.params.id);
            res.json({
                success: true,
                data: {
                    appointment: booking.appointment,
                    message: result.message,
                },
            });
        } catch (error) {
            res.status(500).json({ success: false, error: clientErrorMessage(error, 'Request failed') });
        }
    });

    router.post('/:id/disposition', async (req, res) => {
        try {
            const tenantId = getTenantScope(req);
            const disposition = req.body?.disposition;
            if (!disposition) {
                return res.status(400).json({ success: false, error: 'disposition required' });
            }
            const result = await updateCallDisposition(tenantId, req.params.id, disposition);
            if (!result.rows.length) {
                return res.status(404).json({ success: false, error: 'Call not found' });
            }
            const { publishDashboardPushType } = await import('../dashboard/dashboard-events.js');
            publishDashboardPushType(tenantId, 'call.updated', [], {
                callId: req.params.id,
                disposition: result.rows[0].call_disposition,
            });
            res.json({ success: true, data: { disposition: result.rows[0].call_disposition } });
        } catch (error) {
            res.status(500).json({ success: false, error: clientErrorMessage(error, 'Request failed') });
        }
    });

    return router;
}

export function createTenantsRouter(): express.Router {
    const router = express.Router();
    router.use(express.json());
    // Tiered /api rate limit already applies; voiceRateLimit (60/min) blocked dashboard settings saves.

    // GET /tenants — Super-admin only: list ALL tenants
    router.get('/', async (req: any, res: any) => {
        try {
            // Require super-admin API key to list all tenants
            const adminKey = getAdminApiKey();
            const providedKey = req.headers['x-admin-api-key'] as string;
            if (!adminKey || providedKey !== adminKey) {
                return res.status(403).json({ success: false, error: 'Admin access required' });
            }

            const rows = await voiceDb.query(
                `select id, company_name, phone_number, metadata, created_at
                 from public.voice_tenants
                 order by created_at desc
                 limit 200`
            );
            res.json({ success: true, data: rows.rows });
        } catch (error) {
            res.status(500).json({ success: false, error: clientErrorMessage(error, 'Request failed') });
        }
    });

    // POST /tenants — Onboarding: authenticated user, tenant_id not required yet
    router.post('/', requireSupabaseUser, validate(tenantCreateBodySchema), async (req: any, res: any) => {
        try {
            const {
                business_name,
                phone_number,
                services_offered,
                tone,
                question_flow,
                integrations,
                industry,
                industries,
                language_mode,
                owner_user_id,
                timezone,
                business_hours,
                agent_name,
                voice_id,
                system_prompt,
                capabilities,
            } = req.body;

            if (!business_name) {
                return res.status(400).json({ success: false, error: 'business_name is required' });
            }

            const industryList: string[] = Array.isArray(industries)
                ? industries.filter((v: unknown) => typeof v === 'string' && v.length > 0)
                : industry
                  ? [String(industry)]
                  : [];

            const agentDisplayName = (agent_name || 'Sarah').trim() || 'Sarah';
            const metadata: Record<string, unknown> = {
                services_offered: services_offered || [],
                tone: tone || 'professional',
                question_flow: question_flow || [],
                integrations: integrations || { zapier: { enabled: false } },
                industries: industryList,
                industry: industryList[0] || null,
                language_mode: language_mode || 'en',
                agent_name: agentDisplayName,
                agent_display_name: agentDisplayName,
                business_hours: business_hours || null,
                capabilities: capabilities || {
                    bookAppointments: true,
                    transferCalls: true,
                    collectPayments: false,
                    sendSMS: true,
                    accessKnowledge: true,
                },
            };

            const tenantPhone = phone_number || `+1000${Date.now().toString().slice(-7)}`;
            const authUserId = (req as { authUserId?: string }).authUserId;
            if (!authUserId) {
                return res.status(401).json({ success: false, error: 'Unauthorized' });
            }
            if (owner_user_id && owner_user_id !== authUserId) {
                return res.status(403).json({
                    success: false,
                    error: 'Cannot create a workspace for another user',
                });
            }
            const ownerId = authUserId;

            const existingTenant = await voiceDb.query(
                `select id, company_name, phone_number, metadata, created_at
                 from public.voice_tenants
                 where owner_user_id = $1
                 order by created_at desc
                 limit 1`,
                [ownerId]
            );
            if (existingTenant.rows.length > 0) {
                return res.status(200).json({
                    success: true,
                    data: existingTenant.rows[0],
                    existing: true,
                });
            }

            const prompt =
                system_prompt ||
                `You are ${agentDisplayName}, the AI receptionist for ${business_name}. Be ${tone || 'professional'}, helpful, and concise.`;

            const result = await voiceDb.query(
                `insert into public.voice_tenants (
                   id, owner_user_id, company_name, phone_number, voice_tone, timezone,
                   metadata, system_prompt, voice_id, default_language
                 )
                 values (gen_random_uuid(), $1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
                 returning id, company_name, phone_number, metadata, created_at`,
                [
                    ownerId,
                    business_name,
                    tenantPhone,
                    tone || 'professional',
                    timezone || 'America/New_York',
                    metadata,
                    prompt,
                    voice_id || 'marin',
                    language_mode || 'en',
                ]
            );

            const tenant = result.rows[0];

            try {
                const { billingService } = await import('../billing/billing.service.js');
                await billingService.provisionFreeTrial(tenant.id);
            } catch (trialErr) {
                logger.error('Failed to provision free trial for new tenant', {
                    tenantId: tenant.id,
                    error: String(trialErr),
                });
            }

            try {
                const { aiConfigService } = await import('../ai-config/ai-config.service.js');
                const { formatDefaultGreeting } = await import('../realtime/receptionist-voice.js');
                await aiConfigService.upsertConfig(
                    tenant.id,
                    {
                        agentName: agentDisplayName,
                        greetingMessage: formatDefaultGreeting(business_name, agentDisplayName),
                        voiceId: voice_id || 'marin',
                        tone: tone || 'professional',
                        language: language_mode || 'en',
                        systemInstructions: prompt,
                        speechRate: 0.97,
                        personality: `Warm, direct receptionist for ${business_name}`,
                    },
                    (metadata.capabilities as Record<string, boolean>) || undefined
                );
            } catch (configErr) {
                logger.error('Failed to seed AI config for new tenant', {
                    tenantId: tenant.id,
                    error: String(configErr),
                });
            }

            const bh = business_hours as
                | { days?: string[]; start?: string; end?: string; timezone?: string }
                | undefined;
            if (bh?.days?.length && bh.start && bh.end) {
                const dayMap: Record<string, number> = {
                    Sun: 0,
                    Mon: 1,
                    Tue: 2,
                    Wed: 3,
                    Thu: 4,
                    Fri: 5,
                    Sat: 6,
                };
                const tz = bh.timezone || timezone || 'America/New_York';
                for (const dayName of bh.days) {
                    const dow = dayMap[dayName];
                    if (dow === undefined) continue;
                    try {
                        await voiceDb.query(
                            `INSERT INTO public.business_hours
                             (tenant_id, day_of_week, start_time, end_time, is_open, timezone)
                             VALUES ($1, $2, $3, $4, true, $5)
                             ON CONFLICT (tenant_id, day_of_week)
                             DO UPDATE SET start_time = $3, end_time = $4, is_open = true, timezone = $5`,
                            [tenant.id, dow, bh.start, bh.end, tz]
                        );
                    } catch (bhErr) {
                        logger.warn('Failed to seed business hours for tenant', {
                            tenantId: tenant.id,
                            error: String(bhErr),
                        });
                    }
                }
            }

            const { publishDashboardPushType } = await import('../dashboard/dashboard-events.js');
            publishDashboardPushType(tenant.id, 'billing.updated', [], { created: true });
            publishDashboardPushType(tenant.id, 'config.updated');

            res.status(201).json({ success: true, data: tenant });
        } catch (error: any) {
            if (error?.code === '23505') {
                return res.status(409).json({ success: false, error: 'A tenant with this phone number already exists' });
            }
            logger.error('Failed to create tenant', { error: String(error) });
            const message = error?.message || String(error);
            res.status(500).json({ success: false, error: message.includes('json') ? message : 'Failed to create tenant' });
        }
    });

    // GET /tenants/onboarding-status — Resolve workspace by owner before JWT has tenant_id
    router.get('/onboarding-status', requireSupabaseUser, async (req: any, res: any) => {
        try {
            const ownerId =
                (req.query?.owner_user_id as string | undefined) ||
                (req as { authUserId?: string }).authUserId;
            if (!ownerId) {
                return res.status(400).json({ success: false, error: 'owner_user_id required' });
            }
            const result = await voiceDb.query(
                `select id from public.voice_tenants
                 where owner_user_id = $1
                 order by created_at desc
                 limit 1`,
                [ownerId]
            );
            if (!result.rows.length) {
                return res.status(404).json({ success: false, error: 'No workspace found' });
            }
            res.json({ success: true, data: { id: result.rows[0].id } });
        } catch (error) {
            res.status(500).json({ success: false, error: clientErrorMessage(error, 'Request failed') });
        }
    });

    router.use(requireVoiceApiAccess);

    // GET /tenants/me — Current user's tenant (from JWT; no URL id required)
    router.get('/me', async (req: any, res: any) => {
        try {
            const tenantId = getTenantScope(req);
            const row = await fetchTenantRowForDashboard(tenantId);
            if (!row) {
                return res.status(404).json({ success: false, error: 'Tenant not found' });
            }
            res.json({ success: true, data: mapTenantForDashboard(row) });
        } catch (error) {
            res.status(500).json({ success: false, error: clientErrorMessage(error, 'Request failed') });
        }
    });

    // GET /tenants/:id — Get tenant details (own tenant only)
    router.get('/:id', async (req: any, res: any) => {
        try {
            const { id } = req.params;
            if (!assertOwnTenant(req, id, res)) return;
            const row = await fetchTenantRowForDashboard(id);
            if (!row) {
                return res.status(404).json({ success: false, error: 'Tenant not found' });
            }
            res.json({ success: true, data: mapTenantForDashboard(row) });
        } catch (error) {
            res.status(500).json({ success: false, error: clientErrorMessage(error, 'Request failed') });
        }
    });

    // PUT /tenants/:id — Update tenant settings
    router.put('/:id', async (req: any, res: any) => {
        try {
            const { id } = req.params;
            if (!assertOwnTenant(req, id, res)) return;
            const body = req.body as TenantSettingsUpdateBody;
            const { default_language, voice_tone, transfer_phone_number } = body;

            let row: Record<string, unknown> | null = null;
            try {
                row = await updateTenantForDashboard(id, body, true);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                if (!/column .* does not exist|42703/i.test(msg)) throw err;
                row = await updateTenantForDashboard(id, body, false);
            }

            if (!row) {
                return res.status(404).json({ success: false, error: 'Tenant not found' });
            }

            // Invalidate voice config cache so next call uses updated settings immediately
            try {
                const { invalidateVoiceTenantCache } = await import('./voice-config-cache.js');
                await invalidateVoiceTenantCache(id);
            } catch { /* non-fatal */ }

            if (default_language || voice_tone || transfer_phone_number !== undefined) {
                try {
                    const { aiConfigService } = await import('../ai-config/ai-config.service.js');
                    await aiConfigService.upsertConfig(id, {
                        language: default_language,
                        tone: voice_tone,
                        transferPhoneNumber: transfer_phone_number ?? undefined,
                    });
                } catch {
                    /* non-fatal — voice_tenants row is source of truth for live calls */
                }
            }

            const { publishDashboardPushType } = await import('../dashboard/dashboard-events.js');
            publishDashboardPushType(id, 'config.updated');

            const dashboardRow = (await fetchTenantRowForDashboard(id)) || row;
            res.json({ success: true, data: mapTenantForDashboard(dashboardRow) });
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            logger.error('[Tenants] PUT settings failed', { error: msg });
            res.status(500).json({
                success: false,
                error: process.env.NODE_ENV === 'development' ? msg : 'Failed to save company settings',
            });
        }
    });

    // DELETE /tenants/:id — Super-admin only: delete a tenant
    router.delete('/:id', async (req: any, res: any) => {
        try {
            // Require super-admin API key to delete tenants
            const adminKey = getAdminApiKey();
            const providedKey = req.headers['x-admin-api-key'] as string;
            if (!adminKey || providedKey !== adminKey) {
                return res.status(403).json({ success: false, error: 'Admin access required' });
            }

            const { id } = req.params;
            const result = await voiceDb.query('delete from public.voice_tenants where id = $1 returning id', [id]);
            if (result.rowCount === 0) {
                return res.status(404).json({ success: false, error: 'Tenant not found' });
            }
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ success: false, error: clientErrorMessage(error, 'Request failed') });
        }
    });

    // GET /tenants/industries — List all available industry templates
    router.get('/industries', async (req: any, res: any) => {
        try {
            const industries = listIndustries().map(ind => ({
                id: ind.id,
                name: ind.name,
                description: ind.description,
                icon: ind.icon,
                defaultServices: ind.defaultServices,
                callHandlingMode: ind.callHandlingMode,
            }));
            res.json({ success: true, data: industries });
        } catch (error) {
            res.status(500).json({ success: false, error: clientErrorMessage(error, 'Request failed') });
        }
    });

    // GET /tenants/:id/industry-config — Get resolved industry config for a tenant
    router.get('/:id/industry-config', async (req: any, res: any) => {
        try {
            const { id } = req.params;
            const tenant = await voiceDb.query(
                `select company_name, industry, working_hours, diagnostic_fee, call_handling_mode
                 from public.voice_tenants where id = $1 limit 1`,
                [id]
            );
            if (tenant.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Tenant not found' });
            }
            const row = tenant.rows[0];
            const config = buildIndustryConfig({
                industry: row.industry || 'hvac',
                businessName: row.company_name || '[Business]',
                overrideWorkingHours: row.working_hours || undefined,
                overrideDiagnosticFee: row.diagnostic_fee !== undefined ? Number(row.diagnostic_fee) : undefined,
                overrideCallHandlingMode: row.call_handling_mode as 'message' | 'transfer' | 'both' | undefined,
            });
            res.json({ success: true, data: config });
        } catch (error) {
            res.status(500).json({ success: false, error: clientErrorMessage(error, 'Request failed') });
        }
    });

    // PATCH /tenants/:id/industry — Update tenant industry settings
    router.patch('/:id/industry', async (req: any, res: any) => {
        try {
            const { id } = req.params;
            const { industry, working_hours, diagnostic_fee, call_handling_mode, custom_prompt, custom_greeting } = req.body;

            if (!industry) {
                return res.status(400).json({ success: false, error: 'industry is required' });
            }

            // Validate industry exists
            try {
                buildIndustryConfig({ industry, businessName: '[Business]' });
            } catch {
                return res.status(400).json({ success: false, error: `Unknown industry: ${industry}` });
            }

            try {
                const { validateIndustryForHipaa } = await import('../compliance/hipaa.service.js');
                await validateIndustryForHipaa(id, String(industry));
            } catch (hipaaErr) {
                return res.status(403).json({
                    success: false,
                    error: hipaaErr instanceof Error ? hipaaErr.message : String(hipaaErr),
                });
            }

            const updates: string[] = [];
            const values: any[] = [];
            let idx = 1;

            updates.push(`industry = $${idx++}`);
            values.push(industry);

            if (working_hours !== undefined) {
                updates.push(`working_hours = $${idx++}`);
                values.push(working_hours || null);
            }
            if (diagnostic_fee !== undefined) {
                updates.push(`diagnostic_fee = $${idx++}`);
                values.push(Number(diagnostic_fee));
            }
            if (call_handling_mode !== undefined) {
                updates.push(`call_handling_mode = $${idx++}`);
                values.push(call_handling_mode);
            }

            // Store custom prompt/greeting in metadata
            const existing = await voiceDb.query(
                `select metadata from public.voice_tenants where id = $1`,
                [id]
            );
            if (existing.rows.length > 0) {
                const meta = existing.rows[0].metadata || {};
                if (custom_prompt !== undefined) meta.custom_prompt = custom_prompt;
                if (custom_greeting !== undefined) meta.custom_greeting = custom_greeting;
                updates.push(`metadata = $${idx++}`);
                values.push(JSON.stringify(meta));
            }

            updates.push(`updated_at = now()`);
            values.push(id);

            const result = await voiceDb.query(
                `update public.voice_tenants set ${updates.join(', ')} where id = $${idx} returning id, company_name, industry, working_hours, diagnostic_fee, call_handling_mode, metadata`,
                values
            );

            if (result.rowCount === 0) {
                return res.status(404).json({ success: false, error: 'Tenant not found' });
            }

            res.json({ success: true, data: result.rows[0] });
        } catch (error) {
            res.status(500).json({ success: false, error: clientErrorMessage(error, 'Request failed') });
        }
    });

    return router;
}

