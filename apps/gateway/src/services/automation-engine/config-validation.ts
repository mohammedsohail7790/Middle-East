import type { AutomationTemplate, ConfigField } from './types.js';

export type ConfigCheck = { ok: true; config: Record<string, string | number | boolean> } | { ok: false; errors: string[] };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_TEXT = 500;

function checkField(f: ConfigField, v: unknown): { value?: string | number | boolean; error?: string } {
  switch (f.type) {
    case 'text': {
      if (typeof v !== 'string') return { error: `${f.label} must be text` };
      const s = v.trim();
      if (s.length > MAX_TEXT) return { error: `${f.label} is too long (at most ${MAX_TEXT} characters)` };
      return { value: s };
    }
    case 'email': {
      if (typeof v !== 'string' || !EMAIL.test(v.trim()) || v.length > 254) return { error: `${f.label} must be an email address` };
      return { value: v.trim().toLowerCase() };
    }
    case 'url': {
      if (typeof v !== 'string') return { error: `${f.label} must be a web address` };
      let u: URL;
      try {
        u = new URL(v.trim());
      } catch {
        return { error: `${f.label} must be a web address` };
      }
      if (u.protocol !== 'https:') return { error: `${f.label} must start with https://` };
      return { value: u.toString() };
    }
    case 'number': {
      const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
      if (typeof n !== 'number' || !Number.isFinite(n)) return { error: `${f.label} must be a number` };
      return { value: n };
    }
    case 'boolean': {
      if (typeof v !== 'boolean') return { error: `${f.label} must be yes or no` };
      return { value: v };
    }
    case 'select': {
      if (typeof v !== 'string' || !(f.options ?? []).some((o) => o.value === v)) return { error: `${f.label} must be one of the listed choices` };
      return { value: v };
    }
  }
}

/**
 * Checks a business's settings against what the template allows: only known settings, the right type for each, defaults filled in, and every required
 * setting present when the automation is being switched on. A value that is not valid is refused, never silently changed.
 */
export function validateConfig(template: AutomationTemplate, input: unknown, opts: { enabling: boolean }): ConfigCheck {
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const errors: string[] = [];
  const known = new Set(template.config.map((f) => f.key));
  for (const k of Object.keys(raw)) if (!known.has(k)) errors.push(`Unknown setting "${k}"`);
  const out: Record<string, string | number | boolean> = {};
  for (const f of template.config) {
    const given = raw[f.key];
    const missing = given === undefined || given === null || given === '';
    if (missing) {
      if (f.default !== undefined) out[f.key] = f.default;
      else if (f.required && opts.enabling) errors.push(`${f.label} is required`);
      continue;
    }
    const r = checkField(f, given);
    if (r.error) errors.push(r.error);
    else if (r.value !== undefined) out[f.key] = r.value;
  }
  return errors.length ? { ok: false, errors } : { ok: true, config: out };
}
