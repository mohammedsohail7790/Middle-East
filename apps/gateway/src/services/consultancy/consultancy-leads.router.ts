import { Router } from 'express';

/**
 * Team-side consultancy API: leads. Mounted at /api/v1/consultancy-admin/leads behind requireConsultancyAdmin (see consultancy-admin.router.ts),
 * so every route here is already limited to the team. This file is a placeholder that its feature replaces.
 */
export function createLeadsRouter(_deps?: { pool?: any }): Router {
  return Router();
}
