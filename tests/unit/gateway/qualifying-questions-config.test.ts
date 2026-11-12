import { describe, expect, it } from 'vitest';
import {
  cleanQualificationQuestions,
  fromDashboardBody,
  normalizeDashboardConfig,
  toDashboardConfig,
  MAX_QUALIFYING_QUESTIONS,
  MAX_QUALIFYING_QUESTION_LENGTH,
} from '../../../apps/gateway/src/services/ai-config/ai-config.dto.js';

describe('cleanQualificationQuestions', () => {
  it('keeps plain text and reads question, text or label from objects', () => {
    expect(cleanQualificationQuestions(['What service?', { question: 'Budget?' }, { text: 'Which day?' }, { label: 'Branch?' }])).toEqual([
      'What service?',
      'Budget?',
      'Which day?',
      'Branch?',
    ]);
  });

  it('drops anything unusable, trims, collapses spaces and removes repeats', () => {
    expect(cleanQualificationQuestions(['  a   b  ', 'a b', '', '   ', null, 7, {}, { other: 'x' }])).toEqual(['a b']);
    expect(cleanQualificationQuestions('not a list')).toEqual([]);
    expect(cleanQualificationQuestions(undefined)).toEqual([]);
  });

  it('caps how many and how long', () => {
    const many = Array.from({ length: 30 }, (_, i) => `Question ${i}`);
    expect(cleanQualificationQuestions(many)).toHaveLength(MAX_QUALIFYING_QUESTIONS);
    expect(cleanQualificationQuestions(['x'.repeat(500)])[0]).toHaveLength(MAX_QUALIFYING_QUESTION_LENGTH);
  });
});

describe('saving the agent settings', () => {
  it('includes the questions when the request carries them', () => {
    const parsed = fromDashboardBody({ agentName: 'Sarah', qualificationQuestions: ['What service?', '  ', 'When?'] });
    expect(parsed.qualificationQuestions).toEqual(['What service?', 'When?']);
  });

  it('accepts an empty list, which clears the questions on purpose', () => {
    expect(fromDashboardBody({ qualificationQuestions: [] }).qualificationQuestions).toEqual([]);
  });

  it('leaves the field out entirely when the request has no questions, so a merge keeps the saved ones', () => {
    const parsed = fromDashboardBody({ agentName: 'Sarah', greetingMessage: 'Hi' });
    expect('qualificationQuestions' in parsed).toBe(false);
    const saved = { qualificationQuestions: ['Saved question'] } as Record<string, unknown>;
    expect({ ...saved, ...parsed }.qualificationQuestions).toEqual(['Saved question']);
  });

  it('also reads the snake_case name', () => {
    expect(fromDashboardBody({ qualification_questions: ['One'] }).qualificationQuestions).toEqual(['One']);
  });
});

describe('reading the agent settings back', () => {
  it('returns the saved questions to the dashboard, and an empty list when there are none', () => {
    expect(normalizeDashboardConfig({ qualificationQuestions: ['A?', 'B?'] }).qualificationQuestions).toEqual(['A?', 'B?']);
    expect(normalizeDashboardConfig({}).qualificationQuestions).toEqual([]);
    expect(toDashboardConfig({ agentName: 'Sarah', qualificationQuestions: ['What service?'] } as never).qualificationQuestions).toEqual(['What service?']);
    expect(toDashboardConfig({ agentName: 'Sarah' } as never).qualificationQuestions).toEqual([]);
  });
});
