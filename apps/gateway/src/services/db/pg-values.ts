/** Coerce unknown values to a JSON array for JSONB columns */
export function ensureJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Coerce unknown values to a JSON object or null for JSONB columns */
export function ensureJsonObject(value: unknown): Record<string, unknown> | null {
  if (value == null) return null;
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * JSON text for PostgreSQL `::jsonb` casts. Never pass raw JS arrays to node-pg with
 * `::jsonb` — the driver may send Postgres array syntax and trigger "invalid input syntax for type json".
 */
export function asJsonb(value: unknown): string {
  if (value == null) return 'null';

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return 'null';
    try {
      JSON.parse(trimmed);
      return trimmed;
    } catch {
      return JSON.stringify(trimmed);
    }
  }

  try {
    return JSON.stringify(value);
  } catch {
    return 'null';
  }
}

/** JSON array for jsonb columns (qualification_questions, etc.) */
export function asJsonbArray(value: unknown): string {
  return asJsonb(ensureJsonArray(value));
}

/** JSON object for jsonb columns (transfer_conditions, metadata merges) */
export function asJsonbObject(value: unknown): string {
  return asJsonb(ensureJsonObject(value) ?? {});
}

/** Normalize values for node-pg → PostgreSQL TEXT[] columns */
export function asTextArray(value: unknown): string[] | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      return [value];
    }
  }
  return null;
}
