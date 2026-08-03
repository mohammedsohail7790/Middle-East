/**
 * Tenant API Keys Controller
 * REST endpoints for managing tenant API keys.
 */

import { tenantApiKeyService } from './apiKey.service.js';
import { asyncHandler } from '../../middleware/index.js';
import { requireProfessionalOrHigher } from '../../middleware/plan-gating.js';
import { type CallIqAuthenticatedRequest } from '../auth/tenant-context.js';
import { resolveUserRole, requirePermission } from '../enterprise/rbac.service.js';
import express from 'express';

function getTenantScope(req: Request): string {
  const tenantId = req.header('x-tenant-id');
  if (!tenantId) throw new Error('x-tenant-id header is required');
  return tenantId;
}

export function createApiKeysRouter(): express.Router {
  const router = express.Router();
  const gate = requireProfessionalOrHigher();

  router.get(
    '/',
    gate,
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantScope(req);
      const keys = await tenantApiKeyService.listKeys(tenantId);
      res.json({ success: true, data: keys });
    })
  );

  router.post(
    '/',
    gate,
    asyncHandler(async (req: any, res: any) => {
      const r = req as CallIqAuthenticatedRequest;
      const tenantId = getTenantScope(req);

      const userRole = await resolveUserRole(tenantId, r.tenant?.userId);
      const perm = requirePermission(userRole, 'governance:write');
      if (!perm.ok) {
        return res.status(403).json({ success: false, error: perm.reason ?? 'Forbidden' });
      }

      const { name, scopes, expiresAt } = req.body;

      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ success: false, error: 'name is required' });
      }

      if (
        scopes !== undefined &&
        (!Array.isArray(scopes) ||
          scopes.length === 0 ||
          !scopes.every((s) => typeof s === 'string' && s.trim().length > 0))
      ) {
        return res.status(400).json({ success: false, error: 'scopes must be a non-empty array of strings' });
      }

      let parsedExpiresAt: Date | null = null;
      if (expiresAt !== undefined && expiresAt !== null) {
        const d = new Date(expiresAt);
        if (Number.isNaN(d.getTime()) || d.getTime() <= Date.now()) {
          return res.status(400).json({ success: false, error: 'expiresAt must be a valid future date' });
        }
        parsedExpiresAt = d;
      }

      const key = await tenantApiKeyService.createKey(
        tenantId,
        name,
        scopes || ['read'],
        parsedExpiresAt
      );

      res.status(201).json({ success: true, data: key });
    })
  );

  router.post(
    '/:id/revoke',
    gate,
    asyncHandler(async (req: any, res: any) => {
      const r = req as CallIqAuthenticatedRequest;
      const tenantId = getTenantScope(req);

      const userRole = await resolveUserRole(tenantId, r.tenant?.userId);
      const perm = requirePermission(userRole, 'governance:write');
      if (!perm.ok) {
        return res.status(403).json({ success: false, error: perm.reason ?? 'Forbidden' });
      }

      const { id } = req.params;
      await tenantApiKeyService.revokeKey(tenantId, id);
      res.json({ success: true, message: 'API key revoked' });
    })
  );

  router.delete(
    '/:id',
    gate,
    asyncHandler(async (req: any, res: any) => {
      const r = req as CallIqAuthenticatedRequest;
      const tenantId = getTenantScope(req);

      const userRole = await resolveUserRole(tenantId, r.tenant?.userId);
      const perm = requirePermission(userRole, 'governance:write');
      if (!perm.ok) {
        return res.status(403).json({ success: false, error: perm.reason ?? 'Forbidden' });
      }

      const { id } = req.params;
      await tenantApiKeyService.deleteKey(tenantId, id);
      res.json({ success: true, message: 'API key deleted' });
    })
  );

  return router;
}

