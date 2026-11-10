import { describe, expect, it } from 'vitest';
import { PLAN_FEATURES, SUPPORTED_LANGUAGES, isLanguageAllowed } from '../../apps/gateway/src/config/plan-config.js';
import { getLanguageDisplayName, resolveLanguageCode } from '../../apps/gateway/src/services/realtime/receptionist-voice.js';

const SEVEN = ['en', 'ar-SA', 'ur', 'fr', 'zh', 'ru', 'fa'] as const;

describe('the seven advertised languages', () => {
  it('are all supported', () => {
    const codes = SUPPORTED_LANGUAGES.map((l) => l.code) as string[];
    for (const c of SEVEN) expect(codes).toContain(c);
  });

  it('are included on every plan, including the entry plan', () => {
    for (const plan of Object.keys(PLAN_FEATURES)) {
      for (const c of SEVEN) expect(isLanguageAllowed(plan, c), `${plan} ${c}`).toBe(true);
    }
  });

  it('resolve to a real language name instead of falling back to English', () => {
    expect(getLanguageDisplayName(resolveLanguageCode('ur'))).toBe('Urdu');
    expect(getLanguageDisplayName(resolveLanguageCode('fr'))).toBe('French');
    expect(getLanguageDisplayName(resolveLanguageCode('zh'))).toBe('Mandarin Chinese');
    expect(getLanguageDisplayName(resolveLanguageCode('fa'))).toBe('Persian (Farsi)');
    expect(resolveLanguageCode('ar-SA')).toBe('ar');
  });
});
