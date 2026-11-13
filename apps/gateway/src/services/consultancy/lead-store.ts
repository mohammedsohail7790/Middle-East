import type { Pool } from 'pg';
import { logger } from '../logger.js';

/**
 * The consultancy prospects (table consultancy_leads, migration 084). Plain SQL with parameters only; every function takes the pool so tests can pass a stand-in.
 * `recordLead` is the one the public forms call: it never throws and never waits for the database in the caller's path.
 */
type Db = Pick<Pool, 'query'>;

export const LEAD_STATUSES = ['new', 'approved', 'form_sent', 'form_received', 'audit_in_review', 'audit_paid', 'proposal_sent', 'won', 'lost'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
/** The forward path. `lost` is outside it: only a person sets it, and nothing automatic ever moves a lost lead. */
export const STATUS_ORDER: readonly LeadStatus[] = ['new', 'approved', 'form_sent', 'form_received', 'audit_in_review', 'audit_paid', 'proposal_sent', 'won'];
export const LEAD_SOURCES = ['fit_check', 'consult_request', 'manual'] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const isLeadStatus = (v: unknown): v is LeadStatus => typeof v === 'string' && (LEAD_STATUSES as readonly string[]).includes(v);

export interface LeadRow {
  id: string;
  source: LeadSource;
  company: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  answers: Record<string, unknown>;
  status: LeadStatus;
  notes: string | null;
  owner_email: string | null;
  audit_report_id: string | null;
  created_at: string;
  updated_at: string;
}

const COLUMNS = 'id, source, company, contact_name, email, phone, country, answers, status, notes, owner_email, audit_report_id, created_at, updated_at';
// The list leaves the (large) answers out; the detail view loads them.
const LIST_COLUMNS = 'id, source, company, contact_name, email, phone, country, status, notes, owner_email, audit_report_id, created_at, updated_at';

export const MAX_ANSWERS_CHARS = 20_000;
const MAX_ANSWER_VALUE_CHARS = 2_000;

const clean = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim().slice(0, max);
  return t || null;
};

/** The answers as submitted, but never more than MAX_ANSWERS_CHARS: long values are cut first, and if it is still too big only a marker is kept. */
export function capAnswers(answers: unknown): Record<string, unknown> {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return {};
  const raw = answers as Record<string, unknown>;
  if (JSON.stringify(raw).length <= MAX_ANSWERS_CHARS) return raw;
  const cut: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) cut[k] = typeof v === 'string' ? v.slice(0, MAX_ANSWER_VALUE_CHARS) : v;
  return JSON.stringify(cut).length <= MAX_ANSWERS_CHARS ? cut : { _truncated: true };
}

export interface NewLead {
  source: LeadSource;
  company?: string | null;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  country?: string | null;
  answers?: unknown;
  notes?: string | null;
  owner_email?: string | null;
}

export async function createLead(db: Db, l: NewLead): Promise<LeadRow> {
  const r = await db.query(
    `INSERT INTO public.consultancy_leads (source, company, contact_name, email, phone, country, answers, notes, owner_email)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9) RETURNING ${COLUMNS}`,
    [
      l.source,
      clean(l.company, 200),
      clean(l.contact_name, 200),
      clean(l.email, 254)?.toLowerCase() ?? null,
      clean(l.phone, 40),
      clean(l.country, 80),
      JSON.stringify(capAnswers(l.answers)),
      clean(l.notes, 5000),
      clean(l.owner_email, 254)?.toLowerCase() ?? null,
    ],
  );
  return r.rows[0] as LeadRow;
}

export interface ListQuery {
  status?: LeadStatus;
  q?: string;
  limit?: unknown;
  offset?: unknown;
}

export function clampPaging(limit: unknown, offset: unknown): { limit: number; offset: number } {
  const l = Number(limit);
  const o = Number(offset);
  return {
    limit: Number.isFinite(l) && l >= 1 ? Math.min(Math.floor(l), 200) : 50,
    offset: Number.isFinite(o) && o >= 0 ? Math.floor(o) : 0,
  };
}

/** Escapes LIKE wildcards so a search for "50%" finds "50%" and not everything. */
const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export async function listLeads(db: Db, query: ListQuery): Promise<{ items: LeadRow[]; total: number }> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (query.status) {
    params.push(query.status);
    where.push(`status = $${params.length}`);
  }
  const q = query.q?.trim().slice(0, 100);
  if (q) {
    params.push(likePattern(q));
    const i = params.length;
    where.push(`(company ILIKE $${i} OR contact_name ILIKE $${i} OR email ILIKE $${i} OR phone ILIKE $${i})`);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { limit, offset } = clampPaging(query.limit, query.offset);
  const rows = await db.query(
    `SELECT ${LIST_COLUMNS} FROM public.consultancy_leads ${clause} ORDER BY created_at DESC, id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset],
  );
  const total = await db.query(`SELECT count(*)::int AS n FROM public.consultancy_leads ${clause}`, params);
  return { items: rows.rows as LeadRow[], total: Number(total.rows[0]?.n ?? 0) };
}

/** How many leads sit in each status (every status is present, zero included). */
export async function countByStatus(db: Db): Promise<Record<LeadStatus, number>> {
  const r = await db.query(`SELECT status, count(*)::int AS n FROM public.consultancy_leads GROUP BY status`);
  const out = Object.fromEntries(LEAD_STATUSES.map((s) => [s, 0])) as Record<LeadStatus, number>;
  for (const row of r.rows as Array<{ status: string; n: number }>) if (isLeadStatus(row.status)) out[row.status] = Number(row.n);
  return out;
}

export async function getLead(db: Db, id: string): Promise<LeadRow | null> {
  const r = await db.query(`SELECT ${COLUMNS} FROM public.consultancy_leads WHERE id = $1`, [id]);
  return (r.rows[0] as LeadRow | undefined) ?? null;
}

export interface LeadPatch {
  status?: LeadStatus;
  notes?: string | null;
  owner_email?: string | null;
}

/** The team's edit. Only these three fields can change; anything not given stays as it is. Returns null for an unknown id. */
export async function updateLead(db: Db, id: string, patch: LeadPatch): Promise<LeadRow | null> {
  const sets: string[] = [];
  const params: unknown[] = [id];
  if (patch.status !== undefined) {
    params.push(patch.status);
    sets.push(`status = $${params.length}`);
  }
  if (patch.notes !== undefined) {
    params.push(clean(patch.notes, 5000));
    sets.push(`notes = $${params.length}`);
  }
  if (patch.owner_email !== undefined) {
    params.push(clean(patch.owner_email, 254)?.toLowerCase() ?? null);
    sets.push(`owner_email = $${params.length}`);
  }
  if (!sets.length) return getLead(db, id);
  const r = await db.query(`UPDATE public.consultancy_leads SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 RETURNING ${COLUMNS}`, params);
  return (r.rows[0] as LeadRow | undefined) ?? null;
}

/**
 * The audit flow calls this as a client moves along. It moves the client's newest lead FORWARD only: never backwards, never sideways, never off `lost`.
 * Returns true when a lead was moved. A target outside the forward path (`lost`) never moves anything.
 */
export async function markLeadStatusByEmail(db: Db, email: string, status: LeadStatus): Promise<boolean> {
  const e = clean(email, 254)?.toLowerCase();
  if (!e || !STATUS_ORDER.includes(status)) return false;
  const r = await db.query(
    `UPDATE public.consultancy_leads SET status = $2, updated_at = now()
     WHERE id = (
       SELECT id FROM public.consultancy_leads
       WHERE lower(email) = $1 AND status <> 'lost'
         AND array_position($3::text[], status) < array_position($3::text[], $2)
       ORDER BY created_at DESC LIMIT 1
     )`,
    [e, status, [...STATUS_ORDER]],
  );
  return (r.rowCount ?? 0) > 0;
}

/** For the audit flow: call it and forget it. Any failure is logged without the client's details and swallowed. */
export async function markLeadStatusSafe(db: Db, email: string, status: LeadStatus): Promise<void> {
  try {
    await markLeadStatusByEmail(db, email, status);
  } catch {
    logger.error(`[Leads] Could not move a lead to ${status}`);
  }
}

/**
 * For the public forms: stores the lead in the background. Never throws, and the caller does not wait for it (use `void recordLead(...)`).
 * A failure is logged with the source only, never the person's details.
 */
export async function recordLead(lead: NewLead, db?: Db): Promise<void> {
  try {
    const pool = db ?? (await import('../db/pool.js')).pool;
    await createLead(pool, lead);
  } catch (error) {
    logger.error(`[Leads] Could not save a ${lead.source} lead`, undefined, error instanceof Error ? new Error(error.name) : undefined);
  }
}

export interface AuditSummary {
  id: string;
  company: string;
  status: string;
  currency: string;
  lang: string;
  summary: string | null;
  fee_aed: number | null;
  approved_at: string | null;
  paid_at: string | null;
  delivered_at: string | null;
  created_at: string;
}

/** A short view of the client's newest audit report, found by email (the audit table keeps its own text ids). Null when there is none. */
export async function getAuditSummaryByEmail(db: Db, email: string | null): Promise<AuditSummary | null> {
  const e = clean(email, 254)?.toLowerCase();
  if (!e) return null;
  const r = await db.query(
    `SELECT id, company, status, currency, lang, report->>'summary' AS summary, (report->'investment'->>'feeAed')::numeric AS fee_aed,
            approved_at, paid_at, delivered_at, created_at
     FROM public.audit_reports WHERE lower(email) = $1 ORDER BY created_at DESC LIMIT 1`,
    [e],
  );
  const row = r.rows[0];
  if (!row) return null;
  return { ...row, fee_aed: row.fee_aed === null || row.fee_aed === undefined ? null : Number(row.fee_aed) } as AuditSummary;
}
