/**
 * SSO / SAML Controller
 * REST endpoints for managing enterprise SSO configurations.
 */

import { ssoService } from './sso.service.js';
import { asyncHandler } from '../../middleware/index.js';
import { requireProfessionalOrHigher } from '../../middleware/plan-gating.js';
import express from 'express';

function getTenantScope(req: Request): string {
  const tenantId = req.header('x-tenant-id');
  if (!tenantId) throw new Error('x-tenant-id header is required');
  return tenantId;
}

export function createSSORouter(): express.Router {
  const router = express.Router();
  const gate = requireProfessionalOrHigher();

  router.get(
    '/',
    gate,
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantScope(req);
      const config = await ssoService.getConfig(tenantId);
      const safeConfig = config ? { ...config, clientSecret: config.clientSecret ? '••••••••' : null } : null;
      res.json({ success: true, data: safeConfig });
    })
  );

  router.put(
    '/',
    gate,
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantScope(req);
      const config = await ssoService.upsertConfig(tenantId, req.body);
      res.json({ success: true, data: { ...config, clientSecret: config.clientSecret ? '••••••••' : null } });
    })
  );

  router.delete(
    '/',
    gate,
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantScope(req);
      await ssoService.delete(tenantId);
      res.json({ success: true, message: 'SSO configuration deleted' });
    })
  );

  router.post(
    '/disable',
    gate,
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantScope(req);
      await ssoService.disable(tenantId);
      res.json({ success: true, message: 'SSO disabled' });
    })
  );

  router.post(
    '/verify-domain',
    gate,
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantScope(req);
      const { email } = req.body;
      if (!email) return res.status(400).json({ success: false, error: 'email is required' });
      const allowed = await ssoService.isDomainAllowed(tenantId, email);
      res.json({ success: true, data: { allowed, email } });
    })
  );

  return router;
}

