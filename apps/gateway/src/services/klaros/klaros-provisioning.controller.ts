import express from 'express';
import { logger } from '../logger.js';
import {
  KlarosProvisioningError,
  bearerFrom,
  provisionKlarosBusiness,
  provisioningEnabled,
  secretMatches,
  validateProvisionInput,
} from './klaros-provisioning.service.js';

/** Small in-process limiter: provisioning is a rare, human-triggered action, so a handful per minute is plenty and brute force of the secret is pointless. */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;
let windowStart = Date.now();
let count = 0;
function overLimit(): boolean {
  const now = Date.now();
  if (now - windowStart > WINDOW_MS) {
    windowStart = now;
    count = 0;
  }
  count += 1;
  return count > MAX_PER_WINDOW;
}

/**
 * POST /api/v1/platform/klaros/provision — server-to-server, authenticated by the platform secret (NOT a tenant key or a user JWT), so it is listed as a
 * public route in api-auth-unless-public and authenticates itself here. The credentials in the answer are shown once and never logged.
 */
export function createKlarosProvisioningRouter(): express.Router {
  const router = express.Router();

  router.post('/provision', async (req, res) => {
    // Off unless configured: indistinguishable from a route that does not exist.
    if (!provisioningEnabled()) return void res.status(404).json({ success: false, error: 'Not found' });
    if (overLimit()) return void res.status(429).json({ success: false, error: 'Too many requests' });
    if (!secretMatches(bearerFrom(req.header('authorization')))) {
      return void res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    try {
      const out = await provisionKlarosBusiness(validateProvisionInput(req.body));
      res.setHeader('Cache-Control', 'no-store');
      return void res.status(out.status === 'created' ? 201 : 200).json({ success: true, data: out });
    } catch (err) {
      if (err instanceof KlarosProvisioningError) return void res.status(err.status).json({ success: false, error: err.message });
      logger.error('KLAROS_PROVISION_UNEXPECTED', { error: err instanceof Error ? err.name : 'error' });
      return void res.status(500).json({ success: false, error: 'The receptionist could not be created.' });
    }
  });

  return router;
}
