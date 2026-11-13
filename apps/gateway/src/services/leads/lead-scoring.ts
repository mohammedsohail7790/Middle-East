/**
 * Lead score from the caller's answers to the owner's qualifying questions, plus budget, timing and urgency signals.
 * Pure and explainable: every point comes with a reason that is stored on the lead. A tenant with no qualifying questions gets
 * null, and the lead keeps the original heuristic score (source and fields only).
 */

export type BudgetSignal = 'stated' | 'vague' | 'none';
export type TimingSignal = 'immediate' | 'soon' | 'later' | 'none';
export type UrgencySignal = 'urgent' | 'normal' | 'none';

export interface QuestionAnswer {
  question: string;
  /** The caller's answer in their own words, or null when they did not answer. */
  answer: string | null;
}

export interface QualificationSignals {
  answers: QuestionAnswer[];
  budget: BudgetSignal;
  timing: TimingSignal;
  urgency: UrgencySignal;
}

export interface QualificationScore {
  /** 0..100 from the answers and signals alone. */
  score: number;
  level: 'high' | 'medium' | 'low';
  answered: number;
  total: number;
  reasons: string[];
}

const ANSWERS_MAX = 50;
const COMPLETE_BONUS = 10;
const BUDGET_POINTS: Record<BudgetSignal, number> = { stated: 15, vague: 7, none: 0 };
const TIMING_POINTS: Record<TimingSignal, number> = { immediate: 15, soon: 10, later: 4, none: 0 };
const URGENCY_POINTS: Record<UrgencySignal, number> = { urgent: 10, normal: 3, none: 0 };

const NON_ANSWERS = /^(n\/?a|none|null|unknown|no answer|not (sure|given|answered|asked|provided)|didn'?t (say|answer)|-+)\.?$/i;

export function levelForScore(score: number): 'high' | 'medium' | 'low' {
  return score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';
}

/** Reads the saved question list the same way the live prompt does: plain text or an object with question, text or label; at most 10. */
export function normalizeQuestions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((q) => {
      if (typeof q === 'string') return q;
      if (q && typeof q === 'object') {
        const o = q as Record<string, unknown>;
        for (const key of ['question', 'text', 'label']) if (typeof o[key] === 'string') return o[key] as string;
      }
      return '';
    })
    .map((q) => q.replace(/\s+/g, ' ').trim().slice(0, 200))
    .filter(Boolean)
    .slice(0, 10);
}

function isAnswered(a: string | null | undefined): boolean {
  const t = (a ?? '').trim();
  return t.length > 0 && !NON_ANSWERS.test(t);
}

/** Null when there are no questions (the caller keeps the heuristic score). */
export function scoreQualification(questions: string[], signals: Partial<QualificationSignals> | null | undefined): QualificationScore | null {
  if (!questions.length) return null;
  const answers = signals?.answers ?? [];
  const answeredCount = questions.filter((q, i) => {
    const byQuestion = answers.find((a) => a.question === q);
    return isAnswered((byQuestion ?? answers[i])?.answer);
  }).length;
  const budget = signals?.budget ?? 'none';
  const timing = signals?.timing ?? 'none';
  const urgency = signals?.urgency ?? 'none';

  const reasons: string[] = [];
  const answerPoints = Math.round((answeredCount / questions.length) * ANSWERS_MAX);
  reasons.push(`Answered ${answeredCount} of ${questions.length} qualifying question${questions.length === 1 ? '' : 's'} (+${answerPoints})`);
  let score = answerPoints;
  if (answeredCount === questions.length) {
    score += COMPLETE_BONUS;
    reasons.push(`All questions answered (+${COMPLETE_BONUS})`);
  }
  if (BUDGET_POINTS[budget]) {
    score += BUDGET_POINTS[budget];
    reasons.push(`Budget ${budget === 'stated' ? 'stated' : 'hinted at'} (+${BUDGET_POINTS[budget]})`);
  }
  if (TIMING_POINTS[timing]) {
    score += TIMING_POINTS[timing];
    reasons.push(`Timing ${timing === 'immediate' ? 'is immediate' : timing === 'soon' ? 'is soon' : 'is later'} (+${TIMING_POINTS[timing]})`);
  }
  if (URGENCY_POINTS[urgency]) {
    score += URGENCY_POINTS[urgency];
    reasons.push(`Caller ${urgency === 'urgent' ? 'sounded urgent' : 'has a normal level of urgency'} (+${URGENCY_POINTS[urgency]})`);
  }
  score = Math.min(100, Math.max(0, score));
  return { score, level: levelForScore(score), answered: answeredCount, total: questions.length, reasons };
}

/** Final lead score: half the original heuristic (source and fields), half the qualification score. Without a qualification score the heuristic stands. */
export function blendLeadScore(heuristic: number, qualification: number | null | undefined): number {
  if (typeof qualification !== 'number' || !Number.isFinite(qualification)) return heuristic;
  return Math.min(100, Math.max(0, Math.round(heuristic * 0.5 + qualification * 0.5)));
}

/** Cleans the model's extraction into signals; unknown values fall back to "none"/unanswered. */
export function parseQualificationSignals(questions: string[], raw: unknown): QualificationSignals {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const list = Array.isArray(o.answers) ? (o.answers as unknown[]) : [];
  const answers: QuestionAnswer[] = questions.map((question, i) => {
    const found = list.find((a) => a && typeof a === 'object' && Number((a as Record<string, unknown>).question_index) === i + 1) as Record<string, unknown> | undefined;
    const ans = found && typeof found.answer === 'string' ? found.answer.trim().slice(0, 300) : '';
    return { question, answer: isAnswered(ans) ? ans : null };
  });
  const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);
  return {
    answers,
    budget: pick(o.budget, ['stated', 'vague', 'none'] as const, 'none'),
    timing: pick(o.timing, ['immediate', 'soon', 'later', 'none'] as const, 'none'),
    urgency: pick(o.urgency, ['urgent', 'normal', 'none'] as const, 'none'),
  };
}
