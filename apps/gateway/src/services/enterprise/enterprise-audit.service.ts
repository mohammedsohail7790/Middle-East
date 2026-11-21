import { randomUUID } from 'crypto';
import { voiceDb } from '../voice/tenant-scope.js';
import { logger } from '../logger.js';
import { getCorrelation } from '../observability/correlation-context.js';

export async function recordEnterpriseAuditEvent(args: {
  tenantId: string;
  eventType: string;
  actorId?: string;
  actorEmail?: string;
  resourceType?: string;
  resourceId?: string;
  payload?: Record<string, unknown>;
  ipAddress?: string;
}): Promise<void> {
  const corr = getCorrelation();
  try {
    await voiceDb.query(
      `INSERT INTO public.enterprise_audit_events
        (id, tenant_id, event_type, actor_id, actor_email, resource_type, resource_id,
         payload, correlation_id, causation_id, ip_address)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11)`,
      [
        randomUUID(),
        args.tenantId,
        args.eventType,
        args.actorId || null,
        args.actorEmail || null,
        args.resourceType || null,
        args.resourceId || null,
        JSON.stringify(args.payload || {}),
        corr.requestId || null,
        (corr as { causationId?: string }).causationId || null,
        args.ipAddress || null,
      ]
    );
  } catch (err) {
    // The change itself must still go through, but a lost audit event is reported, not hidden.
    logger.warn('ENTERPRISE_AUDIT_WRITE_FAILED', {
      tenantId: args.tenantId,
      eventType: args.eventType,
      error: String(err),
    });
  }
}
