import type { RiskLevel, RiskTolerance } from './ai-runtime-config.js';
import type { ToolExecutionPolicy } from './tool-policy-engine.js';

export interface RiskAssessment {
  riskLevel: RiskLevel;
  operationalConfidence: number;
  replaySafe: boolean;
  sideEffectClass: 'read' | 'write' | 'external' | 'critical';
  requiresEscalation: boolean;
}

const SIDE_EFFECT: Record<string, RiskAssessment['sideEffectClass']> = {
  search_knowledge_base: 'read',
  lookup_customer: 'read',
  check_availability: 'read',
  create_lead: 'write',
  create_appointment: 'write',
  schedule_appointment: 'write',
  reschedule_appointment: 'write',
  cancel_appointment: 'write',
  send_sms: 'external',
  transfer_call: 'critical',
  update_customer: 'write',
};

export function assessExecutionRisk(
  policy: ToolExecutionPolicy,
  tolerance: RiskTolerance
): RiskAssessment {
  const sideEffectClass = SIDE_EFFECT[policy.toolName] || 'external';
  const replaySafe = sideEffectClass === 'read';
  let operationalConfidence = 0.9;
  if (policy.riskLevel === 'critical') operationalConfidence = 0.55;
  if (policy.riskLevel === 'high') operationalConfidence = 0.7;

  const requiresEscalation =
    policy.riskLevel === 'critical' ||
    (tolerance === 'strict' && policy.riskLevel === 'high');

  return {
    riskLevel: policy.riskLevel,
    operationalConfidence,
    replaySafe,
    sideEffectClass,
    requiresEscalation,
  };
}
