import { describe, it, expect } from 'vitest';
import {
  computeMissingFields,
  mapEvaluationToQualification,
  type CallEvaluationLike,
} from '../../../apps/gateway/src/services/realtime/qualification-mapper.js';

describe('computeMissingFields', () => {
  it('returns no missing fields when everything required is present', () => {
    expect(
      computeMissingFields(['name', 'phone', 'service'], { name: 'Ada', phone: '+15551234567', service: 'Plumbing' })
    ).toEqual([]);
  });

  it('flags missing required fields', () => {
    expect(computeMissingFields(['name', 'phone', 'service'], { name: 'Ada', phone: '' })).toEqual([
      'phone',
      'service',
    ]);
  });

  it('treats whitespace-only values as missing', () => {
    expect(computeMissingFields(['name'], { name: '   ' })).toEqual(['name']);
  });

  it('ignores fields not in the required list', () => {
    expect(computeMissingFields(['name'], { name: 'Ada', phone: undefined })).toEqual([]);
  });
});

describe('mapEvaluationToQualification (real post-call evaluation -> Klaros contract)', () => {
  const highQualitySuccess: CallEvaluationLike = {
    callSuccess: true,
    leadQuality: 'high',
    summary: 'Caller booked a plumbing appointment for tomorrow.',
  };
  const lowQualityFailure: CallEvaluationLike = {
    callSuccess: false,
    leadQuality: 'low',
    summary: 'Caller hung up without providing contact details.',
  };

  it('maps a successful, complete evaluation to qualified', () => {
    const result = mapEvaluationToQualification(highQualitySuccess, { missingFields: [], escalated: false });
    expect(result.status).toBe('qualified');
    expect(result.confidence).toBe(0.9);
    expect(result.missingFields).toEqual([]);
    expect(result.reason).toBe(highQualitySuccess.summary);
  });

  it('maps a failed evaluation to not_qualified — never invents a qualified result', () => {
    const result = mapEvaluationToQualification(lowQualityFailure, { missingFields: [], escalated: false });
    expect(result.status).toBe('not_qualified');
    expect(result.confidence).toBe(0.3);
  });

  it('maps a successful evaluation with missing required fields to needs_human_review', () => {
    const result = mapEvaluationToQualification(highQualitySuccess, {
      missingFields: ['phone'],
      escalated: false,
    });
    expect(result.status).toBe('needs_human_review');
    expect(result.missingFields).toEqual(['phone']);
    expect(result.reason).toContain('phone');
  });

  it('maps an escalated call to needs_human_review regardless of evaluation outcome', () => {
    const result = mapEvaluationToQualification(highQualitySuccess, { missingFields: [], escalated: true });
    expect(result.status).toBe('needs_human_review');
    expect(result.reason).toContain('escalated');
  });

  it('escalation takes precedence over a failed evaluation', () => {
    const result = mapEvaluationToQualification(lowQualityFailure, { missingFields: [], escalated: true });
    expect(result.status).toBe('needs_human_review');
  });

  it('medium lead quality maps to medium confidence', () => {
    const result = mapEvaluationToQualification(
      { callSuccess: true, leadQuality: 'medium', summary: 'Partial info collected.' },
      { missingFields: [], escalated: false }
    );
    expect(result.confidence).toBe(0.6);
    expect(result.status).toBe('qualified');
  });

  it('a degraded (unavailable) evaluation is never turned into a judgement', () => {
    const degraded: CallEvaluationLike = {
      callSuccess: true, // placeholder produced by the fallback, not a real result
      leadQuality: 'low',
      summary: 'Evaluation unavailable.',
      degraded: true,
    };
    const result = mapEvaluationToQualification(degraded, { missingFields: [], escalated: false });
    expect(result.status).toBe('unknown');
    expect(result.confidence).toBe(0);
  });

  it('an escalation is still reported when the evaluation was unavailable, without placeholder confidence', () => {
    const degraded: CallEvaluationLike = { callSuccess: true, leadQuality: 'low', summary: 'Evaluation unavailable.', degraded: true };
    const result = mapEvaluationToQualification(degraded, { missingFields: [], escalated: true });
    expect(result.status).toBe('needs_human_review');
    expect(result.confidence).toBe(0);
    expect(result.reason).toBe('Call was escalated to a human');
  });
});
