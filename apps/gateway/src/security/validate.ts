/**
 * Lightweight server-side validation (no extra deps). Prefer explicit checks on every mutating route.
 */

export class ValidationError extends Error {
  statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function requireString(
  value: unknown,
  field: string,
  opts?: { min?: number; max?: number; pattern?: RegExp }
): string {
  if (typeof value !== 'string') {
    throw new ValidationError(`${field} must be a string`);
  }
  const trimmed = value.trim();
  const max = opts?.max ?? 8_000;
  const min = opts?.min ?? 0;
  if (trimmed.length < min) {
    throw new ValidationError(`${field} is required`);
  }
  if (trimmed.length > max) {
    throw new ValidationError(`${field} exceeds maximum length`);
  }
  if (opts?.pattern && !opts.pattern.test(trimmed)) {
    throw new ValidationError(`${field} has invalid format`);
  }
  return trimmed;
}

export function requireUuid(value: unknown, field: string): string {
  const s = requireString(value, field, { max: 64 });
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)) {
    throw new ValidationError(`${field} must be a valid UUID`);
  }
  return s;
}

export function pickAllowedKeys<T extends Record<string, unknown>>(
  body: unknown,
  allowed: string[]
): Partial<T> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('Invalid request body');
  }
  const out: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in (body as object)) {
      out[key] = (body as Record<string, unknown>)[key];
    }
  }
  return out as Partial<T>;
}

export function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, '').replace(/javascript:/gi, '');
}
