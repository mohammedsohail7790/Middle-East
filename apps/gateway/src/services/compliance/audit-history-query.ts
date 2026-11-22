/**
 * Audit history: turns the query string of the history page into one tenant-scoped, fully parameterised query,
 * and turns rows into a CSV a security reviewer can open. No request contents (payload) are ever selected or exported.
 */

export const AUDIT_PAGE_DEFAULT = 50;
export const AUDIT_PAGE_MAX = 200;
export const AUDIT_EXPORT_MAX = 50000;
const TEXT_MAX = 200;

export interface AuditFilters {
  limit: number;
  offset: number;
  from?: Date;
  to?: Date;
  type?: string;
  actor?: string;
}

type RawQuery = Record<string, unknown>;

function text(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim().slice(0, TEXT_MAX);
  return t || undefined;
}

function whole(v: unknown): number | undefined {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : undefined;
}

function day(v: unknown): Date | undefined {
  const t = text(v);
  if (!t) return undefined;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function parseAuditFilters(q: RawQuery): AuditFilters {
  const limitRaw = whole(q.limit);
  const limit = limitRaw && limitRaw > 0 ? Math.min(limitRaw, AUDIT_PAGE_MAX) : AUDIT_PAGE_DEFAULT;
  const offsetRaw = whole(q.offset);
  const offset = offsetRaw && offsetRaw > 0 ? offsetRaw : 0;
  const from = day(q.from);
  const toDay = day(q.to);
  // The end date means "up to and including that day", so the query uses the start of the next day as an exclusive bound.
  const to = toDay ? new Date(Date.UTC(toDay.getUTCFullYear(), toDay.getUTCMonth(), toDay.getUTCDate() + 1)) : undefined;
  return { limit, offset, from, to, type: text(q.type), actor: text(q.actor) };
}

export interface AuditQuery {
  /** Full condition, tenant first. */
  where: string;
  /** Only the optional conditions, each starting with " AND ". Callers write `WHERE tenant_id = $1${and}` so the client filter is visible in the SQL. */
  and: string;
  params: unknown[];
}

export function buildAuditQuery(tenantId: string, f: AuditFilters): AuditQuery {
  const params: unknown[] = [tenantId];
  const parts = ['tenant_id = $1'];
  const add = (sql: (n: number) => string, value: unknown) => {
    params.push(value);
    parts.push(sql(params.length));
  };
  if (f.from) add((n) => `created_at >= $${n}`, f.from);
  if (f.to) add((n) => `created_at < $${n}`, f.to);
  if (f.type) add((n) => `event_type = $${n}`, f.type);
  if (f.actor) {
    const like = `%${f.actor.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    add((n) => `(actor_email ILIKE $${n} OR actor_id::text ILIKE $${n})`, like);
  }
  return { where: parts.join(' AND '), and: parts.slice(1).map((x) => ` AND ${x}`).join(''), params };
}

export interface AuditCsvRow {
  created_at: Date | string;
  event_type: string | null;
  actor_email: string | null;
  actor_id: string | null;
  resource_type: string | null;
  resource_id: string | null;
  ip_address: string | null;
}

const HEADER = ['time', 'event', 'person', 'person_id', 'record_type', 'record_id', 'ip_address'];

function cell(v: unknown): string {
  let s = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : String(v);
  // A cell that starts with = + - @ (or a tab / carriage return) would be run as a formula by Excel and Sheets.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function auditRowsToCsv(rows: AuditCsvRow[]): string {
  const lines = [HEADER.join(',')];
  for (const r of rows) {
    const time = r.created_at instanceof Date ? r.created_at : new Date(r.created_at);
    lines.push(
      [time, r.event_type, r.actor_email, r.actor_id, r.resource_type, r.resource_id, r.ip_address].map(cell).join(',')
    );
  }
  return lines.join('\r\n') + '\r\n';
}
