import { describe, expect, it } from 'vitest';
import { detectUtteranceLanguage, planFirstUtteranceSwitch } from '../../../apps/gateway/src/services/realtime/language-detection.js';
import { PLAN_FEATURES, isLanguageAllowed } from '../../../apps/gateway/src/config/plan-config.js';
import { PLANS } from '../../../apps/gateway/src/services/billing/billing.service.js';

const lang = (t: string) => detectUtteranceLanguage(t)?.language ?? null;

describe('detectUtteranceLanguage', () => {
  it.each([
    ['Hello, I would like to book an appointment please', 'en'],
    ['Bonjour, je voudrais prendre un rendez-vous', 'fr'],
    ['Здравствуйте, я хочу записаться на приём', 'ru'],
    ['你好，我想预约一个时间', 'zh'],
    ['مرحبا، أريد حجز موعد من فضلك', 'ar'],
    ['السلام عليكم ممكن أحجز موعد', 'ar'],
    ['السلام علیکم، میں ایک اپائنٹمنٹ بک کرنا چاہتا ہوں', 'ur'],
    ['سلام، من می‌خواهم برای یک وقت ملاقات رزرو کنم', 'fa'],
  ])('%s -> %s', (text, expected) => {
    expect(lang(text)).toBe(expected);
  });
  it('returns null for empty or ambiguous input', () => {
    expect(detectUtteranceLanguage('')).toBeNull();
    expect(detectUtteranceLanguage('123 ...')).toBeNull();
    expect(detectUtteranceLanguage('Xyzzy')).toBeNull();
  });
});

describe('planFirstUtteranceSwitch', () => {
  it('switches when the caller uses another language', () => {
    expect(planFirstUtteranceSwitch('Bonjour, je voudrais un rendez-vous', 'en')).toBe('fr');
    expect(planFirstUtteranceSwitch('Hello I need to book', 'ar-AE')).toBe('en');
  });
  it('keeps the tenant Arabic dialect, and does nothing when the language matches', () => {
    expect(planFirstUtteranceSwitch('مرحبا، أريد حجز موعد من فضلك', 'ar-EG')).toBeNull();
    expect(planFirstUtteranceSwitch('مرحبا، أريد حجز موعد من فضلك', 'en')).toBe('ar-SA');
    expect(planFirstUtteranceSwitch('Hello, I would like to book', 'en')).toBeNull();
  });
});

describe('language availability on every plan', () => {
  it('enables switching and all seven languages on Essential', () => {
    expect(PLAN_FEATURES.essential.multiLanguageSwitching).toBe(true);
    for (const c of ['en', 'ar-SA', 'ur', 'fr', 'zh', 'ru', 'fa'] as const) expect(isLanguageAllowed('essential', c)).toBe(true);
  });
  it('lists the seven languages in billing PLANS', () => {
    const lists = Object.values(PLANS as Record<string, any>).map((p) => p.features?.languages).filter(Boolean);
    expect(lists.length).toBeGreaterThan(0);
    for (const l of lists) expect(l).toEqual(expect.arrayContaining(['en', 'ar', 'ur', 'fr', 'zh', 'ru', 'fa']));
  });
});
