import { voiceDb } from '../../services/voice/tenant-scope.js';

export async function getOperationalTrends(tenantId: string) {
  const calls = await voiceDb.query(
    `SELECT DATE(created_at) AS day, COUNT(*)::int AS c
     FROM public.calls WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '14 days'
     GROUP BY DATE(created_at) ORDER BY day`,
    [tenantId]
  );
  const quality = await voiceDb.query(
    `SELECT DATE(created_at) AS day, AVG(overall_score)::float AS score
     FROM public.call_quality_scores
     WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '14 days'
     GROUP BY DATE(created_at) ORDER BY day`,
    [tenantId]
  );

  const callTrend = calls.rows.map((r) => ({ day: String(r.day).slice(0, 10), calls: r.c }));
  const qaTrend = quality.rows.map((r) => ({
    day: String(r.day).slice(0, 10),
    avgScore: Math.round(Number(r.score) * 10) / 10,
  }));

  const callSlope =
    callTrend.length >= 2
      ? callTrend[callTrend.length - 1].calls - callTrend[0].calls
      : 0;

  return {
    tenantId,
    callVolumeTrend: callSlope >= 0 ? 'up' : 'down',
    callTrend,
    qaTrend,
    incidentPattern: callSlope > 10 ? 'volume_spike' : 'stable',
  };
}
