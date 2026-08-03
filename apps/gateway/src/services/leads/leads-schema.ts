import { voiceDb } from '../voice/tenant-scope.js';

const BASE_COLUMNS = [
  'id',
  'tenant_id',
  'phone',
  'name',
  'source',
  'status',
  'score',
  'notes',
  'created_at',
] as const;

const OPTIONAL_COLUMNS = [
  'assigned_to',
  'custom_fields',
  'service',
  'call_id',
  'preferred_time',
  'email',
] as const;

let cachedSelect: string | null = null;

export async function getLeadSelectList(): Promise<string> {
  if (cachedSelect) return cachedSelect;

  try {
    const result = await voiceDb.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'leads'`
    );
    const cols = new Set(
      (result.rows as Array<{ column_name: string }>).map((r) => r.column_name)
    );
    const parts = [
      ...BASE_COLUMNS.filter((c) => cols.has(c)),
      ...OPTIONAL_COLUMNS.filter((c) => cols.has(c)),
    ];
    cachedSelect = parts.length > 0 ? parts.join(', ') : BASE_COLUMNS.join(', ');
    return cachedSelect;
  } catch {
    cachedSelect = [...BASE_COLUMNS, 'custom_fields', 'service', 'call_id'].join(', ');
    return cachedSelect;
  }
}

export function isMissingColumnError(msg: string): boolean {
  return /column .* does not exist|42703/i.test(msg);
}
