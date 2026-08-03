import { describe, it, expect } from 'vitest';
import { getSamlOnboardingGuide } from '../../../apps/gateway/src/services/enterprise-auth/saml-onboarding.service.js';
import { computeAdaptiveReconnectGraceMs } from '../../../apps/gateway/src/services/runtime-reliability/adaptive-reconnect.js';
import { getAlertRules } from '../../../apps/gateway/src/observability/alerts/alert-engine.js';

describe('final enterprise maturity', () => {
  it('provides SAML onboarding guides for IdP presets', () => {
    const g = getSamlOnboardingGuide('tenant-1', 'microsoft_entra');
    expect(g.steps.length).toBeGreaterThan(2);
    expect(g.provider).toBe('azure');
  });

  it('scales adaptive reconnect grace with churn', () => {
    expect(computeAdaptiveReconnectGraceMs(4)).toBeGreaterThan(computeAdaptiveReconnectGraceMs(0));
  });

  it('defines operational alert rules', () => {
    expect(getAlertRules().length).toBeGreaterThan(0);
  });
});
