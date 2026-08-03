/**
 * Data Retention Controller
 * REST endpoints for managing data retention policies.
 */

import { dataRetentionService } from './retention.service.js';
import { asyncHandler } from '../../middleware/index.js';
import { requireProfessionalOrHigher } from '../../middleware/plan-gating.js';
import express from 'express';

function getTenantScope(req: Request): string {
  const tenantId = req.header('x-tenant-id');
  if (!tenantId) throw new Error('x-tenant-id header is required');
  return tenantId;
}

export function createRetentionRouter(): express.Router {
  const router = express.Router();
  const gate = requireProfessionalOrHigher();

  router.get('/', gate, asyncHandler(async (req: any, res: any) => {
    const tenantId = getTenantScope(req);
    const policy = await dataRetentionService.getPolicy(tenantId);
    res.json({ success: true, data: policy });
  }));

  router.put('/', gate, asyncHandler(async (req: any, res: any) => {
    const tenantId = getTenantScope(req);
    const policy = await dataRetentionService.upsertPolicy(tenantId, req.body);
    res.json({ success: true, data: policy });
  }));

  return router;
}

