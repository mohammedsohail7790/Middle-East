import { voiceDb } from '../voice/tenant-scope.js';
import { logger } from '../logger.js';

export type EnterpriseRole =
  | 'owner'
  | 'admin'
  | 'manager'
  | 'operator'
  | 'analyst'
  | 'readonly';

const ROLE_RANK: Record<EnterpriseRole, number> = {
  owner: 100,
  admin: 80,
  manager: 60,
  operator: 40,
  analyst: 30,
  readonly: 10,
};

export type Permission =
  | 'ops:read'
  | 'ops:write'
  | 'governance:read'
  | 'governance:write'
  | 'audit:read'
  | 'billing:read'
  | 'billing:write'
  | 'integrations:write'
  | 'ai_policy:write';

const ROLE_PERMISSIONS: Record<EnterpriseRole, Permission[]> = {
  owner: [
    'ops:read',
    'ops:write',
    'governance:read',
    'governance:write',
    'audit:read',
    'billing:read',
    'billing:write',
    'integrations:write',
    'ai_policy:write',
  ],
  admin: [
    'ops:read',
    'ops:write',
    'governance:read',
    'governance:write',
    'audit:read',
    'billing:read',
    'integrations:write',
    'ai_policy:write',
  ],
  manager: ['ops:read', 'governance:read', 'audit:read', 'billing:read'],
  operator: ['ops:read', 'governance:read', 'audit:read'],
  analyst: ['ops:read', 'audit:read'],
  readonly: ['ops:read'],
};

export async function resolveUserRole(
  tenantId: string,
  userId?: string
): Promise<EnterpriseRole> {
  // No authenticated user — fail closed to the lowest-privilege role, not 'operator'.
  if (!userId) {
    return 'readonly';
  }
  // RBAC is ON by default. Set CALLIQ_ENTERPRISE_RBAC=false to disable (dev/test only).
  if (process.env.CALLIQ_ENTERPRISE_RBAC === 'false') {
    return 'operator';
  }
  try {
    // org_members is the intended multi-tenant RBAC table, checked first so it
    // takes precedence if it is ever populated. It is currently never written
    // by any signup/invite flow, so this will normally miss.
    const [orgRow, ownerRow, teamRow] = await Promise.all([
      voiceDb.query(
        `SELECT role FROM public.org_members
         WHERE tenant_id = $1 AND user_id = $2 AND status = 'active' LIMIT 1`,
        [tenantId, userId]
      ),
      // voice_tenants.owner_user_id is set at tenant creation and is the only
      // ownership record for the account creator (org_members/team_members are
      // only populated via the team-invite-accept flow, never for the creator).
      voiceDb.query(
        `SELECT 1 FROM public.voice_tenants WHERE id = $1 AND owner_user_id = $2 LIMIT 1`,
        [tenantId, userId]
      ),
      // team_members IS populated for invited members via team-invite.service.ts.
      voiceDb.query(
        `SELECT role FROM public.team_members
         WHERE tenant_id = $1 AND user_id = $2 AND is_active = true LIMIT 1`,
        [tenantId, userId]
      ),
    ]);

    const orgRole = orgRow.rows[0]?.role as EnterpriseRole | undefined;
    if (orgRole && ROLE_RANK[orgRole]) return orgRole;

    if (ownerRow.rows.length > 0) return 'owner';

    const mapped = mapTeamRoleToEnterpriseRole(teamRow.rows[0]?.role as string | undefined);
    if (mapped) return mapped;

    return 'readonly';
  } catch (err) {
    // Fail closed: a DB error must never silently grant elevated access.
    logger.warn('RBAC_ROLE_LOOKUP_FAILED', { tenantId, userId, error: String(err) });
    return 'readonly';
  }
}

function mapTeamRoleToEnterpriseRole(role?: string): EnterpriseRole | null {
  switch (role) {
    case 'owner':
      return 'owner';
    case 'admin':
      return 'admin';
    case 'agent':
      return 'operator';
    case 'viewer':
      return 'readonly';
    default:
      return null;
  }
}

export function hasPermission(role: EnterpriseRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function requirePermission(
  role: EnterpriseRole,
  permission: Permission
): { ok: boolean; reason?: string } {
  // RBAC is ON by default. Set CALLIQ_ENTERPRISE_RBAC=false to disable (dev/test only).
  if (process.env.CALLIQ_ENTERPRISE_RBAC === 'false') return { ok: true };
  if (hasPermission(role, permission)) return { ok: true };
  logger.warn('RBAC_DENY', { role, permission });
  return { ok: false, reason: `Role ${role} lacks ${permission}` };
}
