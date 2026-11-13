import { Router } from 'express';

/**
 * The proposal page a client opens from a private signed link, plus accepting or declining it. Mounted at /api/v1/public/proposal and listed in the public allowlist (middleware/api-auth-unless-public.ts), so these routes carry no
 * login: every one of them must verify its signed link itself. This file is a placeholder that its feature replaces.
 */
export function createPublicProposalRouter(_deps?: { pool?: any }): Router {
  return Router();
}
