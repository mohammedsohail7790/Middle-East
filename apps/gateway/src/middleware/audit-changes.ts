import type { Request, Response, NextFunction } from 'express';
import type { CallIqAuthenticatedRequest } from '../services/auth/tenant-context.js';
import { recordEnterpriseAuditEvent } from '../services/enterprise/enterprise-audit.service.js';

/**
 * Writes every successful change (POST, PUT, PATCH, DELETE) by a signed-in dashboard user to the audit log:
 * who did it, what kind of change, which record, when. One central place instead of an edit in every controller.
 *
 * Request bodies are never stored (they can hold personal data or keys): only the method, the path and the status.
 * Reads, failed requests, API keys, internal service calls and requests with no signed-in workspace are not recorded.
 * A failure to save an audit event never blocks the change; it is reported as a warning (see recordEnterpriseAuditEvent).
 */

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Noise (not a change to the business), or already recorded by its own route. */
const NOT_RECORDED = [
  '/support',
  '/dashboard-assistant',
  '/search',
  '/alerts',
  '/team/check-permission',
  '/team/sync-auth',
  '/compliance',
];

const ID_PATTERN = /^(?:\d+|[0-9a-f]{8}-[0-9a-f-]{20,}|[A-Za-z0-9_-]*\d[A-Za-z0-9_-]*)$/i;

function startsWithSegment(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

const ACTION_BY_METHOD: Record<string, string> = { POST: 'created', PUT: 'updated', PATCH: 'updated', DELETE: 'deleted' };

export function describeChange(method: string, path: string): { eventType: string; resourceType: string; resourceId?: string } {
  const clean = path.split('?')[0].replace(/\/+$/, '');
  const segments = clean.split('/').filter(Boolean);
  const area = (segments[0] || 'unknown').replace(/[^a-z0-9_-]/gi, '').toLowerCase().replace(/-/g, '_');
  const second = segments[1];
  const resourceId = second && ID_PATTERN.test(second) && second !== 'invite' ? second : undefined;
  const verb = method.toUpperCase();

  if (area === 'team') {
    if (verb === 'POST' && second === 'invite') return { eventType: 'team_member_invited', resourceType: 'team_member' };
    if (verb === 'POST') return { eventType: 'team_member_added', resourceType: 'team_member' };
    if (verb === 'DELETE') return { eventType: 'team_member_removed', resourceType: 'team_member', resourceId };
    return { eventType: 'team_member_updated', resourceType: 'team_member', resourceId };
  }
  if (area === 'api_keys') {
    if (verb === 'POST') return { eventType: 'api_key_created', resourceType: 'api_key' };
    if (verb === 'DELETE') return { eventType: 'api_key_revoked', resourceType: 'api_key', resourceId };
    return { eventType: 'api_key_updated', resourceType: 'api_key', resourceId };
  }
  if (area === 'ai_config') return { eventType: 'ai_config_updated', resourceType: 'ai_config' };
  if (area === 'billing') return { eventType: 'billing_changed', resourceType: 'billing' };
  if (area === 'phone_numbers') return { eventType: 'phone_number_changed', resourceType: 'phone_number', resourceId };
  return { eventType: `${area}_${ACTION_BY_METHOD[verb] ?? 'changed'}`, resourceType: area, resourceId };
}

function relativePath(req: Request): string {
  return (req.originalUrl?.split('?')[0] || req.path || '').replace(/^\/api\/v1/, '');
}

export function auditChangesMiddleware(req: Request, res: Response, next: NextFunction): void {
  const method = (req.method || 'GET').toUpperCase();
  if (WRITE_METHODS.has(method)) {
    res.on('finish', () => {
      try {
        const status = res.statusCode;
        if (status < 200 || status >= 300) return;
        const tenant = (req as CallIqAuthenticatedRequest).tenant;
        if (!tenant || (tenant.source !== 'user_jwt' && tenant.source !== 'legacy_jwt') || !tenant.userId) return;
        const path = relativePath(req);
        if (NOT_RECORDED.some((p) => startsWithSegment(path, p))) return;
        const change = describeChange(method, path);
        void recordEnterpriseAuditEvent({
          tenantId: tenant.id,
          actorId: tenant.userId,
          eventType: change.eventType,
          resourceType: change.resourceType,
          resourceId: change.resourceId,
          payload: { method, path, status },
          ipAddress: req.ip,
        });
      } catch {
        // an audit problem must never affect the request that already finished
      }
    });
  }
  next();
}
