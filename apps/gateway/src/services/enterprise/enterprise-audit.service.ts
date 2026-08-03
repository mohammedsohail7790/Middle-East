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
}): Promise<void> {
  const corr = getCorrelation();
  try {
    await voiceDb.query(
      `INSERT INTO public.enterprise_audit_events
        (id, tenant_id, event_type, actor_id, actor_email, resource_type, resource_id,
         payload, correlation_id, causation_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)`,
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
      ]
    );
  } catch (err) {
    logger.debug('ENTERPRISE_AUDIT_WRITE_SKIP', {
      tenantId: args.tenantId,
      eventType: args.eventType,
      error: String(err),
    });
  }
}
