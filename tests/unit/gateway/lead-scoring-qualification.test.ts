import { afterEach, describe, expect, it, vi } from 'vitest';
import { blendLeadScore, normalizeQuestions, parseQualificationSignals, scoreQualification } from '../../../apps/gateway/src/services/leads/lead-scoring.js';

const Q = ['What is your budget?', 'When do you need it?', 'Which service?'];

describe('scoreQualification', () => {
  it('returns null when the tenant has no questions (heuristic stays)', () => {
    expect(scoreQualification([], { budget: 'stated' })).toBeNull();
  });
  it('scores answered questions and signals with reasons', () => {
    const signals = parseQualificationSignals(Q, {
      answers: [
        { question_index: 1, answer: 'around 5000 AED' },
        { question_index: 2, answer: 'next week' },
        { question_index: 3, answer: 'whitening' },
      ],
      budget: 'stated',
      timing: 'immediate',
      urgency: 'urgent',
    });
    const r = scoreQualification(Q, signals)!;
    expect(r.score).toBe(100);
    expect(r.level).toBe('high');
    expect(r.answered).toBe(3);
    expect(r.reasons.join(' ')).toMatch(/Answered 3 of 3/);
    expect(r.reasons.join(' ')).toMatch(/Budget stated/);
  });
  it('treats null and non-answers as unanswered and scores low', () => {
    const signals = parseQualificationSignals(Q, { answers: [{ question_index: 1, answer: 'not sure' }, { question_index: 2, answer: null }], budget: 'bogus' });
    const r = scoreQualification(Q, signals)!;
    expect(r.answered).toBe(0);
    expect(r.score).toBe(0);
    expect(r.level).toBe('low');
  });
  it('gives partial credit without the completeness bonus', () => {
    const signals = parseQualificationSignals(Q, { answers: [{ question_index: 1, answer: '3000' }], timing: 'later' });
    const r = scoreQualification(Q, signals)!;
    expect(r.score).toBe(Math.round(50 / 3) + 4);
    expect(r.reasons.some((x) => /All questions answered/.test(x))).toBe(false);
  });
});

describe('helpers', () => {
  it('blends half and half, and leaves the heuristic alone without a qualification score', () => {
    expect(blendLeadScore(60, 100)).toBe(80);
    expect(blendLeadScore(60, undefined)).toBe(60);
    expect(blendLeadScore(60, null)).toBe(60);
  });
  it('normalizes saved questions like the live prompt does', () => {
    expect(normalizeQuestions(['a', { question: 'b' }, { text: 'c' }, 5, ''])).toEqual(['a', 'b', 'c']);
    expect(normalizeQuestions(undefined)).toEqual([]);
    expect(normalizeQuestions(Array.from({ length: 15 }, (_, i) => `q${i}`))).toHaveLength(10);
  });
});

describe('evaluateCall with qualifying questions', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });
  async function run(questions: string[], reply: unknown) {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.resetModules();
    const bodies: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: any) => {
      bodies.push(JSON.parse(init.body));
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(reply) } }] }) };
    }));
    const { AiService } = await import('../../../apps/gateway/src/services/voice/ai.service.js');
    const svc = new AiService();
    const res = await svc.evaluateCall({ businessName: 'B', services: [] } as any, [{ role: 'user', text: 'hi', timestamp: '' }], { phone: '1' } as any, false, questions);
    return { res, body: bodies[0] };
  }
  it('asks for answers and returns them', async () => {
    const { res, body } = await run(['Budget?'], { sentiment: 'positive', lead_quality: 'medium', summary: 's', qualification: { answers: [{ question_index: 1, answer: '2k' }], budget: 'stated' } });
    expect(JSON.stringify(body.messages)).toContain('1. Budget?');
    expect(res.qualification?.answers[0].answer).toBe('2k');
    expect(res.qualification?.budget).toBe('stated');
  });
  it('is unchanged for tenants without questions', async () => {
    const { res, body } = await run([], { sentiment: 'neutral', lead_quality: 'low', summary: 's' });
    expect(JSON.stringify(body.messages)).not.toContain('qualification');
    expect(res.qualification).toBeUndefined();
  });
});
