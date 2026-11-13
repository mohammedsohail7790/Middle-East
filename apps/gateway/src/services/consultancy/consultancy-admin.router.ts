import { Router } from 'express';
import { requireConsultancyAdmin } from './admin-access.js';
import { createLeadsRouter } from './consultancy-leads.router.js';
import { createProposalsRouter } from './consultancy-proposals.router.js';
import { createProjectsRouter } from './consultancy-projects.router.js';
import { createSupportRouter } from './consultancy-support.router.js';

/**
 * /api/v1/consultancy-admin: the team's side of the consultancy business. Everything under it needs a signed-in team member (see admin-access.ts).
 * GET /me tells the dashboard whether to show the team screens. Each feature owns one sub-router file and nothing else.
 */
export function createConsultancyAdminRouter(): Router {
  const router = Router();
  router.use(requireConsultancyAdmin());
  router.get('/me', (_req, res) => {
    res.json({ success: true, data: { admin: true } });
  });
  router.use('/leads', createLeadsRouter());
  router.use('/proposals', createProposalsRouter());
  router.use('/projects', createProjectsRouter());
  router.use('/support', createSupportRouter());
  return router;
}
