import express from 'express';
import { voiceDb } from './tenant-scope.js';
import { requireVoiceApiAccess, voiceRateLimit } from './security.js';
import { clientErrorMessage } from '../../security/safe-error.js';
import { requireCallMinutes, requireEssentialOrHigher } from '../../middleware/plan-gating.js';
import { logger } from '../logger.js';
import { parseCallingHoursInput } from '../scheduler/calling-hours.js';
import { CampaignControlError } from '../scheduler/campaign-control.js';

function sendControlError(res: any, error: unknown): boolean {
    if (!(error instanceof CampaignControlError)) return false;
    res.status(error.httpStatus).json({ success: false, error: error.message });
    return true;
}

function getTenantScope(req: any): string {
    const resolved = req.resolvedTenantId as string | undefined;
    if (resolved) return resolved;
    const tenantId = req.header('x-tenant-id');
    if (!tenantId) throw new Error('Tenant scope required (sign in or set x-tenant-id)');
    return tenantId;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface CampaignTarget {
    phoneNumber: string;
    leadId?: string;
    customerId?: string;
    context?: string; // per-target opening context (e.g. "Reminder for Jane's 3pm cleaning appt")
}

/** Outbound campaigns: sales/cold-call lists, appointment reminders, lead follow-ups.
 *  /start queues persistent dial jobs (services/scheduler) that run at the scheduled start time inside the campaign's calling hours;
 *  /pause, /resume, /stop and /status control and report on them. */
export function createCampaignsRouter(): express.Router {
    const router = express.Router();
    router.use(express.json());
    router.use(requireVoiceApiAccess);
    router.use(voiceRateLimit);
    router.use(requireEssentialOrHigher());

    router.use('/:id', (req: any, res: any, next: any) => {
        if (!UUID_RE.test(req.params.id)) {
            return res.status(400).json({ success: false, error: 'Invalid campaign id' });
        }
        next();
    });

    router.get('/', async (req: any, res: any) => {
        try {
            const tenantId = getTenantScope(req);
            const result = await voiceDb.query(
                `select c.id, c.name, c.description, c.type, c.status, c.total_targets, c.completed_count, c.success_count, c.failed_count, c.created_at,
                        (select cc.purpose from public.campaign_calls cc where cc.campaign_id = c.id limit 1) as purpose
                 from public.campaigns c where c.tenant_id = $1 order by c.created_at desc limit 100`,
                [tenantId]
            );
            res.json({ success: true, data: result.rows });
        } catch (error) {
            res.status(500).json({ success: false, error: clientErrorMessage(error, 'Request failed') });
        }
    });

    router.post('/', async (req: any, res: any) => {
        try {
            const tenantId = getTenantScope(req);
            const name = String(req.body?.name || '').trim();
            const description = typeof req.body?.description === 'string' ? req.body.description : null;
            const purpose = String(req.body?.purpose || 'campaign'); // campaign | reminder | follow_up
            const targets: CampaignTarget[] = Array.isArray(req.body?.targets) ? req.body.targets : [];

            if (!name) return res.status(400).json({ success: false, error: 'name is required' });
            if (targets.length === 0) return res.status(400).json({ success: false, error: 'targets must be a non-empty array' });
            if (!['campaign', 'reminder', 'follow_up'].includes(purpose)) {
                return res.status(400).json({ success: false, error: 'invalid purpose' });
            }

            const campaignResult = await voiceDb.query(
                `insert into public.campaigns (tenant_id, name, description, type, status, total_targets)
                 values ($1, $2, $3, 'outbound_call', 'draft', $4)
                 returning id`,
                [tenantId, name, description, targets.length]
            );
            const campaignId = campaignResult.rows[0].id;

            for (const t of targets) {
                if (!t.phoneNumber) continue;
                await voiceDb.query(
                    `insert into public.campaign_calls (campaign_id, phone_number, status, purpose, context, lead_id, customer_id)
                     values ($1, $2, 'pending', $3, $4, $5, $6)`,
                    [
                        campaignId,
                        t.phoneNumber,
                        purpose,
                        t.context ? { openingContext: t.context } : null,
                        t.leadId ?? null,
                        t.customerId ?? null,
                    ]
                );
            }

            res.json({ success: true, campaignId });
        } catch (error) {
            res.status(500).json({ success: false, error: clientErrorMessage(error, 'Failed to create campaign') });
        }
    });

    router.get('/:id', async (req: any, res: any) => {
        try {
            const tenantId = getTenantScope(req);
            const campaignId = req.params.id;
            const campaign = await voiceDb.query(
                `select id, name, description, status, total_targets, completed_count, success_count, failed_count, created_at
                 from public.campaigns where id = $1 and tenant_id = $2`,
                [campaignId, tenantId]
            );
            if (campaign.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Campaign not found' });
            }
            const targets = await voiceDb.query(
                `select phone_number, context, purpose
                 from public.campaign_calls
                 where campaign_id = $1
                 order by created_at asc`,
                [campaignId]
            );
            const { parseCampaignCallContext } = await import('./outbound.service.js');
            res.json({
                success: true,
                data: {
                    ...campaign.rows[0],
                    purpose: targets.rows[0]?.purpose ?? 'campaign',
                    targets: targets.rows.map((row) => ({
                        phoneNumber: row.phone_number,
                        context: parseCampaignCallContext(row.context),
                    })),
                },
            });
        } catch (error) {
            res.status(500).json({ success: false, error: clientErrorMessage(error, 'Failed to load campaign') });
        }
    });

    router.patch('/:id', async (req: any, res: any) => {
        try {
            const tenantId = getTenantScope(req);
            const campaignId = req.params.id;
            const campaign = await voiceDb.query(
                `select id, status from public.campaigns where id = $1 and tenant_id = $2`,
                [campaignId, tenantId]
            );
            if (campaign.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Campaign not found' });
            }
            if (campaign.rows[0].status !== 'draft') {
                return res.status(400).json({ success: false, error: 'Only draft campaigns can be edited' });
            }

            const name = typeof req.body?.name === 'string' ? req.body.name.trim() : undefined;
            const description =
                typeof req.body?.description === 'string' ? req.body.description.trim() : undefined;
            const purpose = typeof req.body?.purpose === 'string' ? req.body.purpose : undefined;
            const targets: CampaignTarget[] = Array.isArray(req.body?.targets) ? req.body.targets : [];

            if (purpose && !['campaign', 'reminder', 'follow_up'].includes(purpose)) {
                return res.status(400).json({ success: false, error: 'invalid purpose' });
            }

            if (name) {
                await voiceDb.query(
                    `update public.campaigns set name = $2, updated_at = now() where id = $1`,
                    [campaignId, name]
                );
            }
            if (description !== undefined) {
                await voiceDb.query(
                    `update public.campaigns set description = $2, updated_at = now() where id = $1`,
                    [campaignId, description || null]
                );
            }

            if (targets.length > 0) {
                await voiceDb.query(
                    `delete from public.campaign_calls
                     where campaign_id = $1 and status = 'pending'`,
                    [campaignId]
                );
                const dialPurpose = purpose || 'campaign';
                for (const t of targets) {
                    if (!t.phoneNumber) continue;
                    await voiceDb.query(
                        `insert into public.campaign_calls (campaign_id, phone_number, status, purpose, context, lead_id, customer_id)
                         values ($1, $2, 'pending', $3, $4, $5, $6)`,
                        [
                            campaignId,
                            t.phoneNumber,
                            dialPurpose,
                            t.context ? { openingContext: t.context } : null,
                            t.leadId ?? null,
                            t.customerId ?? null,
                        ]
                    );
                }
                const count = await voiceDb.query(
                    `select count(*)::int as total from public.campaign_calls where campaign_id = $1`,
                    [campaignId]
                );
                await voiceDb.query(
                    `update public.campaigns set total_targets = $2, updated_at = now() where id = $1`,
                    [campaignId, count.rows[0]?.total ?? targets.length]
                );
            } else if (purpose) {
                await voiceDb.query(
                    `update public.campaign_calls set purpose = $2 where campaign_id = $1 and status = 'pending'`,
                    [campaignId, purpose]
                );
            }

            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ success: false, error: clientErrorMessage(error, 'Failed to update campaign') });
        }
    });

    /**
     * Starts a campaign: one persistent dial job per pending target (table scheduled_jobs), so nothing is lost on a restart and no
     * number is dialled twice. Optional body: scheduleAt (ISO time to begin) and callingHours { start, end, days, timezone }, which
     * default to 09:00-20:00 every day in the business's timezone. Calls never go out outside those hours; they wait for the next opening.
     */
    router.post('/:id/start', requireCallMinutes(), async (req: any, res: any) => {
        try {
            const tenantId = getTenantScope(req);
            const campaignId = req.params.id;
            const fromNumberInput = typeof req.body?.fromNumber === 'string' ? req.body.fromNumber.trim() : undefined;
            const phoneNumberId = typeof req.body?.phoneNumberId === 'string' ? req.body.phoneNumberId.trim() : undefined;

            const hours = parseCallingHoursInput(req.body?.callingHours);
            if (hours.ok === false) return res.status(400).json({ success: false, error: hours.error });
            let scheduleAt: Date | null = null;
            if (req.body?.scheduleAt !== undefined && req.body.scheduleAt !== null) {
                scheduleAt = new Date(req.body.scheduleAt);
                if (Number.isNaN(scheduleAt.getTime())) return res.status(400).json({ success: false, error: 'scheduleAt must be an ISO date-time' });
            }

            const { resolveOutboundCallerId } = await import('./resolve-outbound-caller-id.js');
            const caller = await resolveOutboundCallerId(tenantId, { fromNumber: fromNumberInput, phoneNumberId });
            if (!caller) {
                return res.status(400).json({
                    success: false,
                    error: 'No authorized outbound phone number configured for this workspace',
                });
            }

            const { startCampaign } = await import('../scheduler/campaign-control.js');
            const { jobStore } = await import('../scheduler/runtime.js');
            const result = await startCampaign(jobStore, {
                tenantId, campaignId, fromNumber: caller.fromNumber, agentId: caller.agentId, now: new Date(), scheduleAt, hours: hours.value,
            });
            res.json({ success: true, queued: result.queued, status: result.status, scheduleAt: result.scheduleAt });
        } catch (error) {
            if (sendControlError(res, error)) return;
            logger.error('CAMPAIGN_START_FAILED', {
                campaignId: req.params.id,
                error: error instanceof Error ? error.stack || error.message : String(error),
            });
            res.status(500).json({ success: false, error: clientErrorMessage(error, 'Failed to start campaign') });
        }
    });

    /** Pause: no further calls are placed; calls already ringing finish. Resume continues where it stopped. */
    router.post('/:id/pause', async (req: any, res: any) => {
        try {
            const { pauseCampaign } = await import('../scheduler/campaign-control.js');
            const status = await pauseCampaign(getTenantScope(req), req.params.id, new Date());
            res.json({ success: true, status });
        } catch (error) {
            if (sendControlError(res, error)) return;
            res.status(500).json({ success: false, error: clientErrorMessage(error, 'Failed to pause campaign') });
        }
    });

    router.post('/:id/resume', async (req: any, res: any) => {
        try {
            const { resumeCampaign } = await import('../scheduler/campaign-control.js');
            const { jobStore } = await import('../scheduler/runtime.js');
            const result = await resumeCampaign(jobStore, getTenantScope(req), req.params.id, new Date());
            res.json({ success: true, ...result });
        } catch (error) {
            if (sendControlError(res, error)) return;
            res.status(500).json({ success: false, error: clientErrorMessage(error, 'Failed to resume campaign') });
        }
    });

    /** Stop for good: queued calls are cancelled and the campaign cannot be restarted (create a new one). */
    router.post('/:id/stop', async (req: any, res: any) => {
        try {
            const { stopCampaign } = await import('../scheduler/campaign-control.js');
            const { jobStore } = await import('../scheduler/runtime.js');
            const result = await stopCampaign(jobStore, getTenantScope(req), req.params.id, new Date());
            res.json({ success: true, ...result });
        } catch (error) {
            if (sendControlError(res, error)) return;
            res.status(500).json({ success: false, error: clientErrorMessage(error, 'Failed to stop campaign') });
        }
    });

    router.get('/:id/status', async (req: any, res: any) => {
        try {
            const { getCampaignStatus } = await import('../scheduler/campaign-control.js');
            res.json({ success: true, data: await getCampaignStatus(getTenantScope(req), req.params.id, new Date()) });
        } catch (error) {
            if (sendControlError(res, error)) return;
            res.status(500).json({ success: false, error: clientErrorMessage(error, 'Failed to load campaign status') });
        }
    });

    return router;
}
