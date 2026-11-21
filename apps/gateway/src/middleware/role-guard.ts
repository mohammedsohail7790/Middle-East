import type { Request, Response, NextFunction } from 'express';
import type { CallIqAuthenticatedRequest } from '../services/auth/tenant-context.js';
import { recordEnterpriseAuditEvent } from '../services/enterprise/enterprise-audit.service.js';
import {
  requirePermission,
  resolveUserRole,
  type EnterpriseRole,
  type Permission,
} from '../services/enterprise/rbac.service.js';

/**
 * One central role check for every change request (POST, PUT, PATCH, DELETE) from a signed-in dashboard user.
 * Reads are never blocked here. The role comes from the server (team membership), never from a request header.
 *
 *   Viewer (readonly, analyst)  look only
 *   Agent (operator), manager   everyday work: leads, calls, appointments, knowledge base, messages
 *   Admin                       everything except billing changes
 *   Owner                       everything
 *
 * API keys (they carry their own scopes), internal service calls and public routes (no signed-in workspace) are not touched.
 * Individual routes that already check a stricter permission keep doing so.
 */

type Rule = { prefix: string; permission: Permission | null };

/** First match wins, so a longer prefix goes before a shorter one. null = open to every signed-in role. */
const RULES: Rule[] = [
  // open to every role
  { prefix: '/support', permission: null },
  { prefix: '/dashboard-assistant', permission: null },
  { prefix: '/search', permission: null },
  { prefix: '/alerts', permission: null },
  // a POST that only asks "may I do this?" and an invited person linking their sign-in: neither changes anything
  { prefix: '/team/check-permission', permission: null },
  { prefix: '/team/sync-auth', permission: null },
  // WhatsApp: using the inbox is everyday work, connecting or changing the account is a setting
  { prefix: '/channels/whatsapp/conversations', permission: 'work:write' },
  { prefix: '/channels/whatsapp', permission: 'ops:write' },
  { prefix: '/channels', permission: 'ops:write' },
  // billing changes: owner only
  { prefix: '/billing', permission: 'billing:write' },
  // settings: owner and admin
  { prefix: '/ai-config', permission: 'ops:write' },
  { prefix: '/integrations', permission: 'ops:write' },
  { prefix: '/phone-numbers', permission: 'ops:write' },
  { prefix: '/api-keys', permission: 'ops:write' },
  { prefix: '/webhooks', permission: 'ops:write' },
  { prefix: '/sso', permission: 'ops:write' },
  { prefix: '/ip-allowlist', permission: 'ops:write' },
  { prefix: '/retention', permission: 'ops:write' },
  { prefix: '/compliance', permission: 'ops:write' },
  { prefix: '/business-hours', permission: 'ops:write' },
  { prefix: '/automations', permission: 'ops:write' },
  { prefix: '/automation', permission: 'ops:write' },
  { prefix: '/voice-cloning', permission: 'ops:write' },
  { prefix: '/spam', permission: 'ops:write' },
  { prefix: '/tenants', permission: 'ops:write' },
  { prefix: '/organizations', permission: 'ops:write' },
  { prefix: '/msp', permission: 'ops:write' },
  { prefix: '/feature-flags', permission: 'ops:write' },
  { prefix: '/slack', permission: 'ops:write' },
  { prefix: '/ivr', permission: 'ops:write' },
  { prefix: '/team', permission: 'ops:write' },
  { prefix: '/onboarding', permission: 'ops:write' },
  { prefix: '/calendar', permission: 'ops:write' },
  { prefix: '/recordings', permission: 'ops:write' },
  { prefix: '/runtime-reliability', permission: 'ops:write' },
  { prefix: '/operations', permission: 'ops:write' },
  { prefix: '/cost', permission: 'ops:write' },
  { prefix: '/billing-intelligence', permission: 'ops:write' },
  { prefix: '/consultancy-admin', permission: 'ops:write' },
  { prefix: '/platform', permission: 'ops:write' },
];

/** Anything not listed is everyday work (leads, calls, campaigns, appointments, knowledge, CRM, SMS, voice calls, reports...). */
const DEFAULT_PERMISSION: Permission = 'work:write';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function matches(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/** Which permission a change at this path needs. null means any signed-in role may do it. Path is relative to /api/v1. */
export function requiredPermissionForWrite(path: string): Permission | null {
  const clean = path.split('?')[0].replace(/\/+$/, '') || '/';
  for (const rule of RULES) {
    if (matches(clean, rule.prefix)) return rule.permission;
  }
  return DEFAULT_PERMISSION;
}

const ROLE_CACHE_MS = 30_000;
const roleCache = new Map<string, { role: EnterpriseRole; expires: number }>();

export function resetRoleCacheForTests(): void {
  roleCache.clear();
}

async function cachedRole(tenantId: string, userId: string): Promise<EnterpriseRole> {
  const key = `${tenantId}:${userId}`;
  const hit = roleCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.role;
  const role = await resolveUserRole(tenantId, userId);
  roleCache.set(key, { role, expires: Date.now() + ROLE_CACHE_MS });
  if (roleCache.size > 5000) roleCache.clear();
  return role;
}

function relativePath(req: Request): string {
  return (req.originalUrl?.split('?')[0] || req.path || '').replace(/^\/api\/v1/, '');
}

export async function roleGuardMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!WRITE_METHODS.has((req.method || 'GET').toUpperCase())) {
    next();
    return;
  }
  if (process.env.CALLIQ_ENTERPRISE_RBAC === 'false') {
    next();
    return;
  }
  const tenant = (req as CallIqAuthenticatedRequest).tenant;
  // No signed-in workspace (public routes, sign-up), API keys and internal services are outside this check.
  if (!tenant || (tenant.source !== 'user_jwt' && tenant.source !== 'legacy_jwt') || !tenant.userId) {
    next();
    return;
  }
  const needed = requiredPermissionForWrite(relativePath(req));
  if (needed === null) {
    next();
    return;
  }
  let role: EnterpriseRole;
  try {
    role = await cachedRole(tenant.id, tenant.userId);
  } catch {
    res.status(403).json({ success: false, error: 'Your role could not be checked, so this change was not made.' });
    return;
  }
  if (!requirePermission(role, needed).ok) {
    // A refused change is worth knowing about: who tried what, with which role. Never blocks the answer below.
    void recordEnterpriseAuditEvent({
      tenantId: tenant.id,
      actorId: tenant.userId,
      eventType: 'role_denied',
      resourceType: 'role_guard',
      payload: { method: (req.method || '').toUpperCase(), path: relativePath(req), role, needed },
    });
    res.status(403).json({
      success: false,
      error: `Your role (${role}) cannot make this change. Ask a workspace admin.`,
    });
    return;
  }
  next();
}
