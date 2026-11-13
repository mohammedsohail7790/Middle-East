import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { AUDIT_CURRENCIES, isAuditCurrency, type AuditCurrency } from '../audit/audit-pricing.js';

/**
 * Build proposals: a fixed price per item, valid for 30 days, accepted in writing by the client. All SQL here is parameterized.
 * Amounts are in the smallest unit of the currency (the same convention as the audit payment: hundredths, or thousandths for KWD, BHD and OMR).
 * Once a proposal leaves `draft`, its terms never change, so the fingerprint stored at acceptance always matches what the client saw.
 */
type Db = Pick<Pool, 'query'>;

export type ProposalStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'expired' | 'withdrawn';
export const PROPOSAL_STATUSES: readonly ProposalStatus[] = ['draft', 'sent', 'accepted', 'declined', 'expired', 'withdrawn'];

export interface ProposalItem {
  title: string;
  priceMinor: number;
}

export interface ProposalRow {
  id: string;
  lead_id: string;
  title: string;
  scope: string;
  items: ProposalItem[];
  currency: AuditCurrency;
  total_minor: number;
  delivery_weeks: number | null;
  valid_until: Date | string;
  language: 'en' | 'ar';
  status: ProposalStatus;
  sent_at: Date | string | null;
  accepted_at: Date | string | null;
  accepted_name: string | null;
  accepted_ip: string | null;
  accepted_user_agent: string | null;
  terms_hash: string | null;
  declined_reason: string | null;
  created_by: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface ProposalInput {
  leadId?: string;
  title?: unknown;
  scope?: unknown;
  items?: unknown;
  currency?: unknown;
  deliveryWeeks?: unknown;
  language?: unknown;
  validUntil?: unknown;
}

export const DEFAULT_VALID_DAYS = 30;
const MAX_TITLE = 200;
const MAX_SCOPE = 20000;
const MAX_ITEMS = 40;
/** AED 60,000 is the top of the marketing range; a proposal can go well past it (several items) but never absurdly. */
const MAX_TOTAL_AED_MINOR = 100_000_000; // AED 1,000,000

const THREE_DECIMALS = new Set<string>(['KWD', 'BHD', 'OMR']);
export const minorPerUnit = (currency: string): number => (THREE_DECIMALS.has(currency) ? 1000 : 100);
export const maxTotalMinor = (currency: string): number => MAX_TOTAL_AED_MINOR * (minorPerUnit(currency) / 100);

export class ProposalValidationError extends Error {}

export interface CleanProposal {
  title: string;
  scope: string;
  items: ProposalItem[];
  currency: AuditCurrency;
  totalMinor: number;
  deliveryWeeks: number | null;
  language: 'en' | 'ar';
  validUntil: Date;
}

const bad = (m: string): never => {
  throw new ProposalValidationError(m);
};

/** Checks and tidies the fields of a proposal. `fallback` supplies the values an update leaves unchanged. */
export function cleanProposal(input: ProposalInput, fallback?: Partial<CleanProposal>, now: Date = new Date()): CleanProposal {
  const title = String(input.title ?? fallback?.title ?? '').trim();
  if (!title) bad('A title is required.');
  if (title.length > MAX_TITLE) bad(`The title can be at most ${MAX_TITLE} characters.`);
  const scope = String(input.scope ?? fallback?.scope ?? '').trim();
  if (scope.length > MAX_SCOPE) bad(`The scope can be at most ${MAX_SCOPE} characters.`);

  const currencyRaw = input.currency ?? fallback?.currency ?? 'AED';
  if (!isAuditCurrency(currencyRaw)) bad(`The currency must be one of ${AUDIT_CURRENCIES.join(', ')}.`);
  const currency = currencyRaw as AuditCurrency;

  const rawItems = input.items ?? fallback?.items;
  if (!Array.isArray(rawItems) || rawItems.length === 0) bad('Add at least one item with a price.');
  if ((rawItems as unknown[]).length > MAX_ITEMS) bad(`A proposal can have at most ${MAX_ITEMS} items.`);
  const items: ProposalItem[] = (rawItems as unknown[]).map((it, i) => {
    const o = (it ?? {}) as Record<string, unknown>;
    const t = String(o.title ?? '').trim();
    if (!t) bad(`Item ${i + 1} needs a title.`);
    if (t.length > MAX_TITLE) bad(`Item ${i + 1}: the title can be at most ${MAX_TITLE} characters.`);
    const price = Number(o.priceMinor);
    if (!Number.isInteger(price) || price <= 0) bad(`Item ${i + 1} needs a price above zero.`);
    return { title: t, priceMinor: price };
  });
  const totalMinor = items.reduce((s, it) => s + it.priceMinor, 0);
  if (!Number.isSafeInteger(totalMinor) || totalMinor > maxTotalMinor(currency)) bad('The total is above the allowed maximum.');

  let deliveryWeeks: number | null = fallback?.deliveryWeeks ?? null;
  if (input.deliveryWeeks !== undefined) {
    if (input.deliveryWeeks === null || input.deliveryWeeks === '') deliveryWeeks = null;
    else {
      const w = Number(input.deliveryWeeks);
      if (!Number.isInteger(w) || w < 1 || w > 104) bad('Delivery weeks must be a whole number from 1 to 104.');
      deliveryWeeks = w;
    }
  }

  const languageRaw = input.language ?? fallback?.language ?? 'en';
  if (languageRaw !== 'en' && languageRaw !== 'ar') bad('The language must be en or ar.');
  const language = languageRaw as 'en' | 'ar';

  let validUntil = fallback?.validUntil ?? new Date(now.getTime() + DEFAULT_VALID_DAYS * 86400_000);
  if (input.validUntil !== undefined && input.validUntil !== null && input.validUntil !== '') {
    const d = new Date(String(input.validUntil));
    if (Number.isNaN(d.getTime())) bad('The valid-until date is not a date.');
    if (d.getTime() <= now.getTime()) bad('The valid-until date must be in the future.');
    validUntil = d;
  }
  return { title, scope, items, currency, totalMinor, deliveryWeeks, language, validUntil };
}

const asDate = (v: Date | string): Date => (v instanceof Date ? v : new Date(v));

/**
 * The fingerprint of the exact terms a client saw: SHA-256 of a canonical JSON (fixed key order, valid_until as an ISO instant).
 * Stored at acceptance so the team can show later that the client agreed to these words and this price.
 */
export function termsHash(p: Pick<ProposalRow, 'title' | 'scope' | 'items' | 'total_minor' | 'currency' | 'delivery_weeks' | 'valid_until'>): string {
  const canonical = JSON.stringify({
    title: p.title,
    scope: p.scope,
    items: (p.items ?? []).map((i) => ({ title: i.title, priceMinor: Number(i.priceMinor) })),
    total_minor: Number(p.total_minor),
    currency: p.currency,
    delivery_weeks: p.delivery_weeks === null || p.delivery_weeks === undefined ? null : Number(p.delivery_weeks),
    valid_until: asDate(p.valid_until).toISOString(),
  });
  return createHash('sha256').update(canonical).digest('hex');
}

/** Rows come back from pg with BIGINT as text; make the numbers numbers. */
function shape(r: ProposalRow | undefined): ProposalRow | null {
  if (!r) return null;
  return { ...r, total_minor: Number(r.total_minor), delivery_weeks: r.delivery_weeks === null || r.delivery_weeks === undefined ? null : Number(r.delivery_weeks) };
}

/** Sent proposals whose date has passed become `expired`. Run before reading, so nobody ever sees or accepts a stale one. */
export async function expireOverdue(db: Db, id?: string): Promise<void> {
  if (id) {
    await db.query(`UPDATE consultancy_proposals SET status = 'expired', updated_at = now() WHERE id = $1 AND status = 'sent' AND valid_until <= now()`, [id]);
  } else {
    await db.query(`UPDATE consultancy_proposals SET status = 'expired', updated_at = now() WHERE status = 'sent' AND valid_until <= now()`);
  }
}

export async function createDraft(db: Db, leadId: string, input: ProposalInput, createdBy: string | null): Promise<ProposalRow> {
  const c = cleanProposal(input);
  const r = await db.query(
    `INSERT INTO consultancy_proposals (lead_id, title, scope, items, currency, total_minor, delivery_weeks, valid_until, language, status, created_by)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, 'draft', $10) RETURNING *`,
    [leadId, c.title, c.scope, JSON.stringify(c.items), c.currency, c.totalMinor, c.deliveryWeeks, c.validUntil.toISOString(), c.language, createdBy],
  );
  return shape(r.rows[0])!;
}

export async function getProposal(db: Db, id: string): Promise<ProposalRow | null> {
  await expireOverdue(db, id);
  const r = await db.query(`SELECT * FROM consultancy_proposals WHERE id = $1`, [id]);
  return shape(r.rows[0]);
}

export async function listProposals(db: Db, filter: { leadId?: string; status?: string } = {}): Promise<ProposalRow[]> {
  await expireOverdue(db);
  const r = await db.query(
    `SELECT * FROM consultancy_proposals WHERE ($1::uuid IS NULL OR lead_id = $1::uuid) AND ($2::text IS NULL OR status = $2::text) ORDER BY created_at DESC LIMIT 200`,
    [filter.leadId ?? null, filter.status ?? null],
  );
  return r.rows.map((row: ProposalRow) => shape(row)!);
}

/** Edits a draft. Returns null if the proposal is missing or is no longer a draft. */
export async function updateDraft(db: Db, id: string, input: ProposalInput): Promise<ProposalRow | null> {
  const current = await getProposal(db, id);
  if (!current || current.status !== 'draft') return null;
  const c = cleanProposal(input, {
    title: current.title,
    scope: current.scope,
    items: current.items,
    currency: current.currency,
    deliveryWeeks: current.delivery_weeks,
    language: current.language,
    validUntil: asDate(current.valid_until),
  });
  const r = await db.query(
    `UPDATE consultancy_proposals SET title = $2, scope = $3, items = $4::jsonb, currency = $5, total_minor = $6, delivery_weeks = $7, valid_until = $8, language = $9, updated_at = now()
     WHERE id = $1 AND status = 'draft' RETURNING *`,
    [id, c.title, c.scope, JSON.stringify(c.items), c.currency, c.totalMinor, c.deliveryWeeks, c.validUntil.toISOString(), c.language],
  );
  return shape(r.rows[0]);
}

/** draft -> sent. A draft whose validity date has already passed cannot be sent. Returns null when it is not a sendable draft. */
export async function markSent(db: Db, id: string): Promise<ProposalRow | null> {
  const r = await db.query(
    `UPDATE consultancy_proposals SET status = 'sent', sent_at = now(), updated_at = now() WHERE id = $1 AND status = 'draft' AND valid_until > now() RETURNING *`,
    [id],
  );
  return shape(r.rows[0]);
}

/** Puts a just-sent proposal back to draft when the email could not be delivered, so the team can retry. */
export async function revertToDraft(db: Db, id: string): Promise<void> {
  await db.query(`UPDATE consultancy_proposals SET status = 'draft', sent_at = NULL, updated_at = now() WHERE id = $1 AND status = 'sent'`, [id]);
}

/** Withdraws a draft or sent proposal. An accepted one cannot be withdrawn. */
export async function withdraw(db: Db, id: string): Promise<ProposalRow | null> {
  const r = await db.query(
    `UPDATE consultancy_proposals SET status = 'withdrawn', updated_at = now() WHERE id = $1 AND status IN ('draft', 'sent') RETURNING *`,
    [id],
  );
  return shape(r.rows[0]);
}

export type AcceptResult =
  | { ok: true; proposal: ProposalRow; first: boolean }
  | { ok: false; reason: 'not-found' | 'declined' | 'withdrawn' | 'expired' | 'not-sent' };

/**
 * Records the client's acceptance. The update only matches a `sent`, unexpired proposal, so two clicks at once cannot both win: the second finds it
 * already accepted and gets the first acceptance back (`first: false`), never a second record.
 */
export async function recordAcceptance(db: Db, id: string, evidence: { name: string; ip: string | null; userAgent: string | null }): Promise<AcceptResult> {
  await expireOverdue(db, id);
  const current = await db.query(`SELECT * FROM consultancy_proposals WHERE id = $1`, [id]);
  const row = shape(current.rows[0]);
  if (!row) return { ok: false, reason: 'not-found' };
  if (row.status === 'accepted') return { ok: true, proposal: row, first: false };
  if (row.status !== 'sent') {
    return { ok: false, reason: row.status === 'declined' ? 'declined' : row.status === 'withdrawn' ? 'withdrawn' : row.status === 'expired' ? 'expired' : 'not-sent' };
  }
  const hash = termsHash(row);
  const r = await db.query(
    `UPDATE consultancy_proposals SET status = 'accepted', accepted_at = now(), accepted_name = $2, accepted_ip = $3, accepted_user_agent = $4, terms_hash = $5, updated_at = now()
     WHERE id = $1 AND status = 'sent' AND valid_until > now() RETURNING *`,
    [id, evidence.name, evidence.ip, evidence.userAgent, hash],
  );
  const won = shape(r.rows[0]);
  if (won) return { ok: true, proposal: won, first: true };
  // Lost a race (or it expired in the meantime): report whatever it is now.
  const again = shape((await db.query(`SELECT * FROM consultancy_proposals WHERE id = $1`, [id])).rows[0]);
  if (again?.status === 'accepted') return { ok: true, proposal: again, first: false };
  return { ok: false, reason: again?.status === 'declined' ? 'declined' : again?.status === 'withdrawn' ? 'withdrawn' : 'expired' };
}

export type DeclineResult = { ok: true; proposal: ProposalRow; first: boolean } | { ok: false; reason: 'not-found' | 'accepted' | 'withdrawn' | 'expired' | 'not-sent' };

export async function recordDecline(db: Db, id: string, reason: string | null): Promise<DeclineResult> {
  await expireOverdue(db, id);
  const r = await db.query(
    `UPDATE consultancy_proposals SET status = 'declined', declined_reason = $2, updated_at = now() WHERE id = $1 AND status = 'sent' AND valid_until > now() RETURNING *`,
    [id, reason],
  );
  const done = shape(r.rows[0]);
  if (done) return { ok: true, proposal: done, first: true };
  const row = shape((await db.query(`SELECT * FROM consultancy_proposals WHERE id = $1`, [id])).rows[0]);
  if (!row) return { ok: false, reason: 'not-found' };
  if (row.status === 'declined') return { ok: true, proposal: row, first: false };
  return { ok: false, reason: row.status === 'accepted' ? 'accepted' : row.status === 'withdrawn' ? 'withdrawn' : row.status === 'expired' ? 'expired' : 'not-sent' };
}
