import type { Request, Response, NextFunction } from 'express';
import { requireTenant } from './require-tenant.js';
import { requireSupabaseUser } from '../services/auth/require-supabase-user.js';

/**
 * Enforce JWT (or internal key) on all /api/v1 routes except documented public endpoints.
 * Fixes routers that only checked x-tenant-id.
 */
function routePath(req: Request): string {
  return (req.originalUrl?.split('?')[0] || req.path || '').replace(/^\/api\/v1/, '');
}

/**
 * Exact public route allowlist. Was previously substring/prefix regexes
 * (e.g. "contains /webhook anywhere", "contains /callback anywhere") which
 * could accidentally make a future, unrelated, tenant-scoped route public
 * just by having "webhook" or "callback" in its path segment. Listing the
 * actual known public endpoints removes that collision risk.
 */
const PUBLIC_POST_ROUTES = new Set([
  '/voice/incoming-call',
  '/voice/stream-status',
  '/voice/recording-status',
  '/voice/test-outbound-twiml',
  '/voice/outbound-answer',
  '/voice/call-status',
  // Twilio webhook fired when a caller presses a digit at the compliance
  // consent gate — no Authorization header available; protected instead
  // by twilioWebhookGuard's signature check on the route itself.
  '/voice/consent-response',
  // Stripe webhook — authenticates via signature, not tenant JWT.
  '/billing/webhook',
  // OAuth callback that accepts POST as well as GET.
  '/integrations/copper/callback',
  // Clio-initiated deauthorization webhook — fire-and-forget notification,
  // same trust model as the other CRM OAuth callbacks above (no tenant JWT
  // available on an unsolicited vendor-initiated request).
  '/integrations/clio/deauthorize',
]);

const PUBLIC_GET_ROUTES = new Set([
  '/calendar/google/callback',
  '/calendar/outlook/callback',
  '/calendar/calendly/callback',
  '/calendar/acuity/callback',
  '/calendar/square-appointments/callback',
  '/integrations/hubspot/callback',
  '/integrations/slack/callback',
  '/integrations/servicetitan/callback',
  '/integrations/jobber/callback',
  '/integrations/pipedrive/callback',
  '/integrations/freshsales/callback',
  '/integrations/zoho/callback',
  '/integrations/copper/callback',
  '/integrations/clio/callback',
  '/billing/plans',
  '/billing/plan-definitions',
  '/billing/status',
  '/integrations/oauth-health',
]);

function isPublicApiRoute(req: Request): boolean {
  const path = routePath(req);
  const method = req.method || 'GET';

  if (method === 'POST' && PUBLIC_POST_ROUTES.has(path)) {
    return true;
  }

  if (method === 'GET' && PUBLIC_GET_ROUTES.has(path)) {
    return true;
  }

  if (method === 'POST' && (path === '/tenants' || path === '/tenants/')) {
    return false; // handled by requireSupabaseUser below
  }

  if (method === 'GET' && path.startsWith('/tenants/onboarding-status')) {
    return false;
  }

  return false;
}

export function apiAuthUnlessPublic(req: Request, res: Response, next: NextFunction): void {
  // Browsers send OPTIONS before cross-origin GET/POST with Authorization — must not 401
  if (req.method === 'OPTIONS') {
    next();
    return;
  }

  if (isPublicApiRoute(req)) {
    next();
    return;
  }

  const path = routePath(req);

  if (req.method === 'POST' && (path === '/tenants' || path === '/tenants/')) {
    void requireSupabaseUser(req, res, next);
    return;
  }

  // ORG-001 — create/list/get/patch before JWT carries tenant_id
  if (
    (req.method === 'POST' || req.method === 'GET') &&
    (path === '/organizations' || path === '/organizations/')
  ) {
    void requireSupabaseUser(req, res, next);
    return;
  }
  if (
    (req.method === 'GET' || req.method === 'PATCH') &&
    /^\/organizations\/[^/]+$/.test(path)
  ) {
    void requireSupabaseUser(req, res, next);
    return;
  }

  if (req.method === 'GET' && path.startsWith('/tenants/onboarding-status')) {
    void requireSupabaseUser(req, res, next);
    return;
  }

  if (req.method === 'POST' && path === '/onboarding/voice-preview') {
    void requireSupabaseUser(req, res, next);
    return;
  }

  // Invite accept: link user to inviter workspace before JWT has tenant_id
  if (req.method === 'POST' && path === '/team/sync-auth') {
    void requireSupabaseUser(req, res, next);
    return;
  }

  void requireTenant(req, res, next);
}
