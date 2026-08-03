/**
 * Monthly SLA credit job — run via cron: node scripts/run-sla-credits.mjs [period] [uptimePercent]
 */
import { pool } from '../apps/gateway/src/services/db/pool.js';
import { applySlaCreditIfNeeded } from '../apps/gateway/src/services/enterprise/enterprise-accounts.service.js';

const period = process.argv[2] || new Date().toISOString().slice(0, 7);
const uptimeArg = process.argv[3];
const simulatedUptime = uptimeArg != null ? Number(uptimeArg) : null;

async function main() {
  const { rows } = await pool.query(
    `SELECT ea.tenant_id, ea.sla_tier
     FROM public.enterprise_accounts ea
     JOIN public.subscriptions s ON s.tenant_id = ea.tenant_id
     WHERE s.plan = 'enterprise' AND s.status IN ('active', 'trialing')`
  );

  if (rows.length === 0) {
    console.log('[sla-credits] No enterprise accounts');
    process.exit(0);
  }

  for (const row of rows) {
    const uptime =
      simulatedUptime != null && !Number.isNaN(simulatedUptime)
        ? simulatedUptime
        : 99.95;
    const result = await applySlaCreditIfNeeded(
      row.tenant_id,
      period,
      uptime,
      Number(row.sla_tier) || 99.9
    );
    console.log('[sla-credits]', row.tenant_id, result);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
