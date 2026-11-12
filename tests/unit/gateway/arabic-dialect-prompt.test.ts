import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../apps/gateway/src/services/business-hours/business-hours.service.js', () => ({
  businessHoursService: { isCurrentlyOpen: vi.fn(async () => true) },
}));

import { buildSystemPrompt } from '../../../apps/gateway/src/services/realtime/realtime-prompt-builder.js';

const tenant = (language: string) =>
  ({
    tenantId: 't-1', businessName: 'Example Business', industry: 'general', services: ['Service A'], tone: 'professional',
    questions: [], defaultLanguage: language, timezone: 'UTC', diagnosticFee: 0, callHandlingMode: 'both',
    transferPhoneNumber: '+10000000000', integrations: {}, agentName: 'Agent', welcomeMessage: 'Hello',
  }) as never;

describe('the live prompt with a chosen Arabic dialect', () => {
  it('makes the dialect the default and lets the caller override it', async () => {
    const p = await buildSystemPrompt(tenant('ar-AE'), 'ar-AE');
    expect(p).toMatch(/The business default is Gulf \(Khaleeji\) Arabic; use it unless the caller clearly speaks another dialect or language/);
    expect(p).toMatch(/Dialect: speak everyday Gulf/);
    expect(p).not.toMatch(/Do not assume the caller's country, city or accent/);
  });

  it('uses the right dialect for each region', async () => {
    expect(await buildSystemPrompt(tenant('ar-SA'), 'ar-SA')).toMatch(/default is Saudi Arabic/);
    expect(await buildSystemPrompt(tenant('ar-EG'), 'ar-EG')).toMatch(/default is Egyptian Arabic/);
    expect(await buildSystemPrompt(tenant('ar-LB'), 'ar-LB')).toMatch(/default is Levantine Arabic/);
  });

  it('keeps the old neutral wording for a bare "ar", English and other languages', async () => {
    for (const lang of ['ar', 'en', 'fr', 'ur']) {
      const p = await buildSystemPrompt(tenant(lang), lang);
      expect(p).toMatch(/Do not assume the caller's country, city or accent/);
      expect(p).not.toMatch(/Dialect: speak everyday/);
    }
  });
});
