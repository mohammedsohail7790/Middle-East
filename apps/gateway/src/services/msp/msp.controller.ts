/**
 * MSP / Reseller Controller
 * REST endpoints for managing parent-child tenant relationships.
 */

import { mspService } from './msp.service.js';
import { asyncHandler } from '../../middleware/index.js';
import { requireProfessionalOrHigher } from '../../middleware/plan-gating.js';
import express from 'express';

function getTenantScope(req: Request): string {
  const tenantId = req.header('x-tenant-id');
  if (!tenantId) throw new Error('x-tenant-id header is required');
  return tenantId;
}

export function createMSPRouter(): express.Router {
  const router = express.Router();
  const gate = requireProfessionalOrHigher();

  router.get('/children', gate, asyncHandler(async (req: any, res: any) => {
    const tenantId = getTenantScope(req);
    const children = await mspService.getChildTenants(tenantId);
    res.json({ success: true, data: children });
  }));

  router.get('/dashboard', gate, asyncHandler(async (req: any, res: any) => {
    const tenantId = getTenantScope(req);
    const dashboard = await mspService.getDashboard(tenantId);
    res.json({ success: true, data: dashboard });
  }));

  router.post('/children', gate, asyncHandler(async (req: any, res: any) => {
    const tenantId = getTenantScope(req);
    const { childTenantId, ...data } = req.body;
    if (!childTenantId) return res.status(400).json({ success: false, error: 'childTenantId is required' });
    const relationship = await mspService.addRelationship(tenantId, childTenantId, data);
    res.status(201).json({ success: true, data: relationship });
  }));

  router.put('/children/:id', gate, asyncHandler(async (req: any, res: any) => {
    const tenantId = getTenantScope(req);
    const { id } = req.params;
    const relationship = await mspService.updateRelationship(tenantId, id, req.body);
    res.json({ success: true, data: relationship });
  }));

  router.delete('/children/:id', gate, asyncHandler(async (req: any, res: any) => {
    const tenantId = getTenantScope(req);
    const { id } = req.params;
    await mspService.removeRelationship(tenantId, id);
    res.json({ success: true, message: 'Relationship removed' });
  }));

  return router;
}

