import { voiceDb } from './tenant-scope.js';

export interface ResolvedOutboundCaller {
  fromNumber: string;
  agentId: string | null;
  phoneNumberId: string | null;
}

function normalizePhone(value: string): string {
  return value.replace(/[^\d+]/g, '');
}

/**
 * Resolve and validate the outbound caller ID for a tenant.
 * Never returns a number owned by another tenant.
 */
export async function resolveOutboundCallerId(
  tenantId: string,
  opts?: { fromNumber?: string; phoneNumberId?: string }
): Promise<ResolvedOutboundCaller | null> {
  const requestedId = opts?.phoneNumberId?.trim();
  const requestedNumber = opts?.fromNumber?.trim();

  if (requestedId) {
    const row = await voiceDb.query(
      `SELECT id, phone_number, ai_agent_id
       FROM public.tenant_phone_numbers
       WHERE id = $1 AND tenant_id = $2 AND status = 'active'
       LIMIT 1`,
      [requestedId, tenantId]
    );
    if (row.rows.length === 0) return null;
    return {
      fromNumber: row.rows[0].phone_number,
      agentId: row.rows[0].ai_agent_id ?? null,
      phoneNumberId: row.rows[0].id,
    };
  }

  if (requestedNumber) {
    const normalized = normalizePhone(requestedNumber);
    const row = await voiceDb.query(
      `SELECT id, phone_number, ai_agent_id
       FROM public.tenant_phone_numbers
       WHERE tenant_id = $1 AND status = 'active'
         AND regexp_replace(phone_number, '[^0-9+]', '', 'g') = $2
       LIMIT 1`,
      [tenantId, normalized]
    );
    if (row.rows.length > 0) {
      return {
        fromNumber: row.rows[0].phone_number,
        agentId: row.rows[0].ai_agent_id ?? null,
        phoneNumberId: row.rows[0].id,
      };
    }
    const tenantRow = await voiceDb.query(
      `SELECT phone_number, ai_agent_id FROM public.voice_tenants WHERE id = $1`,
      [tenantId]
    );
    const primary = tenantRow.rows[0]?.phone_number;
    if (primary && normalizePhone(primary) === normalized) {
      return {
        fromNumber: primary,
        agentId: tenantRow.rows[0]?.ai_agent_id ?? null,
        phoneNumberId: null,
      };
    }
    return null;
  }

  const provisioned = await voiceDb.query(
    `SELECT id, phone_number, ai_agent_id
     FROM public.tenant_phone_numbers
     WHERE tenant_id = $1 AND status = 'active'
     ORDER BY purchased_at ASC NULLS LAST, created_at ASC
     LIMIT 1`,
    [tenantId]
  );
  if (provisioned.rows.length > 0) {
    return {
      fromNumber: provisioned.rows[0].phone_number,
      agentId: provisioned.rows[0].ai_agent_id ?? null,
      phoneNumberId: provisioned.rows[0].id,
    };
  }

  const tenantRow = await voiceDb.query(
    `SELECT phone_number, ai_agent_id FROM public.voice_tenants WHERE id = $1`,
    [tenantId]
  );
  const fromNumber = tenantRow.rows[0]?.phone_number;
  if (!fromNumber) return null;
  return {
    fromNumber,
    agentId: tenantRow.rows[0]?.ai_agent_id ?? null,
    phoneNumberId: null,
  };
}
