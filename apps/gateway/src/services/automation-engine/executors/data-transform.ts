import { getPath } from '../params.js';
import type { ExecutorContext, ExecutorResult } from '../types.js';
import { isObject, text } from './util.js';

const FORMATS: Record<string, (s: string) => string> = {
  trim: (s) => s.trim(),
  lowercase: (s) => s.toLowerCase(),
  uppercase: (s) => s.toUpperCase(),
  title: (s) => s.toLowerCase().replace(/(^|\s)(\S)/g, (_m, a: string, b: string) => a + b.toUpperCase()),
  digits: (s) => s.replace(/\D/g, ''),
  phone: (s) => {
    const d = s.replace(/\D/g, '');
    return d ? `+${d}` : '';
  },
};

const asText = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : '');

function toNumber(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * data.transform: reshapes data with no code evaluation.
 *   { mode: 'min-score', score, minScore }          -> { belowMinimum, score }
 *   { copy:   { target: 'path.in.data' } }            copy (or rename) a value
 *   { join:   { target: { parts: ['path', ...], separator: ' ' } } }
 *   { format: { target: { path: 'path', as: 'trim'|'lowercase'|'uppercase'|'title'|'digits'|'phone' } } }
 */
export async function dataTransform(ctx: ExecutorContext): Promise<ExecutorResult> {
  const p = ctx.params;
  if (p.mode === 'min-score') {
    const score = toNumber(p.score);
    const min = toNumber(p.minScore) ?? 0;
    const belowMinimum = score === null || score < min; // no score at all is treated as not hot
    return {
      summary: score === null ? 'The call had no score, so it does not count as hot' : belowMinimum ? `Score ${score} is below the minimum of ${min}` : `Score ${score} reaches the minimum of ${min}`,
      output: { belowMinimum, score },
    };
  }

  const out: Record<string, unknown> = {};
  if (isObject(p.copy)) for (const [k, path] of Object.entries(p.copy)) out[k] = getPath(ctx.data, text(path, 200)) ?? '';
  if (isObject(p.join)) {
    for (const [k, spec] of Object.entries(p.join)) {
      if (!isObject(spec) || !Array.isArray(spec.parts)) continue;
      const sep = typeof spec.separator === 'string' ? spec.separator.slice(0, 20) : ' ';
      out[k] = spec.parts.slice(0, 20).map((x) => asText(getPath(ctx.data, text(x, 200))).trim()).filter(Boolean).join(sep);
    }
  }
  if (isObject(p.format)) {
    for (const [k, spec] of Object.entries(p.format)) {
      if (!isObject(spec)) continue;
      const fn = FORMATS[text(spec.as, 20)];
      if (!fn) continue;
      out[k] = fn(asText(getPath(ctx.data, text(spec.path, 200))));
    }
  }
  const n = Object.keys(out).length;
  if (!n) return { summary: 'There was nothing to change', skipped: true };
  return { summary: n === 1 ? 'Prepared 1 field' : `Prepared ${n} fields`, output: out };
}
