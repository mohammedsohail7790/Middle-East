/**
 * QA / Supervisor Controller
 * REST endpoints for quality assurance and call evaluation.
 */

import { qaService } from './qa.service.js';
import { listQualityScores, scoreInboundCall } from './call-quality.service.js';
import { asyncHandler } from '../../middleware/index.js';
import { requireProfessionalOrHigher } from '../../middleware/plan-gating.js';
import express from 'express';

function getTenantScope(req: Request): string {
  const tenantId = req.header('x-tenant-id');
  if (!tenantId) throw new Error('x-tenant-id header is required');
  return tenantId;
}

export function createQARouter(): express.Router {
  const router = express.Router();
  const gate = requireProfessionalOrHigher();

  router.get(
    '/evaluations',
    gate,
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantScope(req);
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const reviewed = req.query.reviewed === 'true' ? true : req.query.reviewed === 'false' ? false : undefined;
      const flagged = req.query.flagged === 'true' ? true : req.query.flagged === 'false' ? false : undefined;

      const evaluations = await qaService.getEvaluations(tenantId, { limit, offset, reviewed, flagged });
      const stats = await qaService.getStats(tenantId);

      res.json({ success: true, data: { evaluations, stats } });
    })
  );

  router.post(
    '/evaluations',
    gate,
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantScope(req);
      const { callId, supervisorId, score, notes, flagged, flagReason } = req.body;

      if (!callId || !supervisorId || !score) {
        return res.status(400).json({ success: false, error: 'callId, supervisorId, and score are required' });
      }

      const evaluation = await qaService.submitEvaluation({ callId, tenantId, supervisorId, score, notes, flagged, flagReason });
      res.status(201).json({ success: true, data: evaluation });
    })
  );

  // GET /qa/rubrics — List QA rubrics
  router.get(
    '/rubrics',
    gate,
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantScope(req);
      const rubrics = await qaService.listRubrics(tenantId);
      res.json({ success: true, data: rubrics });
    })
  );

  // POST /qa/rubrics — Create rubric
  router.post(
    '/rubrics',
    gate,
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantScope(req);
      const { name, criteria } = req.body;
      if (!name || !criteria) {
        return res.status(400).json({ success: false, error: 'name and criteria are required' });
      }
      const rubric = await qaService.createRubric(tenantId, { name, criteria });
      res.status(201).json({ success: true, data: rubric });
    })
  );

  // PUT /qa/rubrics/:id — Update rubric
  router.put(
    '/rubrics/:id',
    gate,
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantScope(req);
      const { id } = req.params;
      const rubric = await qaService.updateRubric(tenantId, id, req.body);
      res.json({ success: true, data: rubric });
    })
  );

  // DELETE /qa/rubrics/:id — Delete rubric
  router.delete(
    '/rubrics/:id',
    gate,
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantScope(req);
      const { id } = req.params;
      await qaService.deleteRubric(tenantId, id);
      res.json({ success: true, message: 'Rubric deleted' });
    })
  );

  router.get(
    '/quality-scores',
    gate,
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantScope(req);
      const limit = parseInt(req.query.limit as string) || 50;
      res.json({ success: true, data: await listQualityScores(tenantId, limit) });
    })
  );

  router.post(
    '/score-call',
    gate,
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantScope(req);
      const { callId, callSid, transcript, hadAppointment, durationMs } = req.body || {};
      if (!transcript) {
        return res.status(400).json({ success: false, error: 'transcript required' });
      }
      const data = await scoreInboundCall({
        tenantId,
        callId,
        callSid,
        transcript,
        hadAppointment,
        durationMs,
      });
      res.json({ success: true, data });
    })
  );

  return router;
}

