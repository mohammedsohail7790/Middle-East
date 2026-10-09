/**
 * Owner-only application of a pilot workforce template to the caller's OWN tenant.
 *
 *   POST /api/v1/tenants/:id/workforce-template
 *   body: { vertical: "medical_tourism" | "dropshipping", dryRun?: boolean (default true), confirmTenantName?: string }
 *
 * Why this exists: production provisioning of the safety templates was deliberately impossible (the sandbox entry point
 * refuses unless HALLA_ENVIRONMENT is a non-production value), and no dashboard route applied them. This route is the
 * smallest supported alternative and is hard to misuse:
 *   1. OFF by default. It answers 404 unless HALLA_OWNER_WORKFORCE_APPLY=true is set on the gateway (a deliberate,
 *      reviewed configuration change).
 *   2. The caller must present a verified Supabase login (requireSupabaseUser) and be the OWNER of the tenant in the URL,
 *      defined exactly as the RLS helper user_is_tenant_owner() defines it: public.voice_tenants.owner_user_id = the caller.
 *      The dashboard onboarding (POST /tenants) creates tenants this way. Team members, admins and every other tenant are refused.
 *   3. DRY RUN by default. A real apply needs `dryRun: false` AND `confirmTenantName` equal to the tenant's exact company
 *      name, so a wrong tenant id cannot be written to by accident.
 *   4. The same safeguards as sandbox provisioning: template validation, a valid E.164 escalation transfer number, the
 *      plan's agent limit, everything checked before the first write. Business knowledge and tenant facts are never part
 *      of a template and are never overwritten.
 * It touches no phone number, places no call, contacts no customer and creates no lead. The response contains agent names
 * and actions only, never prompts, contact data or secrets.
 */
import express from 'express';
import { requireSupabaseUser } from '../auth/require-supabase-user.js';
import { pool } from '../db/pool.js';
import { clientErrorMessage } from '../../security/safe-error.js';
import { logger } from '../logger.js';
import { WORKFORCE_TEMPLATES } from './index.js';
import type { WorkforceVertical } from './types.js';
import { applyWorkforceTemplateForOwner, WorkforceProvisioningError } from './provision.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function ownerWorkforceApplyEnabled(): boolean {
  return (process.env.HALLA_OWNER_WORKFORCE_APPLY || '').trim().toLowerCase() === 'true';
}

/** Tenant row as the ownership check needs it: id, name and owner. Never returns contact data. */
async function loadTenant(tenantId: string): Promise<{ id: string; name: string; ownerUserId: string | null } | null> {
  const r = await pool.query('SELECT id, company_name, owner_user_id FROM public.voice_tenants WHERE id = $1', [tenantId]);
  const row = r.rows[0] as { id: string; company_name: string | null; owner_user_id: string | null } | undefined;
  return row ? { id: String(row.id), name: String(row.company_name ?? ''), ownerUserId: row.owner_user_id ? String(row.owner_user_id) : null } : null;
}

function isVertical(v: unknown): v is WorkforceVertical {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(WORKFORCE_TEMPLATES, v);
}

export function createWorkforceOwnerRouter(): express.Router {
  const router = express.Router();

  router.post('/:id/workforce-template', requireSupabaseUser, async (req, res) => {
    // 1. Disabled unless explicitly enabled: indistinguishable from a route that does not exist.
    if (!ownerWorkforceApplyEnabled()) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }

    try {
      const userId = (req as { authUserId?: string }).authUserId;
      if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

      const tenantId = String(req.params.id || '');
      if (!UUID_RE.test(tenantId)) {
        return res.status(400).json({ success: false, error: 'Invalid tenant id' });
      }

      const { vertical, confirmTenantName } = (req.body ?? {}) as Record<string, unknown>;
      if (!isVertical(vertical)) {
        return res.status(400).json({ success: false, error: `vertical must be one of: ${Object.keys(WORKFORCE_TEMPLATES).join(', ')}` });
      }
      // Anything other than an explicit boolean false stays a dry run.
      const dryRun = (req.body as { dryRun?: unknown } | undefined)?.dryRun !== false;

      // 2. The caller must be the OWNER of exactly this tenant. An unknown tenant and a non-owner get the same 403, so the
      //    route cannot be used to discover which tenant ids exist.
      const tenant = await loadTenant(tenantId);
      if (!tenant || tenant.ownerUserId !== userId) {
        logger.warn('WORKFORCE_OWNER_APPLY_DENIED', { tenantId, userId });
        return res.status(403).json({ success: false, error: 'Only the owner of the tenant can apply a workforce template' });
      }

      // 3. A real apply must name the tenant exactly.
      if (!dryRun && confirmTenantName !== tenant.name) {
        return res.status(400).json({
          success: false,
          error: 'confirmTenantName must equal the tenant company name exactly to apply for real (omit dryRun or set it true to preview)',
        });
      }

      const result = await applyWorkforceTemplateForOwner(tenantId, WORKFORCE_TEMPLATES[vertical], { dryRun });
      logger.info('WORKFORCE_OWNER_APPLY', {
        tenantId,
        userId,
        vertical,
        dryRun,
        agents: result.agents.map((a) => `${a.key}:${a.action}`),
      });
      return res.json({
        success: true,
        data: {
          tenantId,
          vertical: result.vertical,
          templateVersion: result.templateVersion,
          dryRun: result.dryRun,
          agents: result.agents.map((a) => ({ key: a.key, name: a.name, action: a.action })),
          warnings: result.warnings,
        },
      });
    } catch (error) {
      if (error instanceof WorkforceProvisioningError) {
        // Pre-flight refusals (no transfer number, plan limit, ...) are actionable and carry no secrets.
        return res.status(409).json({ success: false, error: error.message });
      }
      const status = (error as { status?: number })?.status || 500;
      logger.error('Failed to apply workforce template', { error: String(error) });
      return res.status(status).json({ success: false, error: clientErrorMessage(error, 'Failed to apply workforce template') });
    }
  });

  return router;
}
