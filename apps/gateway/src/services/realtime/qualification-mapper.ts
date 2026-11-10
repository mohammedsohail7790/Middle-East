/**
 * Maps Halla's EXISTING post-call AI evaluation (ai.service.ts#evaluateCall,
 * already run on every completed call and persisted via qa.service.ts) onto
 * the structured qualification contract Klaros expects. Deliberately does
 * not introduce a new LLM tool or touch the live realtime tool schema —
 * every input here is a real signal the current pipeline already produces:
 *
 *   - callSuccess / leadQuality / summary  -> ai.service.ts evaluateCall()
 *   - missingFields                        -> diff of ai_agent_configs.requiredFields
 *                                              against the lead fields the
 *                                              post-call flow already resolved
 *   - escalated                            -> session.callOutcome === 'transferred'
 *                                              (the existing transfer_call tool)
 *
 * No value here is invented when the conversation did not establish it.
 */

export type QualificationStatus = 'qualified' | 'not_qualified' | 'needs_human_review' | 'unknown';

export interface CallEvaluationLike {
  callSuccess: boolean;
  leadQuality: 'high' | 'medium' | 'low';
  summary: string;
  /** Set when the evaluation did not actually run — its other fields are placeholders. */
  degraded?: boolean;
}

export interface QualificationResult {
  status: QualificationStatus;
  confidence: number;
  reason: string;
  missingFields: string[];
}

const QUALITY_CONFIDENCE: Record<CallEvaluationLike['leadQuality'], number> = {
  high: 0.9,
  medium: 0.6,
  low: 0.3,
};

/** Fields the lead actually has, keyed the same way as ai_agent_configs.requiredFields entries. */
export function computeMissingFields(
  requiredFields: string[],
  resolved: { name?: string; phone?: string; service?: string; email?: string }
): string[] {
  const have: Record<string, boolean> = {
    name: Boolean(resolved.name?.trim()),
    phone: Boolean(resolved.phone?.trim()),
    service: Boolean(resolved.service?.trim()),
    email: Boolean(resolved.email?.trim()),
  };
  return requiredFields.filter((field) => have[field] === false);
}

/**
 * Medical Tourism qualification (tenants that opted in to consent capture). It is ADMINISTRATIVE COMPLETENESS ONLY: it says whether the
 * enquiry has what a human coordinator needs to take it forward. It is never a clinical, eligibility or suitability judgement, and it
 * deliberately ignores the generic sales-style AI evaluation (callSuccess / leadQuality), which was built for lead scoring.
 *
 *  - `qualified`          = every required field is present AND consent to keep personal data is recorded AND nothing about the call
 *                           called for a person (no transfer, call-back request, emergency or unsafe-statement flag).
 *  - `needs_human_review` = anything else.
 *  - It never returns `not_qualified`: nothing in an intake call can reject a patient.
 * The reason is a fixed sentence: no model summary, so nothing the caller said about their health leaves Halla through this field.
 */
export function mapMedicalTourismQualification(context: {
  missingFields: string[];
  needsHuman: boolean;
  personalDataConsent: boolean;
}): QualificationResult {
  const reasons: string[] = [];
  if (!context.personalDataConsent) reasons.push('consent to keep personal data is not recorded');
  if (context.missingFields.length > 0) reasons.push(`required information missing: ${context.missingFields.join(', ')}`);
  if (context.needsHuman) reasons.push('the call called for a person (transfer, call-back, emergency or safety flag)');
  if (reasons.length > 0) {
    return { status: 'needs_human_review', confidence: 1, reason: `Needs human review: ${reasons.join('; ')}.`, missingFields: context.missingFields };
  }
  return {
    status: 'qualified',
    confidence: 1,
    reason: 'Administrative completeness only: required contact and enquiry fields are present and consent is recorded. Not a clinical or eligibility assessment.',
    missingFields: [],
  };
}

export function mapEvaluationToQualification(
  evaluation: CallEvaluationLike,
  context: { missingFields: string[]; escalated: boolean }
): QualificationResult {
  if (context.escalated) {
    return {
      status: 'needs_human_review',
      confidence: evaluation.degraded ? 0 : QUALITY_CONFIDENCE[evaluation.leadQuality],
      reason: evaluation.degraded
        ? 'Call was escalated to a human'
        : `Call was escalated to a human — ${evaluation.summary}`.trim(),
      missingFields: context.missingFields,
    };
  }

  if (evaluation.degraded) {
    // The AI evaluation did not run: never turn its placeholder fields into a judgement.
    return {
      status: 'unknown',
      confidence: 0,
      reason: 'Qualification could not be determined (evaluation unavailable)',
      missingFields: context.missingFields,
    };
  }

  if (!evaluation.callSuccess) {
    return {
      status: 'not_qualified',
      confidence: QUALITY_CONFIDENCE[evaluation.leadQuality],
      reason: evaluation.summary,
      missingFields: context.missingFields,
    };
  }

  if (context.missingFields.length > 0) {
    return {
      status: 'needs_human_review',
      confidence: QUALITY_CONFIDENCE[evaluation.leadQuality],
      reason: `Required information still missing: ${context.missingFields.join(', ')}`,
      missingFields: context.missingFields,
    };
  }

  return {
    status: 'qualified',
    confidence: QUALITY_CONFIDENCE[evaluation.leadQuality],
    reason: evaluation.summary,
    missingFields: [],
  };
}
