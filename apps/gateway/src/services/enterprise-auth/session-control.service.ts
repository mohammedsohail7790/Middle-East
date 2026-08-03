import { randomUUID } from 'crypto';
import { voiceDb } from '../voice/tenant-scope.js';
import { recordEnterpriseAuditEvent } from '../enterprise/enterprise-audit.service.js';

export interface EnterpriseSessionRow {
  id: string;
  tenantId: string;
  userId: string;
  deviceId?: string;
  ipAddress?: string;
  lastSeenAt: string;
  revokedAt?: string;
}

export async function registerEnterpriseSession(args: {
  tenantId: string;
  userId: string;
  deviceId?: string;
  ipAddress?: string;
  userAgent?: string;
  mfaVerified?: boolean;
}): Promise<string> {
  const id = randomUUID();
  await voiceDb.query(
    `INSERT INTO public.enterprise_auth_sessions
      (id, tenant_id, user_id, device_id, ip_address, user_agent, mfa_verified, last_seen_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())`,
    [
      id,
      args.tenantId,
      args.userId,
      args.deviceId || null,
      args.ipAddress || null,
      args.userAgent || null,
      args.mfaVerified ?? false,
    ]
  );
  return id;
}

export async function listActiveSessions(
  tenantId: string,
  userId?: string
): Promise<EnterpriseSessionRow[]> {
  const r = await voiceDb.query(
    `SELECT id, tenant_id, user_id, device_id, ip_address, last_seen_at, revoked_at
     FROM public.enterprise_auth_sessions
     WHERE tenant_id = $1 AND revoked_at IS NULL
       AND ($2::uuid IS NULL OR user_id = $2)
     ORDER BY last_seen_at DESC LIMIT 50`,
    [tenantId, userId || null]
  );
  return r.rows.map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    deviceId: row.device_id,
    ipAddress: row.ip_address,
    lastSeenAt: row.last_seen_at,
    revokedAt: row.revoked_at,
  }));
}

export async function revokeSession(
  tenantId: string,
  sessionId: string,
  actorId?: string
): Promise<void> {
  await voiceDb.query(
    `UPDATE public.enterprise_auth_sessions SET revoked_at = NOW()
     WHERE id = $1 AND tenant_id = $2`,
    [sessionId, tenantId]
  );
  await recordEnterpriseAuditEvent({
    tenantId,
    eventType: 'session_revoked',
    actorId,
    resourceType: 'auth_session',
    resourceId: sessionId,
  });
}

export async function revokeAllUserSessions(
  tenantId: string,
  userId: string,
  actorId?: string
): Promise<number> {
  const r = await voiceDb.query(
    `UPDATE public.enterprise_auth_sessions SET revoked_at = NOW()
     WHERE tenant_id = $1 AND user_id = $2 AND revoked_at IS NULL`,
    [tenantId, userId]
  );
  await recordEnterpriseAuditEvent({
    tenantId,
    eventType: 'all_sessions_revoked',
    actorId,
    resourceType: 'user',
    resourceId: userId,
  });
  return r.rowCount || 0;
}
