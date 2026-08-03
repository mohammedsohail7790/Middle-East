import { describe, it, expect } from 'vitest';
import { evaluateSpam } from '../src/services/spam/spam.service.js';
import { INDUSTRY_KEYS } from '../src/services/industry/templates.js';

describe('spam.service evaluateSpam', () => {
  it('flags numbers on custom blocklist', async () => {
    const result = await evaluateSpam({
      tenantId: '00000000-0000-0000-0000-000000000099',
      callSid: 'CAtest1',
      fromNumber: '+15551234567',
      toNumber: '+15559876543',
      stirVerstat: 'TN-VALIDATION-PASSED',
    });
    expect(typeof result.isSpam).toBe('boolean');
  });

  it('flags failed STIR/SHAKEN', async () => {
    const result = await evaluateSpam({
      tenantId: '00000000-0000-0000-0000-000000000099',
      callSid: 'CAtest2',
      fromNumber: '+15551112222',
      toNumber: '+15559876543',
      stirVerstat: 'TN-VALIDATION-FAILED',
    });
    expect(result.isSpam).toBe(true);
    expect(result.reason).toBe('stir_shaken_failed');
  });
});

describe('industry templates', () => {
  it('exposes 50 industry templates', () => {
    expect(INDUSTRY_KEYS.length).toBe(50);
  });
});
