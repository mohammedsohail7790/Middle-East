import express from 'express';
import { voiceDb } from './tenant-scope.js';
import { requireVoiceApiAccess, voiceRateLimit } from './security.js';
import { clientErrorMessage } from '../../security/safe-error.js';
import { logger } from '../logger.js';

function getTenantScope(req: any): string {
    const resolved = req.resolvedTenantId as string | undefined;
    if (resolved) return resolved;
    const tenantId = req.header('x-tenant-id');
    if (!tenantId) throw new Error('Tenant scope required (sign in or set x-tenant-id)');
    return tenantId;
}

interface CampaignTarget {
    phoneNumber: string;
    leadId?: string;
    customerId?: string;
    context?: string; // per-target opening context (e.g. "Reminder for Jane's 3pm cleaning appt")
}

/** Outbound campaigns: sales/cold-call lists, appointment reminders, lead follow-ups.
 *  Dialing is triggered on-demand via /start — a proper time-scheduled dialer (for
 *  reminders that must fire at a specific time) is a follow-up piece, not yet wired here. */
export function createCampaignsRouter(): express.Router {
    const router = express.Router();
    router.use(express.json());
    router.use(requireVoiceApiAccess);
    router.use(voiceRateLimit);

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
                    [campaignId, t.phoneNumber, purpose, t.context ? JSON.stringify({ openingContext: t.context }) : null, t.leadId ?? null, t.customerId ?? null]
                );
            }

            res.json({ success: true, campaignId });
        } catch (error) {
            res.status(500).json({ success: false, error: clientErrorMessage(error, 'Failed to create campaign') });
        }
    });

    /** Dials every pending target in the campaign now, staggered to avoid hammering Twilio. */
    router.post('/:id/start', async (req: any, res: any) => {
        try {
            const tenantId = getTenantScope(req);
            const campaignId = req.params.id;

            const tenantRow = await voiceDb.query(
                `select phone_number, ai_agent_id from public.voice_tenants where id = $1`,
                [tenantId]
            );
            const fromNumber = tenantRow.rows[0]?.phone_number;
            if (!fromNumber) {
                return res.status(400).json({ success: false, error: 'Tenant has no phone number configured' });
            }
            const agentId = tenantRow.rows[0]?.ai_agent_id || null;

            const campaign = await voiceDb.query(
                `select id from public.campaigns where id = $1 and tenant_id = $2`,
                [campaignId, tenantId]
            );
            if (campaign.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Campaign not found' });
            }

            const pending = await voiceDb.query(
                `select id, phone_number, purpose, context, lead_id, customer_id
                 from public.campaign_calls where campaign_id = $1 and status = 'pending'
                 order by created_at asc limit 500`,
                [campaignId]
            );

            await voiceDb.query(`update public.campaigns set status = 'running', updated_at = now() where id = $1`, [campaignId]);

            const { initiateOutboundCall } = await import('./outbound.service.js');
            const DIAL_STAGGER_MS = 2000;
            let queued = 0;
            for (const row of pending.rows) {
                const delay = queued * DIAL_STAGGER_MS;
                queued += 1;
                const context = row.context?.openingContext as string | undefined;
                setTimeout(() => {
                    initiateOutboundCall({
                        tenantId,
                        toNumber: row.phone_number,
                        fromNumber,
                        agentId,
                        reason: row.purpose || 'campaign',
                        openingContext: context,
                        campaignCallId: row.id,
                        leadId: row.lead_id,
                        customerId: row.customer_id,
                    }).catch((err) => {
                        logger.error('CAMPAIGN_DIAL_FAILED', { campaignId, campaignCallId: row.id, error: String(err) });
                        voiceDb
                            .query(`update public.campaign_calls set status = 'failed' where id = $1`, [row.id])
                            .catch(() => {});
                    });
                }, delay);
            }

            res.json({ success: true, queued });
        } catch (error) {
            res.status(500).json({ success: false, error: clientErrorMessage(error, 'Failed to start campaign') });
        }
    });

    return router;
}
