import type { Pool } from 'pg';

export type BusinessHoursColumnSet = {
  startCol: 'start_time' | 'open_time';
  endCol: 'end_time' | 'close_time';
  openCol: 'is_open' | 'is_closed';
  /** When DB uses is_closed, store the inverse of isOpen. */
  invertOpenFlag: boolean;
  /**
   * Databases that went through both migration 004 (open_time / close_time, NOT NULL) and 009 (start_time / end_time added beside them)
   * have both sets of columns. Every write must fill the old required ones too, or the insert fails with a not-null error.
   */
  legacyStartCol?: 'open_time';
  legacyEndCol?: 'close_time';
};

let cachedColumns: BusinessHoursColumnSet | null = null;

function isMissingRelationError(msg: string): boolean {
  return /relation .* does not exist|42P01/i.test(msg);
}

function isMissingColumnError(msg: string): boolean {
  return /column .* does not exist|42703/i.test(msg);
}

/** Detect business_hours column layout (legacy open_time/is_closed vs modern start_time/is_open). */
export async function getBusinessHoursColumnSet(pool: Pool): Promise<BusinessHoursColumnSet> {
  if (cachedColumns) return cachedColumns;

  try {
    const result = await pool.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'business_hours'`
    );
    const cols = new Set(
      (result.rows as Array<{ column_name: string }>).map((r) => r.column_name)
    );

    const startCol: 'start_time' | 'open_time' = cols.has('start_time')
      ? 'start_time'
      : 'open_time';
    const endCol: 'end_time' | 'close_time' = cols.has('end_time') ? 'end_time' : 'close_time';

    const legacyStartCol = startCol === 'start_time' && cols.has('open_time') ? ('open_time' as const) : undefined;
    const legacyEndCol = endCol === 'end_time' && cols.has('close_time') ? ('close_time' as const) : undefined;

    if (cols.has('is_open')) {
      cachedColumns = {
        startCol,
        endCol,
        openCol: 'is_open',
        invertOpenFlag: false,
        legacyStartCol,
        legacyEndCol,
      };
    } else {
      cachedColumns = {
        startCol,
        endCol,
        openCol: 'is_closed',
        invertOpenFlag: true,
        legacyStartCol,
        legacyEndCol,
      };
    }
    return cachedColumns;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (isMissingRelationError(msg)) {
      cachedColumns = {
        startCol: 'start_time',
        endCol: 'end_time',
        openCol: 'is_open',
        invertOpenFlag: false,
      };
      return cachedColumns;
    }
    throw err;
  }
}

export function openFlagDbValue(isOpen: boolean, columns: BusinessHoursColumnSet): boolean {
  return columns.invertOpenFlag ? !isOpen : isOpen;
}

export function rowIsOpen(row: Record<string, unknown>, columns: BusinessHoursColumnSet): boolean {
  if (columns.openCol === 'is_open') {
    return Boolean(row.is_open ?? row.isOpen);
  }
  const closed = row.is_closed ?? row.isClosed;
  if (closed === undefined || closed === null) return true;
  return !closed;
}

export function normalizeTimeForDb(value: string): string {
  const trimmed = value.trim();
  if (/^\d{2}:\d{2}:\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{2}:\d{2}$/.test(trimmed)) return `${trimmed}:00`;
  return trimmed;
}

/** Test helper: forget the detected column layout. */
export function resetBusinessHoursColumnCache(): void {
  cachedColumns = null;
}

export { isMissingColumnError, isMissingRelationError };
