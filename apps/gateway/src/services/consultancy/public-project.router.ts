import { Router } from 'express';

/**
 * The read-only project status page a client opens from a private signed link. Mounted at /api/v1/public/project and listed in the public allowlist (middleware/api-auth-unless-public.ts), so these routes carry no
 * login: every one of them must verify its signed link itself. This file is a placeholder that its feature replaces.
 */
export function createPublicProjectRouter(_deps?: { pool?: any }): Router {
  return Router();
}
