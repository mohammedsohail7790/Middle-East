/**
 * Custom Webhooks Controller
 * REST endpoints for managing user-defined webhooks.
 */

import { customWebhooksService } from './webhooks.service.js';
import { asyncHandler } from '../../middleware/index.js';
import { requireProfessionalOrHigher } from '../../middleware/plan-gating.js';
import { getTenantId, type CallIqAuthenticatedRequest } from '../auth/tenant-context.js';
import { resolveUserRole, isTenantOwner } from '../enterprise/rbac.service.js';
import express from 'express';

/** Verified tenant from the authenticated JWT/internal-key context, not the raw header. */
function getTenantScope(req: Request): string {
  return getTenantId(req);
}

/**
 * Creating, changing, deleting or test-firing a webhook decides where a tenant's lead and call data is sent, so for a signed-in user
 * it is OWNER-ONLY: the account creator (voice_tenants.owner_user_id). Admins and ordinary members are refused. Before this check any
 * signed-in team member could register a webhook to an arbitrary HTTPS address.
 *
 * The role must resolve to 'owner' through the real resolver (so CALLIQ_ENTERPRISE_RBAC=false, which maps users to 'operator', also
 * denies) AND the user must be the recorded tenant owner (an admin can invite a team member with role 'owner'; that does not qualify).
 * requirePermission() is deliberately not used: it returns ok when RBAC is disabled.
 *
 * Only USER sessions (user_jwt, legacy_jwt) are checked. Tenant API keys are already limited by the default-deny route policy (they
 * need the dedicated `webhooks.manage` scope, see security/api-key-scope-policy.ts) and internal-service calls are trusted, so
 * neither is affected. Fails closed: no tenant context, no user id (e.g. a stream token) or a lookup error is refused.
 */
export async function requireWebhookManager(req: any, res: any, next: any): Promise<void> {
  try {
    const r = req as CallIqAuthenticatedRequest;
    if (!r.tenant) return res.status(403).json({ success: false, error: 'Forbidden' });
    if (r.tenant.source === 'tenant_api_key' || r.tenant.source === 'internal_service') return next();
    const role = await resolveUserRole(r.tenant.id, r.tenant.userId);
    if (role !== 'owner' || !(await isTenantOwner(r.tenant.id, r.tenant.userId))) {
      return res.status(403).json({ success: false, error: 'Only the account owner can manage webhooks' });
    }
    return next();
  } catch {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }
}

export function createWebhooksRouter(): express.Router {
  const router = express.Router();
  const gate = requireProfessionalOrHigher();

  router.get(
    '/',
    gate,
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantScope(req);
      const webhooks = await customWebhooksService.list(tenantId);
      res.json({ success: true, data: webhooks });
    })
  );

  router.post(
    '/',
    gate,
    requireWebhookManager,
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantScope(req);
      const { name, url, events, headers } = req.body;

      if (!name || !url || !events || !Array.isArray(events)) {
        return res.status(400).json({ success: false, error: 'name, url, and events[] are required' });
      }

      const webhook = await customWebhooksService.create(tenantId, { name, url, events, headers });
      res.status(201).json({ success: true, data: webhook });
    })
  );

  router.put(
    '/:id',
    gate,
    requireWebhookManager,
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantScope(req);
      const { id } = req.params;
      const webhook = await customWebhooksService.update(tenantId, id, req.body);
      res.json({ success: true, data: webhook });
    })
  );

  router.delete(
    '/:id',
    gate,
    requireWebhookManager,
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantScope(req);
      const { id } = req.params;
      await customWebhooksService.delete(tenantId, id);
      res.json({ success: true, message: 'Webhook deleted' });
    })
  );

  router.get(
    '/:id/deliveries',
    gate,
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantScope(req);
      const { id } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;
      const deliveries = await customWebhooksService.getDeliveries(tenantId, id, limit);
      res.json({ success: true, data: deliveries });
    })
  );

  router.post(
    '/:id/test',
    gate,
    requireWebhookManager,
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantScope(req);
      await customWebhooksService.dispatchEvent(tenantId, 'test.ping', { message: 'This is a test webhook from Halla AI' });
      res.json({ success: true, message: 'Test webhook dispatched' });
    })
  );

  return router;
}

