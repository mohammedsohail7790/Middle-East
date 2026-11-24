import { randomUUID } from 'crypto';
import { voiceDb } from '../voice/tenant-scope.js';
import { logger } from '../logger.js';
import { getCorrelation } from '../observability/correlation-context.js';

/** Email of the person behind an audit event: the workspace's team list first, then the sign-in account. Never throws. */
async function lookupActorEmail(tenantId: string, actorId: string): Promise<string | undefined> {
  try {
    const team = await voiceDb.query(
      `SELECT email FROM public.team_members WHERE tenant_id = $1 AND user_id = $2 AND email IS NOT NULL LIMIT 1`,
      [tenantId, actorId]
    );
    if (team.rows[0]?.email) return String(team.rows[0].email);
    const account = await voiceDb.query(`SELECT email FROM auth.users WHERE id = $1 LIMIT 1`, [actorId]);
    return account.rows[0]?.email ? String(account.rows[0].email) : undefined;
  } catch {
    return undefined;
  }
}

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
    const actorEmail = args.actorEmail || (args.actorId ? await lookupActorEmail(args.tenantId, args.actorId) : undefined);
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
        actorEmail || null,
        args.resourceType || null,
        args.resourceId || null,
        JSON.stringify(args.payload || {}),
        corr.requestId || null,
        (corr as { causationId?: string }).causationId || null,
        args.ipAddress || corr.ip || null,
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
