/**
 * Fills "{{path.to.value}}" placeholders in a step's settings from what the run knows ({ trigger, config, steps }).
 * Pure and deliberately small: only dotted paths into plain objects and arrays (own properties only), nothing is ever evaluated, a missing value becomes an empty
 * string, and the result has a size cap so one huge value cannot flood an email or a webhook.
 */
const PLACEHOLDER = /\{\{\s*([^{}]*?)\s*\}\}/g;
const WHOLE = /^\{\{\s*([^{}]*?)\s*\}\}$/;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_VALUE_CHARS = 5_000;
const MAX_TOTAL_CHARS = 100_000;
const MAX_DEPTH = 8;
const MAX_ENTRIES = 200;

export class ParamsTooLargeError extends Error {
  constructor() {
    super('The step settings are too large');
    this.name = 'ParamsTooLargeError';
  }
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

/** Reads a dotted path ("trigger.lead.name", "steps.extract.items.0") from plain data. Returns undefined for anything missing or not allowed. */
export function getPath(data: unknown, path: string): unknown {
  if (!path || path.length > 200) return undefined;
  let cur: unknown = data;
  for (const part of path.split('.')) {
    if (!part || FORBIDDEN_KEYS.has(part)) return undefined;
    if (Array.isArray(cur)) {
      if (!/^\d{1,4}$/.test(part)) return undefined;
      cur = cur[Number(part)];
    } else if (isPlainObject(cur)) {
      if (!Object.prototype.hasOwnProperty.call(cur, part)) return undefined;
      cur = cur[part];
    } else {
      return undefined;
    }
  }
  return cur;
}

function asText(v: unknown): string {
  if (v === undefined || v === null) return '';
  let s: string;
  if (typeof v === 'string') s = v;
  else if (typeof v === 'number' || typeof v === 'boolean') s = String(v);
  else {
    try {
      s = JSON.stringify(v) ?? '';
    } catch {
      s = '';
    }
  }
  return s.length > MAX_VALUE_CHARS ? s.slice(0, MAX_VALUE_CHARS) : s;
}

function resolveString(s: string, data: unknown): unknown {
  const whole = WHOLE.exec(s);
  if (whole) {
    const v = getPath(data, whole[1]);
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'boolean') return v;
    // A whole-string path to an object or list gives the object itself (a copy), not text.
    if (v !== null && typeof v === 'object') {
      try {
        const json = JSON.stringify(v);
        return json !== undefined && json.length <= MAX_TOTAL_CHARS ? (JSON.parse(json) as unknown) : '';
      } catch {
        return '';
      }
    }
    return asText(v);
  }
  return s.replace(PLACEHOLDER, (_m, p: string) => asText(getPath(data, p)));
}

function walk(v: unknown, data: unknown, depth: number, budget: { n: number }): unknown {
  if (++budget.n > MAX_ENTRIES * 5) throw new ParamsTooLargeError();
  if (typeof v === 'string') return resolveString(v, data);
  if (v === null || typeof v === 'number' || typeof v === 'boolean') return v;
  if (depth >= MAX_DEPTH) return undefined;
  if (Array.isArray(v)) return v.slice(0, MAX_ENTRIES).map((x) => walk(x, data, depth + 1, budget));
  if (isPlainObject(v)) {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v).slice(0, MAX_ENTRIES)) {
      if (FORBIDDEN_KEYS.has(k)) continue;
      out[k] = walk(x, data, depth + 1, budget);
    }
    return out;
  }
  return undefined;
}

/** Returns a copy of `params` with every placeholder replaced. Throws ParamsTooLargeError when the result is over the size cap. */
export function resolveParams(params: Record<string, unknown> | undefined, data: Record<string, unknown>): Record<string, unknown> {
  if (!params) return {};
  const out = walk(params, data, 0, { n: 0 }) as Record<string, unknown>;
  if (JSON.stringify(out).length > MAX_TOTAL_CHARS) throw new ParamsTooLargeError();
  return out;
}

const SECRET_KEY = /secret|token|password|passwd|api[_-]?key|authorization|auth|credential|signature|private[_-]?key|bearer|cookie/i;

/** A copy of resolved params that is safe to show the owner: values of secret-looking fields are hidden, and a URL is shown as its host only (it may carry a key in its path). */
export function redactForProposal(v: unknown, depth = 0, key = ''): unknown {
  if (depth > MAX_DEPTH) return '[hidden]';
  if (key && SECRET_KEY.test(key)) return '[hidden]';
  if (typeof v === 'string') {
    if (/^https?:\/\//i.test(v)) {
      try {
        const u = new URL(v);
        return u.pathname.length > 1 || u.search ? `${u.origin}/…` : u.origin;
      } catch {
        return '[hidden]';
      }
    }
    return v.length > 1_000 ? `${v.slice(0, 1_000)}…` : v;
  }
  if (Array.isArray(v)) return v.slice(0, 50).map((x) => redactForProposal(x, depth + 1, key));
  if (isPlainObject(v)) {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v).slice(0, MAX_ENTRIES)) out[k] = redactForProposal(x, depth + 1, k);
    return out;
  }
  return v;
}

/** Whether a resolved `skipIf` value counts as "yes, skip": true, or any text other than empty, "false", "0", "no". */
export function isTruthy(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return !['', 'false', '0', 'no', 'null', 'undefined'].includes(v.trim().toLowerCase());
  return v !== null && v !== undefined;
}

/** Resolves one "{{path}}" setting (as `skipIf` uses) against the run's data. */
export function resolveValue(template: string, data: Record<string, unknown>): unknown {
  return resolveString(template, data);
}
