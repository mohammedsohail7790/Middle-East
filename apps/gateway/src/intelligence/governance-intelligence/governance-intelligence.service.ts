import { aiGovernanceService } from '../../services/ai-governance/ai-governance.service.js';
import { listRecentAuditBuffer } from '../../services/ai-governance/execution-audit.js';

export function getGovernanceEffectiveness(tenantId?: string) {
  const m = aiGovernanceService.getMetricsSnapshot();
  const audit = listRecentAuditBuffer(tenantId, 50);
  const denyRate = m.executions + m.denials > 0 ? m.denials / (m.executions + m.denials) : 0;
  const guardrailRate =
    m.executions > 0 ? m.guardrailTriggers / m.executions : 0;

  return {
    tenantId: tenantId || null,
    effectivenessScore: Math.round((1 - denyRate * 0.5 - guardrailRate * 0.3) * 100),
    metrics: m,
    recentDecisions: audit.slice(0, 20),
    duplicatePreventionRate: m.duplicatePreventions / Math.max(1, m.executions),
  };
}
