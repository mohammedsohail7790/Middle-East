import express from 'express';
import { asyncHandler } from '../../middleware/index.js';
import { getTenantId } from '../auth/tenant-context.js';
import {
  getTenantSpamSettings,
  listSpamLog,
  upsertTenantSpamSettings,
} from './spam.service.js';

export function createSpamRouter(): express.Router {
  const router = express.Router();

  router.get(
    '/settings',
    asyncHandler(async (req, res) => {
      const tenantId = getTenantId(req);
      const settings = await getTenantSpamSettings(tenantId);
      res.json({ success: true, data: settings });
    })
  );

  router.put(
    '/settings',
    asyncHandler(async (req, res) => {
      const tenantId = getTenantId(req);
      const body = req.body || {};
      const settings = await upsertTenantSpamSettings(tenantId, {
        enabled: body.enabled,
        blockUnknownCaller: body.blockUnknownCaller,
        stirShakenRequired: body.stirShakenRequired,
        customBlocklist: Array.isArray(body.customBlocklist) ? body.customBlocklist : undefined,
        customAllowlist: Array.isArray(body.customAllowlist) ? body.customAllowlist : undefined,
      });
      res.json({ success: true, data: settings });
    })
  );

  router.get(
    '/log',
    asyncHandler(async (req, res) => {
      const tenantId = getTenantId(req);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
      const log = await listSpamLog(tenantId, limit);
      res.json({ success: true, data: log });
    })
  );

  return router;
}
