/**
 * Audit Logs Controller
 * REST endpoints for viewing and filtering audit logs.
 */

import { auditLogService } from './audit.service.js';
import { asyncHandler } from '../../middleware/index.js';
import { requireProfessionalOrHigher } from '../../middleware/plan-gating.js';
import express from 'express';

function getTenantScope(req: Request): string {
  const tenantId = req.header('x-tenant-id');
  if (!tenantId) throw new Error('x-tenant-id header is required');
  return tenantId;
}

export function createAuditLogsRouter(): express.Router {
  const router = express.Router();
  const gate = requireProfessionalOrHigher();

  router.get(
    '/',
    gate,
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantScope(req);
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const action = req.query.action as string | undefined;
      const userId = req.query.userId as string | undefined;

      const logs = await auditLogService.getLogs(tenantId, { limit, offset, action, userId });
      const stats = await auditLogService.getStats(tenantId);

      res.json({ success: true, data: { logs, stats } });
    })
  );

  return router;
}

