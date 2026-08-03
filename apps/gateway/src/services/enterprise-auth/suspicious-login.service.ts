import { voiceDb } from '../voice/tenant-scope.js';
import { recordEnterpriseAuditEvent } from '../enterprise/enterprise-audit.service.js';
import { getOrgAuthPolicy } from './org-auth-policy.js';

export async function recordLoginAttempt(args: {
  tenantId: string;
  userId: string;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
}): Promise<{ suspicious: boolean; reason?: string }> {
  const policy = await getOrgAuthPolicy(args.tenantId);
  if (!policy.suspiciousLoginAlert) return { suspicious: false };

  let suspicious = false;
  let reason: string | undefined;

  if (!args.success) {
    const fails = await voiceDb.query(
      `SELECT COUNT(*)::int AS c FROM public.enterprise_auth_sessions
       WHERE tenant_id = $1 AND user_id = $2 AND created_at > NOW() - INTERVAL '15 minutes'`,
      [args.tenantId, args.userId]
    );
    if ((fails.rows[0]?.c || 0) > 5) {
      suspicious = true;
      reason = 'multiple_failed_attempts';
    }
  }

  if (args.ipAddress && policy.ipAllowlist.length > 0) {
    const allowed = policy.ipAllowlist.some(
      (c) => args.ipAddress === c || args.ipAddress!.startsWith(c.replace('*', ''))
    );
    if (!allowed) {
      suspicious = true;
      reason = 'ip_not_in_allowlist';
    }
  }

  if (suspicious) {
    await recordEnterpriseAuditEvent({
      tenantId: args.tenantId,
      eventType: 'suspicious_login_detected',
      actorId: args.userId,
      payload: { reason, ip: args.ipAddress, success: args.success },
    });
  }

  return { suspicious, reason };
}
