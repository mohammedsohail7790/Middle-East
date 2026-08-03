/**
 * IP Allowlist Controller
 * REST endpoints for managing IP-based access restrictions.
 */

import { ipAllowlistService } from '../security/ipAllowlist.js';
import { asyncHandler } from '../../middleware/index.js';
import { requireProfessionalOrHigher } from '../../middleware/plan-gating.js';
import express from 'express';

function getTenantScope(req: Request): string {
  const tenantId = req.header('x-tenant-id');
  if (!tenantId) throw new Error('x-tenant-id header is required');
  return tenantId;
}

export function createIPAllowlistRouter(): express.Router {
  const router = express.Router();
  const gate = requireProfessionalOrHigher();

  router.get('/', gate, asyncHandler(async (req: any, res: any) => {
    const tenantId = getTenantScope(req);
    const entries = await ipAllowlistService.list(tenantId);
    res.json({ success: true, data: entries });
  }));

  router.post('/', gate, asyncHandler(async (req: any, res: any) => {
    const tenantId = getTenantScope(req);
    const { ipAddress, description } = req.body;
    if (!ipAddress) return res.status(400).json({ success: false, error: 'ipAddress is required' });
    const entry = await ipAllowlistService.add(tenantId, ipAddress, description);
    res.status(201).json({ success: true, data: entry });
  }));

  router.put('/:id/toggle', gate, asyncHandler(async (req: any, res: any) => {
    const tenantId = getTenantScope(req);
    const { id } = req.params;
    const { enabled } = req.body;
    const entry = await ipAllowlistService.toggle(tenantId, id, enabled);
    res.json({ success: true, data: entry });
  }));

  router.delete('/:id', gate, asyncHandler(async (req: any, res: any) => {
    const tenantId = getTenantScope(req);
    const { id } = req.params;
    await ipAllowlistService.remove(tenantId, id);
    res.json({ success: true, message: 'Entry removed' });
  }));

  return router;
}

