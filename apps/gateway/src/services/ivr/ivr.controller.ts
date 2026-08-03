/**
 * IVR Flows & Multi-Agent Controller
 * REST endpoints for managing IVR workflows and AI agents.
 */

import { ivrService } from './ivr.service.js';
import { asyncHandler } from '../../middleware/index.js';
import { requireProfessionalOrHigher } from '../../middleware/plan-gating.js';
import { resolveTenantId } from '../../middleware/resolve-tenant-id.js';
import { publishDashboardPushType } from '../dashboard/dashboard-events.js';
import express from 'express';

export function createIVRRouter(): express.Router {
  const router = express.Router();
  const gate = requireProfessionalOrHigher();

  router.get('/flows', gate, asyncHandler(async (req: any, res: any) => {
    const tenantId = resolveTenantId(req);
    const flows = await ivrService.listFlows(tenantId);
    res.json({ success: true, data: flows });
  }));

  router.post('/flows', gate, asyncHandler(async (req: any, res: any) => {
    const tenantId = resolveTenantId(req);
    const { name, greeting, steps } = req.body;
    if (!name || !steps) return res.status(400).json({ success: false, error: 'name and steps are required' });
    const flow = await ivrService.createFlow(tenantId, { name, greeting, steps });
    res.status(201).json({ success: true, data: flow });
  }));

  router.put('/flows/:id', gate, asyncHandler(async (req: any, res: any) => {
    const tenantId = resolveTenantId(req);
    const { id } = req.params;
    const flow = await ivrService.updateFlow(tenantId, id, req.body);
    res.json({ success: true, data: flow });
  }));

  router.delete('/flows/:id', gate, asyncHandler(async (req: any, res: any) => {
    const tenantId = resolveTenantId(req);
    const { id } = req.params;
    await ivrService.deleteFlow(tenantId, id);
    res.json({ success: true, message: 'IVR flow deleted' });
  }));

  router.get('/agents', gate, asyncHandler(async (req: any, res: any) => {
    const tenantId = resolveTenantId(req);
    const agents = await ivrService.listAgents(tenantId);
    res.json({ success: true, data: agents });
  }));

  router.post('/agents', gate, asyncHandler(async (req: any, res: any) => {
    const tenantId = resolveTenantId(req);
    const { name, role, systemPrompt, ...rest } = req.body;
    if (!name || !role || !systemPrompt) return res.status(400).json({ success: false, error: 'name, role, and systemPrompt are required' });
    const agent = await ivrService.createAgent(tenantId, { name, role, systemPrompt, ...rest });
    publishDashboardPushType(tenantId, 'config.updated');
    res.status(201).json({ success: true, data: agent });
  }));

  router.put('/agents/:id', gate, asyncHandler(async (req: any, res: any) => {
    const tenantId = resolveTenantId(req);
    const { id } = req.params;
    const agent = await ivrService.updateAgent(tenantId, id, req.body);
    publishDashboardPushType(tenantId, 'config.updated');
    res.json({ success: true, data: agent });
  }));

  router.delete('/agents/:id', gate, asyncHandler(async (req: any, res: any) => {
    const tenantId = resolveTenantId(req);
    const { id } = req.params;
    await ivrService.deleteAgent(tenantId, id);
    publishDashboardPushType(tenantId, 'config.updated');
    res.json({ success: true, message: 'AI agent deleted' });
  }));

  return router;
}

