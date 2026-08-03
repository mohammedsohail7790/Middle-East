import { voiceDb } from '../voice/tenant-scope.js';
import { recordEnterpriseAuditEvent } from '../enterprise/enterprise-audit.service.js';

export interface OrgAuthPolicy {
  tenantId: string;
  mfaRequired: boolean;
  ssoRequired: boolean;
  ipAllowlist: string[];
  sessionMaxAgeHours: number;
  suspiciousLoginAlert: boolean;
}

const defaults = (): OrgAuthPolicy => ({
  tenantId: '',
  mfaRequired: false,
  ssoRequired: false,
  ipAllowlist: [],
  sessionMaxAgeHours: 168,
  suspiciousLoginAlert: true,
});

export async function getOrgAuthPolicy(tenantId: string): Promise<OrgAuthPolicy> {
  try {
    const r = await voiceDb.query(
      `SELECT tenant_id, mfa_required, sso_required, ip_allowlist,
              session_max_age_hours, suspicious_login_alert
       FROM public.org_auth_policies WHERE tenant_id = $1`,
      [tenantId]
    );
    const row = r.rows[0];
    if (!row) return { ...defaults(), tenantId };
    const list = Array.isArray(row.ip_allowlist)
      ? row.ip_allowlist
      : JSON.parse(row.ip_allowlist || '[]');
    return {
      tenantId,
      mfaRequired: !!row.mfa_required,
      ssoRequired: !!row.sso_required,
      ipAllowlist: list.map(String),
      sessionMaxAgeHours: Number(row.session_max_age_hours) || 168,
      suspiciousLoginAlert: row.suspicious_login_alert !== false,
    };
  } catch {
    return { ...defaults(), tenantId };
  }
}

export async function upsertOrgAuthPolicy(
  tenantId: string,
  patch: Partial<OrgAuthPolicy>,
  actorId?: string
): Promise<OrgAuthPolicy> {
  const current = await getOrgAuthPolicy(tenantId);
  const next = { ...current, ...patch, tenantId };
  await voiceDb.query(
    `INSERT INTO public.org_auth_policies
      (tenant_id, mfa_required, sso_required, ip_allowlist, session_max_age_hours, suspicious_login_alert, updated_at)
     VALUES ($1,$2,$3,$4::jsonb,$5,$6,NOW())
     ON CONFLICT (tenant_id) DO UPDATE SET
       mfa_required = EXCLUDED.mfa_required,
       sso_required = EXCLUDED.sso_required,
       ip_allowlist = EXCLUDED.ip_allowlist,
       session_max_age_hours = EXCLUDED.session_max_age_hours,
       suspicious_login_alert = EXCLUDED.suspicious_login_alert,
       updated_at = NOW()`,
    [
      tenantId,
      next.mfaRequired,
      next.ssoRequired,
      JSON.stringify(next.ipAllowlist),
      next.sessionMaxAgeHours,
      next.suspiciousLoginAlert,
    ]
  );
  await recordEnterpriseAuditEvent({
    tenantId,
    eventType: 'org_auth_policy_updated',
    actorId,
    resourceType: 'org_auth_policy',
    resourceId: tenantId,
    payload: next as unknown as Record<string, unknown>,
  });
  return next;
}

export function isIpAllowed(policy: OrgAuthPolicy, ip?: string): boolean {
  if (!policy.ipAllowlist.length || !ip) return true;
  return policy.ipAllowlist.some((c) => ip === c || ip.startsWith(c.replace('*', '')));
}
