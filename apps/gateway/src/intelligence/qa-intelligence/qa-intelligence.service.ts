import { voiceDb } from '../../services/voice/tenant-scope.js';

export async function getQaIntelligenceSummary(tenantId: string) {
  const r = await voiceDb.query(
    `SELECT
       COUNT(*)::int AS total,
       AVG(overall_score)::numeric AS avg_score,
       AVG(sentiment_score)::numeric AS avg_sentiment,
       COUNT(*) FILTER (WHERE escalation_detected)::int AS escalations,
       COUNT(*) FILTER (WHERE failure_class = 'negative_sentiment')::int AS negative
     FROM public.call_quality_scores
     WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '30 days'`,
    [tenantId]
  );
  const row = r.rows[0] || {};
  return {
    tenantId,
    scores30d: row.total || 0,
    avgOverallScore: Number(row.avg_score) || 0,
    avgSentiment: Number(row.avg_sentiment) || 0,
    escalationRate: row.total ? (row.escalations / row.total) : 0,
    negativeSentimentRate: row.total ? (row.negative / row.total) : 0,
    bookingEffectiveness:
      row.total && row.avg_score ? Math.min(100, Number(row.avg_score) * 0.85) : 0,
  };
}
