import { describe, it, expect } from 'vitest';
import { isIpAllowed } from '../../../apps/gateway/src/services/enterprise-auth/org-auth-policy.js';
import { redactPii } from '../../../apps/gateway/src/services/compliance/compliance.service.js';

describe('enterprise ops maturity (P4-B)', () => {
  it('enforces IP allowlist when configured', () => {
    const policy = {
      tenantId: 't1',
      mfaRequired: false,
      ssoRequired: false,
      ipAllowlist: ['10.0.0.1'],
      sessionMaxAgeHours: 168,
      suspiciousLoginAlert: true,
    };
    expect(isIpAllowed(policy, '10.0.0.1')).toBe(true);
    expect(isIpAllowed(policy, '192.168.1.1')).toBe(false);
    expect(isIpAllowed({ ...policy, ipAllowlist: [] }, '192.168.1.1')).toBe(true);
  });

  it('redacts common PII patterns', () => {
    const out = redactPii('Contact me at user@example.com or 123-45-6789');
    expect(out).not.toContain('user@example.com');
    expect(out).toContain('[REDACTED]');
  });
});
