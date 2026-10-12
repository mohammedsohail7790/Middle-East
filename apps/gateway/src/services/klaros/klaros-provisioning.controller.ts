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
import { handlePhoneRequest, validatePhoneRequest } from './klaros-phone.service.js';

/** Small in-process limiter: provisioning is a rare, human-triggered action, so a handful per minute is plenty and brute force of the secret is pointless. */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;
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

/** Off unless configured (indistinguishable from a route that does not exist), then rate limited, then the platform secret. Returns true when allowed. */
function authorize(req: express.Request, res: express.Response): boolean {
  if (!provisioningEnabled()) {
    res.status(404).json({ success: false, error: 'Not found' });
    return false;
  }
  if (overLimit()) {
    res.status(429).json({ success: false, error: 'Too many requests' });
    return false;
  }
  if (!secretMatches(bearerFrom(req.header('authorization')))) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return false;
  }
  return true;
}

function fail(res: express.Response, err: unknown, event: string): void {
  if (err instanceof KlarosProvisioningError) {
    res.status(err.status).json({ success: false, error: err.message, ...(err.code ? { code: err.code } : {}) });
    return;
  }
  logger.error(event, { error: err instanceof Error ? err.name : 'error' });
  res.status(500).json({ success: false, error: 'The request could not be completed.' });
}

/**
 * Server-to-server routes for Klaros, authenticated by the platform secret (NOT a tenant key or a user JWT), so each is listed as a public route in
 * api-auth-unless-public and authenticates itself here.
 *   POST /api/v1/platform/klaros/provision   create or re-issue a business's receptionist (credentials shown once, never logged)
 *   POST /api/v1/platform/klaros/phone       {action: status | search | buy | set_business_number}
 */
export function createKlarosProvisioningRouter(): express.Router {
  const router = express.Router();

  router.post('/provision', async (req, res) => {
    if (!authorize(req, res)) return;
    try {
      const out = await provisionKlarosBusiness(validateProvisionInput(req.body));
      res.setHeader('Cache-Control', 'no-store');
      res.status(out.status === 'created' ? 201 : 200).json({ success: true, data: out });
    } catch (err) {
      fail(res, err, 'KLAROS_PROVISION_UNEXPECTED');
    }
  });

  router.post('/phone', async (req, res) => {
    if (!authorize(req, res)) return;
    try {
      const out = await handlePhoneRequest(validatePhoneRequest(req.body));
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json({ success: true, data: out });
    } catch (err) {
      fail(res, err, 'KLAROS_PHONE_UNEXPECTED');
    }
  });

  return router;
}
