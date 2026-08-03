import { pool } from '../db/pool.js';
import { logger } from '../logger.js';

export interface EnterpriseAccountView {
  csmName?: string;
  csmEmail?: string;
  csmPhone?: string;
  slaTier: number;
  slaSignedAt?: string;
  uptimeCreditBalanceCents: number;
  lastUptimePercent?: number;
  lastUptimePeriod?: string;
}

export async function getEnterpriseAccount(tenantId: string): Promise<EnterpriseAccountView | null> {
  const { rows } = await pool.query(
    `SELECT * FROM public.enterprise_accounts WHERE tenant_id = $1`,
    [tenantId]
  );
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    csmName: r.csm_name || undefined,
    csmEmail: r.csm_email || undefined,
    csmPhone: r.csm_phone || undefined,
    slaTier: Number(r.sla_tier) || 99.9,
    slaSignedAt: r.sla_signed_at || undefined,
    uptimeCreditBalanceCents: Number(r.uptime_credit_balance_cents) || 0,
    lastUptimePercent: r.last_uptime_percent != null ? Number(r.last_uptime_percent) : undefined,
    lastUptimePeriod: r.last_uptime_period || undefined,
  };
}

export async function upsertEnterpriseAccount(
  tenantId: string,
  input: Partial<EnterpriseAccountView>
): Promise<EnterpriseAccountView> {
  await pool.query(
    `INSERT INTO public.enterprise_accounts (tenant_id, csm_name, csm_email, csm_phone, sla_tier, sla_signed_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (tenant_id) DO UPDATE SET
       csm_name = COALESCE(EXCLUDED.csm_name, enterprise_accounts.csm_name),
       csm_email = COALESCE(EXCLUDED.csm_email, enterprise_accounts.csm_email),
       csm_phone = COALESCE(EXCLUDED.csm_phone, enterprise_accounts.csm_phone),
       sla_tier = COALESCE(EXCLUDED.sla_tier, enterprise_accounts.sla_tier),
       sla_signed_at = COALESCE(EXCLUDED.sla_signed_at, enterprise_accounts.sla_signed_at),
       updated_at = NOW()`,
    [
      tenantId,
      input.csmName || null,
      input.csmEmail || null,
      input.csmPhone || null,
      input.slaTier ?? 99.9,
      input.slaSignedAt || null,
    ]
  );
  return (await getEnterpriseAccount(tenantId))!;
}

/** Monthly SLA job: credit if uptime below tier. */
export async function applySlaCreditIfNeeded(
  tenantId: string,
  period: string,
  uptimePercent: number,
  slaTier = 99.9
): Promise<{ credited: boolean; creditCents: number }> {
  if (uptimePercent >= slaTier) {
    await pool.query(
      `UPDATE public.enterprise_accounts SET last_uptime_percent = $2, last_uptime_period = $3, updated_at = NOW()
       WHERE tenant_id = $1`,
      [tenantId, uptimePercent, period]
    );
    return { credited: false, creditCents: 0 };
  }

  const miss = slaTier - uptimePercent;
  const creditCents = Math.min(50000, Math.round(miss * 1000 * 100));
  await pool.query(
    `INSERT INTO public.enterprise_accounts (tenant_id, uptime_credit_balance_cents, last_uptime_percent, last_uptime_period, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (tenant_id) DO UPDATE SET
       uptime_credit_balance_cents = enterprise_accounts.uptime_credit_balance_cents + $2,
       last_uptime_percent = $3,
       last_uptime_period = $4,
       updated_at = NOW()`,
    [tenantId, creditCents, uptimePercent, period]
  );
  await pool.query(
    `INSERT INTO public.sla_credit_events (tenant_id, period, uptime_percent, credit_cents, note)
     VALUES ($1, $2, $3, $4, $5)`,
    [tenantId, period, uptimePercent, creditCents, `SLA credit: ${uptimePercent}% vs ${slaTier}% target`]
  );
  logger.info('SLA credit applied', { tenantId, period, uptimePercent, creditCents });
  return { credited: true, creditCents };
}

export async function listSlaCredits(tenantId: string, limit = 12) {
  const { rows } = await pool.query(
    `SELECT period, uptime_percent, credit_cents, note, created_at
     FROM public.sla_credit_events WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [tenantId, limit]
  );
  return rows;
}
