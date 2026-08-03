import { voiceDb } from '../../services/voice/tenant-scope.js';
import { aiGovernanceService } from '../../services/ai-governance/ai-governance.service.js';
import { buildOpsSnapshot } from '../../observability/enterprise/ops-snapshot.js';
export interface TenantOperationalScore {
  tenantId: string;
  bookingConversionPct: number;
  runtimeHealthScore: number;
  runtimeGrade: string;
  aiDenialRate: number;
  reconnectEstimate: number;
  overlapAnomalyRate: number;
  callsLast7d: number;
  appointmentsLast7d: number;
}

export async function getTenantOperationalScore(
  tenantId: string
): Promise<TenantOperationalScore> {
  const calls = await voiceDb.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE outcome IN ('completed','transferred'))::int AS answered
     FROM public.calls WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '7 days'`,
    [tenantId]
  );
  const appts = await voiceDb.query(
    `SELECT COUNT(*)::int AS c FROM public.appointments
     WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '7 days'`,
    [tenantId]
  );
  const total = calls.rows[0]?.total || 0;
  const ai = aiGovernanceService.getMetricsSnapshot();
  const totalAi = ai.executions + ai.denials || 1;
  const snap = await buildOpsSnapshot(tenantId);
  const health = (snap.health as { score: number; grade: string }) || {
    score: 80,
    grade: 'B',
  };

  return {
    tenantId,
    bookingConversionPct: total ? Math.round((appts.rows[0]?.c / total) * 1000) / 10 : 0,
    runtimeHealthScore: health.score,
    runtimeGrade: health.grade,
    aiDenialRate: Math.round((ai.denials / totalAi) * 1000) / 1000,
    reconnectEstimate: 0.05,
    overlapAnomalyRate: 0,
    callsLast7d: total,
    appointmentsLast7d: appts.rows[0]?.c || 0,
  };
}

export async function getGovernanceAnalytics(tenantId?: string) {
  const ai = aiGovernanceService.getMetricsSnapshot();
  return {
    executions: ai.executions,
    denials: ai.denials,
    guardrailTriggers: ai.guardrailTriggers,
    policyViolations: ai.policyViolations,
    duplicatePreventions: ai.duplicatePreventions,
    topTools: ai.topTools,
    tenantId: tenantId || null,
  };
}

export async function getPlatformAnalyticsSummary(tenantId: string) {
  try {
    const operational = await getTenantOperationalScore(tenantId);
    const governance = await getGovernanceAnalytics(tenantId);
    const events = await buildOpsSnapshot(tenantId);
    return { operational, governance, events };
  } catch {
    return {
      operational: {
        tenantId,
        bookingConversionPct: 0,
        runtimeHealthScore: 80,
        runtimeGrade: 'B',
        aiDenialRate: 0,
        reconnectEstimate: 0,
        overlapAnomalyRate: 0,
        callsLast7d: 0,
        appointmentsLast7d: 0,
      },
      governance: await getGovernanceAnalytics(tenantId),
      events: { enabled: false },
    };
  }
}
