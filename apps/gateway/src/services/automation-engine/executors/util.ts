import type { ExecutorContext } from '../types.js';

export const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

/** A short single piece of text from a setting; anything that is not text or a number becomes empty. */
export function text(v: unknown, max = 2_000): string {
  if (typeof v === 'string') return v.trim().slice(0, max);
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return '';
}

export const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Executors for steps that change something outside Halla AI call this first: without the owner's yes (or automatic mode) they do nothing. */
export function requireApproval(ctx: ExecutorContext): void {
  if (!ctx.approved) throw new Error('This step needs approval first');
}

/** Subject lines carry no line breaks (no header injection). */
export const oneLine = (s: string, max = 150): string => s.replace(/[\r\n]+/g, ' ').trim().slice(0, max);
