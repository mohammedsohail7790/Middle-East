/**
 * Voice Cloning Controller
 * REST endpoints for managing professional voice clones.
 */

import { voiceCloningService } from './voiceCloning.service.js';
import { asyncHandler } from '../../middleware/index.js';
import { requirePlan } from '../../middleware/plan-gating.js';
import express from 'express';

function getTenantScope(req: Request): string {
  const tenantId = req.header('x-tenant-id');
  if (!tenantId) throw new Error('x-tenant-id header is required');
  return tenantId;
}

export function createVoiceCloningRouter(): express.Router {
  const router = express.Router();
  const gate = requirePlan('customVoice');

  router.get('/', gate, asyncHandler(async (req: any, res: any) => {
    const tenantId = getTenantScope(req);
    const clones = await voiceCloningService.list(tenantId);
    res.json({ success: true, data: clones });
  }));

  router.post('/', gate, asyncHandler(async (req: any, res: any) => {
    const tenantId = getTenantScope(req);
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'name is required' });
    const clone = await voiceCloningService.create(tenantId, { name, description });
    res.status(201).json({ success: true, data: clone });
  }));

  router.post('/:id/samples', gate, asyncHandler(async (req: any, res: any) => {
    const tenantId = getTenantScope(req);
    const { id } = req.params;
    const { samples } = req.body;
    if (!samples || !Array.isArray(samples)) return res.status(400).json({ success: false, error: 'samples[] is required' });
    const clone = await voiceCloningService.uploadSamples(tenantId, id, samples);
    res.json({ success: true, data: clone });
  }));

  router.delete('/:id', gate, asyncHandler(async (req: any, res: any) => {
    const tenantId = getTenantScope(req);
    const { id } = req.params;
    await voiceCloningService.delete(tenantId, id);
    res.json({ success: true, message: 'Voice clone deleted' });
  }));

  return router;
}

