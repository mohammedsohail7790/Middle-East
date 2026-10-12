/**
 * mapMedicalTourismQualification: administrative completeness only. It must never read the generic sales evaluation, never reject a
 * patient, and never put model text into the reason.
 */
import { describe, it, expect } from 'vitest';
import { mapMedicalTourismQualification, mapEvaluationToQualification } from '../../../apps/gateway/src/services/realtime/qualification-mapper.js';

const ok = { missingFields: [] as string[], needsHuman: false, personalDataConsent: true };

describe('mapMedicalTourismQualification', () => {
  it('complete + consent + nothing escalated => qualified (administrative)', () => {
    expect(mapMedicalTourismQualification(ok)).toMatchObject({ status: 'qualified', confidence: 1, missingFields: [] });
    expect(mapMedicalTourismQualification(ok).reason).toMatch(/Not a clinical or eligibility assessment/);
  });

  it.each([
    ['missing fields', { ...ok, missingFields: ['service'] }, /required information missing: service/],
    ['no personal-data consent', { ...ok, personalDataConsent: false }, /consent to keep personal data is not recorded/],
    ['a person was needed', { ...ok, needsHuman: true }, /called for a person/],
  ])('%s => needs_human_review with that reason', (_n, ctx, re) => {
    const r = mapMedicalTourismQualification(ctx);
    expect(r.status).toBe('needs_human_review');
    expect(r.reason).toMatch(re);
  });

  it('several reasons are all reported', () => {
    const r = mapMedicalTourismQualification({ missingFields: ['name', 'phone'], needsHuman: true, personalDataConsent: false });
    expect(r.reason).toMatch(/consent.*missing: name, phone.*person/);
    expect(r.missingFields).toEqual(['name', 'phone']);
  });

  it('can never return not_qualified or unknown, whatever the inputs', () => {
    for (const missingFields of [[], ['a']]) for (const needsHuman of [true, false]) for (const personalDataConsent of [true, false]) {
      expect(['qualified', 'needs_human_review']).toContain(mapMedicalTourismQualification({ missingFields, needsHuman, personalDataConsent }).status);
    }
  });

  it('is not the generic mapping: the same inputs a failed sales evaluation would reject are qualified here', () => {
    const generic = mapEvaluationToQualification({ callSuccess: false, leadQuality: 'low', summary: 'x' }, { missingFields: [], escalated: false });
    expect(generic.status).toBe('not_qualified');
    expect(mapMedicalTourismQualification(ok).status).toBe('qualified');
  });
});
