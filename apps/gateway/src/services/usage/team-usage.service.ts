/**
 * Team-only usage and cost estimate per client, worked out from the calls table (the cost table is never filled in).
 * Cost = minutes x phone rate + minutes x AI rate. Both are estimates; the AI rate is TEAM_USAGE_AI_USD_PER_MINUTE (default 0.10).
 */
export const PHONE_USD_PER_MINUTE = 0.014;
export const DEFAULT_AI_USD_PER_MINUTE = 0.1;

export function aiRatePerMinute(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.TEAM_USAGE_AI_USD_PER_MINUTE);
  return Number.isFinite(n) && n >= 0 && env.TEAM_USAGE_AI_USD_PER_MINUTE?.trim() ? n : DEFAULT_AI_USD_PER_MINUTE;
}

export function estimateCostUsd(minutes: number, aiRate = DEFAULT_AI_USD_PER_MINUTE): number {
  return Math.round(minutes * (PHONE_USD_PER_MINUTE + aiRate) * 100) / 100;
}

export interface UsageRow { tenantId: string; name: string; calls: number; minutes: number; estimatedCostUsd: number }
export interface UsagePeriod { days: number; rows: UsageRow[]; totals: { calls: number; minutes: number; estimatedCostUsd: number } }

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };

export async function loadUsage(db: Db, days: 7 | 30, aiRate: number): Promise<UsagePeriod> {
  const r = await db.query(
    `SELECT c.tenant_id, COALESCE(MAX(t.company_name), 'Unknown client') AS name,
            COUNT(*)::int AS calls, COALESCE(SUM(c.duration_ms), 0)::float8 / 60000 AS minutes
       FROM public.calls c LEFT JOIN public.voice_tenants t ON t.id = c.tenant_id
      WHERE c.created_at > NOW() - ($1::int * INTERVAL '1 day')
      GROUP BY c.tenant_id`,
    [days],
  );
  const rows: UsageRow[] = r.rows
    .map((x) => {
      const minutes = Math.round(Number(x.minutes) * 10) / 10;
      return { tenantId: String(x.tenant_id), name: String(x.name), calls: Number(x.calls), minutes, estimatedCostUsd: estimateCostUsd(Number(x.minutes), aiRate) };
    })
    .sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd);
  const totals = rows.reduce(
    (t, x) => ({ calls: t.calls + x.calls, minutes: Math.round((t.minutes + x.minutes) * 10) / 10, estimatedCostUsd: Math.round((t.estimatedCostUsd + x.estimatedCostUsd) * 100) / 100 }),
    { calls: 0, minutes: 0, estimatedCostUsd: 0 },
  );
  return { days, rows, totals };
}
