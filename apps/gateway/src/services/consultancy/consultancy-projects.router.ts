import { Router } from 'express';

/**
 * Team-side consultancy API: projects. Mounted at /api/v1/consultancy-admin/projects behind requireConsultancyAdmin (see consultancy-admin.router.ts),
 * so every route here is already limited to the team. This file is a placeholder that its feature replaces.
 */
export function createProjectsRouter(_deps?: { pool?: any }): Router {
  return Router();
}
