/**
 * Custom Webhooks Controller
 * REST endpoints for managing user-defined webhooks.
 */

import { customWebhooksService } from './webhooks.service.js';
import { asyncHandler } from '../../middleware/index.js';
import { requireProfessionalOrHigher } from '../../middleware/plan-gating.js';
import { getTenantId, type CallIqAuthenticatedRequest } from '../auth/tenant-context.js';
import { resolveUserRole, requirePermission } from '../enterprise/rbac.service.js';
import express from 'express';

/** Verified tenant from the authenticated JWT/internal-key context, not the raw header. */
function getTenantScope(req: Request): string {
  return getTenantId(req);
}

/**
 * Creating, changing, deleting or test-firing a webhook decides where a tenant's lead and call data is sent, so it needs the same
 * permission as API-key management (`governance:write`: owner and admin). Before this check any signed-in team member of a tenant
 * could register a webhook to an arbitrary HTTPS address.
 *
 * Only USER sessions are role-checked. Tenant API keys are already limited by the default-deny route policy (they need the
 * dedicated `webhooks.manage` scope, see security/api-key-scope-policy.ts) and internal-service calls are trusted, so neither is
 * affected. Fails closed: no tenant context, a user session without a user id (e.g. a stream token) or a lookup error is refused.
 */
export async function requireWebhookManager(req: any, res: any, next: any): Promise<void> {
  try {
    const r = req as CallIqAuthenticatedRequest;
    if (!r.tenant) return res.status(403).json({ success: false, error: 'Forbidden' });
    // Every kind of USER session (user_jwt, legacy_jwt) is role-checked; only machine credentials are exempt.
    if (r.tenant.source === 'tenant_api_key' || r.tenant.source === 'internal_service') return next();
    const role = await resolveUserRole(r.tenant.id, r.tenant.userId);
    const perm = requirePermission(role, 'governance:write');
    if (!perm.ok) {
      return res.status(403).json({ success: false, error: perm.reason ?? 'Forbidden' });
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

