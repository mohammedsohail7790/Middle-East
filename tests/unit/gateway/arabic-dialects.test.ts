import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ARABIC_DIALECT_GUIDES,
  ARABIC_DIALECT_PREVIEW_GREETING,
  arabicDialect,
  arabicDialectGuide,
  buildHumanRealtimePreamble,
  buildPreviewSampleText,
  buildReceptionistRoleBlock,
  resolveLanguageCode,
  synthesizeOpenAiTtsMp3,
  ttsInstructionsFor,
} from '../../../apps/gateway/src/services/realtime/receptionist-voice.js';
import { getAllowedLanguages, SUPPORTED_LANGUAGES } from '../../../apps/gateway/src/config/plan-config.js';

describe('arabic dialect from the language code', () => {
  it('maps the region to a dialect', () => {
    expect(arabicDialect('ar-SA')).toBe('sa');
    for (const c of ['ar-AE', 'ar-KW', 'ar-QA', 'ar-BH', 'ar-OM', 'ar-ae']) expect(arabicDialect(c)).toBe('gulf');
    expect(arabicDialect('ar-EG')).toBe('eg');
    for (const c of ['ar-LB', 'ar-JO', 'ar-SY', 'ar-PS']) expect(arabicDialect(c)).toBe('lb');
  });

  it('treats a bare "ar", an unknown region and other languages as no dialect', () => {
    for (const c of ['ar', 'ar-MA', 'en', 'fr', '', undefined, 'ur']) expect(arabicDialect(c)).toBeNull();
  });

  it('is still Arabic for everything that only reads the first two letters', () => {
    for (const c of ['ar-SA', 'ar-AE', 'ar-EG', 'ar-LB']) expect(resolveLanguageCode(c)).toBe('ar');
  });
});

describe('dialect guides in the live call instructions', () => {
  it('adds the right guide to the preamble and the role block', () => {
    const check = (code: string, marker: RegExp) => {
      expect(buildHumanRealtimePreamble(code)).toMatch(marker);
      expect(buildReceptionistRoleBlock({ agentName: 'Sara', businessName: 'Glow', personalityDesc: 'Warm', language: code })).toMatch(marker);
    };
    check('ar-SA', /Saudi Arabic/);
    check('ar-AE', /Gulf \(Khaleeji\) Arabic/);
    check('ar-EG', /Egyptian Arabic/);
    check('ar-LB', /Levantine Arabic/);
  });

  it('lets the caller win: every guide says to follow a caller who speaks another dialect', () => {
    for (const g of Object.values(ARABIC_DIALECT_GUIDES)) expect(g).toMatch(/move toward theirs/);
  });

  it('leaves the old behaviour for a bare "ar", English and other languages', () => {
    for (const c of ['ar', 'en', 'fr']) {
      expect(arabicDialectGuide(c)).toBe('');
      expect(buildHumanRealtimePreamble(c)).not.toMatch(/Dialect:/);
    }
    expect(buildHumanRealtimePreamble('ar')).toMatch(/matches the caller's own dialect/);
  });

  it('puts only one dialect in the instructions', () => {
    const t = buildHumanRealtimePreamble('ar-EG');
    expect(t).toMatch(/Egyptian/);
    expect(t).not.toMatch(/Saudi|Levantine|Khaleeji/);
  });
});

describe('dialect previews', () => {
  it('previews a greeting in the dialect, with the agent name', () => {
    expect(buildPreviewSampleText({ language: 'ar-SA', agentName: 'سارة' })).toBe(ARABIC_DIALECT_PREVIEW_GREETING.sa('سارة'));
    expect(buildPreviewSampleText({ language: 'ar-AE', agentName: 'Sara' })).toContain('معاك Sara');
    expect(buildPreviewSampleText({ language: 'ar-EG', agentName: 'Sara' })).toContain('إزاي');
    expect(buildPreviewSampleText({ language: 'ar-LB', agentName: 'Sara' })).toContain('كيف فيني');
  });

  it('keeps the old generic Arabic line for a bare "ar"', () => {
    expect(buildPreviewSampleText({ language: 'ar', agentName: 'Sara' })).toContain('هلا والله، Sara موظفة الاستقبال الذكية');
  });

  it('previews the business\'s own Arabic greeting as written, but never reads English out in Arabic', () => {
    expect(buildPreviewSampleText({ language: 'ar-SA', agentName: 'Sara', greetingMessage: 'أهلاً بكم في عيادة الأمل' })).toBe('أهلاً بكم في عيادة الأمل');
    expect(buildPreviewSampleText({ language: 'ar-SA', agentName: 'Sara', greetingMessage: 'Welcome to Glow Clinic' })).toBe(ARABIC_DIALECT_PREVIEW_GREETING.sa('Sara'));
  });

  it('does not change English previews', () => {
    expect(buildPreviewSampleText({ language: 'en', agentName: 'Sara' })).toContain('Sara');
    expect(buildPreviewSampleText({ language: 'en', agentName: 'Sara', greetingMessage: 'Hi from [Agent]' })).toBe('Hi from Sara');
  });

  it('gives an accent instruction only for a dialect', () => {
    expect(ttsInstructionsFor('ar-AE')).toMatch(/Gulf \(Khaleeji\) Arabic/);
    expect(ttsInstructionsFor('ar-EG')).toMatch(/Egyptian Arabic/);
    expect(ttsInstructionsFor('ar')).toBeUndefined();
    expect(ttsInstructionsFor('en')).toBeUndefined();
    expect(ttsInstructionsFor(undefined)).toBeUndefined();
  });
});

describe('the speech request', () => {
  const calls: Array<{ url: string; body: any }> = [];
  const saved = process.env.OPENAI_API_KEY;
  const okResponse = () => ({ ok: true, arrayBuffer: async () => new TextEncoder().encode('mp3').buffer, text: async () => '' });

  beforeEach(() => {
    calls.length = 0;
    process.env.OPENAI_API_KEY = 'k';
    delete process.env.OPENAI_TTS_MODEL;
    delete process.env.OPENAI_TTS_INSTRUCT_MODEL;
  });
  afterEach(() => {
    process.env.OPENAI_API_KEY = saved;
    vi.unstubAllGlobals();
  });
  const stub = (impl: (body: any) => any) =>
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => { const body = JSON.parse(init.body); calls.push({ url, body }); return impl(body); }));

  it('without instructions behaves exactly as before: the plain model, a mapped voice, a speed', async () => {
    stub(() => okResponse());
    await synthesizeOpenAiTtsMp3('hello', 'marin');
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toMatchObject({ model: 'tts-1-hd', voice: 'coral', response_format: 'mp3' });
    expect(calls[0].body.instructions).toBeUndefined();
    expect(calls[0].body.speed).toBeDefined();
  });

  it('with instructions uses the model that follows them, the real live-call voice, and no speed', async () => {
    stub(() => okResponse());
    await synthesizeOpenAiTtsMp3('مرحبا', 'marin', { instructions: 'Speak Saudi Arabic' });
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toMatchObject({ model: 'gpt-4o-mini-tts', voice: 'marin', instructions: 'Speak Saudi Arabic' });
    expect(calls[0].body.speed).toBeUndefined();
  });

  it('falls back to the plain model when the instruction request is refused, so a preview still plays', async () => {
    stub((body) => (body.instructions ? { ok: false, text: async () => 'unsupported', arrayBuffer: async () => new ArrayBuffer(0) } : okResponse()));
    const buf = await synthesizeOpenAiTtsMp3('مرحبا', 'cedar', { instructions: 'Speak Saudi Arabic' });
    expect(calls).toHaveLength(2);
    expect(calls[1].body).toMatchObject({ model: 'tts-1-hd', voice: 'onyx' });
    expect(calls[1].body.instructions).toBeUndefined();
    expect(buf.length).toBeGreaterThan(0);
  });

  it('falls back when the instruction request throws', async () => {
    let first = true;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => { calls.push({ url, body: JSON.parse(init.body) }); if (first) { first = false; throw new Error('network'); } return okResponse(); }));
    await expect(synthesizeOpenAiTtsMp3('x', 'coral', { instructions: 'i' })).resolves.toBeInstanceOf(Buffer);
    expect(calls).toHaveLength(2);
  });

  it('reports an error when even the plain request fails, and when there is no key', async () => {
    stub(() => ({ ok: false, text: async () => 'bad key', arrayBuffer: async () => new ArrayBuffer(0) }));
    await expect(synthesizeOpenAiTtsMp3('x', 'coral', { instructions: 'i' })).rejects.toThrow(/Voice preview failed: bad key/);
    delete process.env.OPENAI_API_KEY;
    await expect(synthesizeOpenAiTtsMp3('x', 'coral')).rejects.toThrow(/OPENAI_API_KEY/);
  });
});

describe('plans allow the dialects', () => {
  it('lists each dialect as a supported language and allows it on every plan', () => {
    const codes = SUPPORTED_LANGUAGES.map((l) => l.code) as string[];
    for (const c of ['ar-SA', 'ar-AE', 'ar-EG', 'ar-LB']) expect(codes).toContain(c);
    for (const plan of ['trial', 'essential', 'professional', 'enterprise']) {
      const allowed = getAllowedLanguages(plan) as string[];
      for (const c of ['ar-SA', 'ar-AE', 'ar-EG', 'ar-LB']) expect(allowed).toContain(c);
    }
  });
});
