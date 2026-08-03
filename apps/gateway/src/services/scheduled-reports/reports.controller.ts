/**
 * Scheduled Reports Controller
 * REST endpoints for managing automated email reports.
 */

import { scheduledReportsService } from './reports.service.js';
import { asyncHandler } from '../../middleware/index.js';
import { requireProfessionalOrHigher } from '../../middleware/plan-gating.js';
import express from 'express';

function getTenantScope(req: Request): string {
  const tenantId = req.header('x-tenant-id');
  if (!tenantId) throw new Error('x-tenant-id header is required');
  return tenantId;
}

export function createReportsRouter(): express.Router {
  const router = express.Router();
  const gate = requireProfessionalOrHigher();

  router.get('/', gate, asyncHandler(async (req: any, res: any) => {
    const tenantId = getTenantScope(req);
    const reports = await scheduledReportsService.list(tenantId);
    res.json({ success: true, data: reports });
  }));

  router.post('/', gate, asyncHandler(async (req: any, res: any) => {
    const tenantId = getTenantScope(req);
    const { name, reportType, frequency, recipients, ...rest } = req.body;
    if (!name || !reportType || !frequency || !recipients) {
      return res.status(400).json({ success: false, error: 'name, reportType, frequency, and recipients[] are required' });
    }
    const report = await scheduledReportsService.create(tenantId, { name, reportType, frequency, recipients, ...rest });
    res.status(201).json({ success: true, data: report });
  }));

  router.put('/:id', gate, asyncHandler(async (req: any, res: any) => {
    const tenantId = getTenantScope(req);
    const { id } = req.params;
    const report = await scheduledReportsService.update(tenantId, id, req.body);
    res.json({ success: true, data: report });
  }));

  router.delete('/:id', gate, asyncHandler(async (req: any, res: any) => {
    const tenantId = getTenantScope(req);
    const { id } = req.params;
    await scheduledReportsService.delete(tenantId, id);
    res.json({ success: true, message: 'Report deleted' });
  }));

  return router;
}

