import { voiceDb } from '../voice/tenant-scope.js';
import { recordEnterpriseAuditEvent } from '../enterprise/enterprise-audit.service.js';

export interface ScimUser {
  externalId: string;
  email: string;
  active: boolean;
  role: string;
}

/** Minimal SCIM-style directory sync (inbound provisioning only). */
export async function upsertScimUser(tenantId: string, user: ScimUser): Promise<void> {
  await voiceDb.query(
    `INSERT INTO public.scim_directory_users (tenant_id, external_id, email, active, role, synced_at)
     VALUES ($1,$2,$3,$4,$5,NOW())
     ON CONFLICT (tenant_id, external_id) DO UPDATE SET
       email = EXCLUDED.email,
       active = EXCLUDED.active,
       role = EXCLUDED.role,
       synced_at = NOW()`,
    [tenantId, user.externalId, user.email, user.active, user.role]
  );
  await recordEnterpriseAuditEvent({
    tenantId,
    eventType: 'scim_user_upserted',
    resourceType: 'scim_user',
    resourceId: user.externalId,
    payload: { email: user.email, role: user.role, active: user.active },
  });
}

export async function listScimUsers(tenantId: string): Promise<ScimUser[]> {
  const r = await voiceDb.query(
    `SELECT external_id, email, active, role FROM public.scim_directory_users
     WHERE tenant_id = $1 ORDER BY synced_at DESC LIMIT 200`,
    [tenantId]
  );
  return r.rows.map((row) => ({
    externalId: row.external_id,
    email: row.email,
    active: row.active,
    role: row.role,
  }));
}
