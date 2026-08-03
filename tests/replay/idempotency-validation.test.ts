import { describe, it, expect } from 'vitest';
import { isIpAllowed } from '../../apps/gateway/src/services/enterprise-auth/org-auth-policy.js';
import { redactPii } from '../../apps/gateway/src/services/compliance/compliance.service.js';

/** Replay-safe idempotency checks for enterprise paths (no live Redis). */
describe('replay / idempotency validation', () => {
  it('IP allowlist evaluation is deterministic', () => {
    const policy = {
      tenantId: 't1',
      mfaRequired: false,
      ssoRequired: false,
      ipAllowlist: ['10.0.0.1'],
      sessionMaxAgeHours: 168,
      suspiciousLoginAlert: true,
    };
    expect(isIpAllowed(policy, '10.0.0.1')).toBe(true);
    expect(isIpAllowed(policy, '10.0.0.1')).toBe(true);
    expect(isIpAllowed(policy, '10.0.0.2')).toBe(false);
  });

  it('PII redaction is stable across replays', () => {
    const input = 'Email user@test.com and SSN 123-45-6789';
    const a = redactPii(input);
    const b = redactPii(input);
    expect(a).toBe(b);
    expect(a).not.toContain('user@test.com');
  });
});
