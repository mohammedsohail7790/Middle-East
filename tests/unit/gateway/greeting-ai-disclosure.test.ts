import { describe, expect, it } from 'vitest';
import {
  ARABIC_DIALECT_PREVIEW_GREETING,
  buildPreviewSampleText,
  formatDefaultGreeting,
} from '../../../apps/gateway/src/services/realtime/receptionist-voice.js';

describe('AI disclosure in default greetings', () => {
  it('English default template says this is an AI receptionist', () => {
    const g = formatDefaultGreeting('Acme', 'Sarah');
    expect(g).toContain('Acme');
    expect(g).toMatch(/AI receptionist/);
  });
  it('every language preview greeting states it is automated', () => {
    const markers: Record<string, RegExp> = {
      en: /AI/, ru: /ИИ/, hi: /एआई/, ur: /اے آئی/, fr: /virtuelle/, zh: /AI/, fa: /هوشمند/, ar: /الذكية/,
    };
    for (const [code, re] of Object.entries(markers)) {
      expect(buildPreviewSampleText({ language: code, agentName: 'Sarah' }), code).toMatch(re);
    }
  });
  it('every Arabic dialect greeting states it is automated', () => {
    for (const d of Object.keys(ARABIC_DIALECT_PREVIEW_GREETING) as (keyof typeof ARABIC_DIALECT_PREVIEW_GREETING)[]) {
      expect(ARABIC_DIALECT_PREVIEW_GREETING[d]('Sara')).toMatch(/الذكية/);
    }
  });
  it('leaves a tenant custom greeting unchanged', () => {
    expect(buildPreviewSampleText({ language: 'en', agentName: 'Sarah', greetingMessage: 'Welcome to Joe\'s, how can I help you?' })).toBe("Welcome to Joe's, how can I help you?");
  });
});
