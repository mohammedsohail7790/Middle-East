import { buildRuntimeReliabilityReport } from '../../services/runtime-reliability/reliability-intelligence.service.js';
import { generateOperationalRecommendations } from '../../intelligence/operational-recommendations/recommendations.service.js';
import { recordEnterpriseAuditEvent } from '../../services/enterprise/enterprise-audit.service.js';

export async function buildRemediationPlan(
  tenantId: string,
  actorId?: string,
  approved = false
) {
  const [reliability, recommendations] = await Promise.all([
    buildRuntimeReliabilityReport(tenantId),
    generateOperationalRecommendations(tenantId),
  ]);

  const avgConfidence =
    recommendations.length > 0
      ? recommendations.reduce((s, r) => s + r.confidence, 0) / recommendations.length
      : 0.85;

  const plan = {
    tenantId,
    confidenceScore: Math.round(avgConfidence * 100) / 100,
    operatorApproved: approved,
    requiresApproval: !approved && avgConfidence < 0.75,
    steps: [
      ...reliability.recommendations.map((r, i) => ({
        order: i + 1,
        type: 'runtime',
        action: r,
        automated: false,
        confidence: 0.7,
      })),
      ...recommendations
        .filter((r) => r.priority === 'high')
        .map((r, i) => ({
          order: reliability.recommendations.length + i + 1,
          type: r.domain,
          action: r.detail,
          hint: r.remediationHint,
          automated: false,
          confidence: r.confidence,
        })),
    ],
    operatorOverrideRequired: true,
  };

  await recordEnterpriseAuditEvent({
    tenantId,
    eventType: 'remediation_plan_created',
    actorId,
    payload: { stepCount: plan.steps.length },
  });

  return plan;
}
