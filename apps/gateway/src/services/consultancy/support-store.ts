import type { Pool } from 'pg';

/**
 * Monthly support plans and the hours worked on them (tables consultancy_support_plans and consultancy_support_hours, migration 084).
 * Plain SQL with parameters; every function takes the pool so tests can pass a stand-in. Money is whole minor units (fils for AED), never floats.
 * Hours are NUMERIC in the database; sums are done in hundredths of an hour (whole numbers) so 0.1 + 0.2 never drifts.
 */
export const SUPPORT_KINDS = ['standard', 'extended', 'partner', 'training'] as const;
export type SupportKind = (typeof SUPPORT_KINDS)[number];
export const SUPPORT_STATUSES = ['pending', 'active', 'past_due', 'cancelled'] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

/** AED 750 for 4 hours, AED 1,000 for 6 hours. Partner and training prices are set by the team, never below AED 5,000. */
export const KIND_DEFAULTS = {
  standard: { priceMinor: 75000, hours: 4 },
  extended: { priceMinor: 100000, hours: 6 },
} as const;
export const MIN_TEAM_PRICE_MINOR = 500000;
export const MAX_HOURS_PER_ENTRY = 24;
export const DUBAI_TZ = 'Asia/Dubai';

type Db = Pick<Pool, 'query'>;

export class SupportError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export interface SupportPlan {
  id: string;
  lead_id: string;
  project_id: string | null;
  kind: SupportKind;
  currency: string;
  price_minor: number;
  hours_included: number;
  status: SupportStatus;
  stripe_checkout_session_id: string | null;
  stripe_subscription_id: string | null;
  started_on: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  company?: string | null;
  contact_name?: string | null;
  email?: string | null;
}

export interface HoursEntry {
  id: string;
  support_plan_id: string;
  worked_on: string;
  hours: number;
  note: string | null;
  logged_by: string | null;
  created_at: string;
}

export interface Usage {
  month: string;
  usedHours: number;
  includedHours: number;
  percent: number;
  over: boolean;
}

const PLAN_COLUMNS = `p.id, p.lead_id, p.project_id, p.kind, p.currency, p.price_minor, p.hours_included, p.status, p.stripe_checkout_session_id,
  p.stripe_subscription_id, p.started_on, p.cancelled_at, p.created_at, p.updated_at, l.company, l.contact_name, l.email`;
const PLAN_FROM = `FROM public.consultancy_support_plans p LEFT JOIN public.consultancy_leads l ON l.id = p.lead_id`;

const dateText = (v: unknown): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
};
const centi = (v: unknown): number => Math.round(Number(v) * 100);
const fromCenti = (c: number): number => c / 100;

function toPlan(r: any): SupportPlan {
  return {
    ...r,
    price_minor: Number(r.price_minor),
    hours_included: Number(r.hours_included),
    started_on: dateText(r.started_on),
  };
}
const toEntry = (r: any): HoursEntry => ({ ...r, hours: Number(r.hours), worked_on: dateText(r.worked_on) as string });

/** The calendar date in Dubai (UTC+4, no daylight saving) for an instant, as YYYY-MM-DD. */
export function dubaiDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: DUBAI_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
/** The calendar month in Dubai, as YYYY-MM. */
export const dubaiMonth = (now: Date = new Date()): string => dubaiDate(now).slice(0, 7);

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
/** First day of the month and first day of the next, as YYYY-MM-DD. worked_on is already a Dubai calendar date, so no time zone maths is needed in SQL. */
export function monthBounds(month: string): { from: string; to: string } {
  if (!MONTH_RE.test(month)) throw new SupportError('Month must look like 2026-11');
  const [y, m] = month.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  return { from: `${month}-01`, to: `${next}-01` };
}

export interface CreatePlanInput {
  leadId: string;
  kind: unknown;
  priceMinor?: unknown;
  hoursIncluded?: unknown;
  projectId?: unknown;
}

const isWhole = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v);

/** Works out the price and hours for a plan kind, or throws SupportError. Standard and extended have fixed terms; partner and training are set by the team. */
export function resolveTerms(input: Pick<CreatePlanInput, 'kind' | 'priceMinor' | 'hoursIncluded'>): { kind: SupportKind; priceMinor: number; hours: number } {
  const kind = input.kind as SupportKind;
  if (!SUPPORT_KINDS.includes(kind)) throw new SupportError('Kind must be standard, extended, partner or training');
  if (kind === 'standard' || kind === 'extended') {
    const d = KIND_DEFAULTS[kind];
    const priceMinor = input.priceMinor === undefined ? d.priceMinor : input.priceMinor;
    if (!isWhole(priceMinor) || priceMinor <= 0) throw new SupportError('Price must be a whole number of minor units');
    const hours = input.hoursIncluded === undefined ? d.hours : Number(input.hoursIncluded);
    if (!Number.isFinite(hours) || hours <= 0 || hours > 1000) throw new SupportError('Hours included must be more than 0');
    return { kind, priceMinor, hours };
  }
  if (!isWhole(input.priceMinor) || input.priceMinor < MIN_TEAM_PRICE_MINOR) {
    throw new SupportError(`The ${kind} price must be at least AED 5,000 (${MIN_TEAM_PRICE_MINOR} minor units)`);
  }
  if (kind === 'training') return { kind, priceMinor: input.priceMinor, hours: 0 };
  const hours = Number(input.hoursIncluded);
  if (input.hoursIncluded === undefined || !Number.isFinite(hours) || hours <= 0 || hours > 1000) throw new SupportError('Set the monthly hours included for a partner plan');
  return { kind, priceMinor: input.priceMinor, hours };
}

export async function createPlan(pool: Db, input: CreatePlanInput): Promise<SupportPlan> {
  const terms = resolveTerms(input);
  const lead = await pool.query(
    `SELECT l.id, r.currency FROM public.consultancy_leads l LEFT JOIN public.audit_reports r ON r.id = l.audit_report_id WHERE l.id = $1`,
    [input.leadId],
  );
  if (!lead.rows[0]) throw new SupportError('Lead not found', 404);
  const currency = /^[A-Z]{3}$/.test(String(lead.rows[0].currency ?? '')) ? String(lead.rows[0].currency) : 'AED';
  const projectId = typeof input.projectId === 'string' && input.projectId ? input.projectId : null;
  const ins = await pool.query(
    `INSERT INTO public.consultancy_support_plans (lead_id, project_id, kind, currency, price_minor, hours_included)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [input.leadId, projectId, terms.kind, currency, terms.priceMinor, terms.hours],
  );
  const plan = await getPlan(pool, ins.rows[0].id);
  return plan as SupportPlan;
}

export async function getPlan(pool: Db, id: string): Promise<SupportPlan | null> {
  const r = await pool.query(`SELECT ${PLAN_COLUMNS} ${PLAN_FROM} WHERE p.id = $1`, [id]);
  return r.rows[0] ? toPlan(r.rows[0]) : null;
}

export async function listPlans(pool: Db): Promise<SupportPlan[]> {
  const r = await pool.query(`SELECT ${PLAN_COLUMNS} ${PLAN_FROM} ORDER BY p.created_at DESC LIMIT 500`);
  return r.rows.map(toPlan);
}

export async function getPlanBySubscription(pool: Db, subscriptionId: string): Promise<SupportPlan | null> {
  const r = await pool.query(`SELECT ${PLAN_COLUMNS} ${PLAN_FROM} WHERE p.stripe_subscription_id = $1`, [subscriptionId]);
  return r.rows[0] ? toPlan(r.rows[0]) : null;
}

export async function listHours(pool: Db, planId: string): Promise<HoursEntry[]> {
  const r = await pool.query(
    `SELECT id, support_plan_id, worked_on, hours, note, logged_by, created_at FROM public.consultancy_support_hours WHERE support_plan_id = $1 ORDER BY worked_on DESC, created_at DESC`,
    [planId],
  );
  return r.rows.map(toEntry);
}

export interface LogHoursResult {
  entry: HoursEntry;
  usage: Usage;
  /** Which thresholds this very entry pushed the month across: 80 (reached 80%) and/or 100 (reached the full amount). */
  crossed: Array<80 | 100>;
}

export function buildUsage(month: string, usedCenti: number, includedHours: number): Usage {
  const includedCenti = centi(includedHours);
  const percent = includedCenti > 0 ? Math.round((usedCenti * 100) / includedCenti) : usedCenti > 0 ? 100 : 0;
  return { month, usedHours: fromCenti(usedCenti), includedHours: fromCenti(includedCenti), percent, over: usedCenti > includedCenti };
}

async function usedCentiIn(pool: Db, planId: string, month: string): Promise<number> {
  const { from, to } = monthBounds(month);
  const r = await pool.query(
    `SELECT COALESCE(SUM(hours), 0) AS used FROM public.consultancy_support_hours WHERE support_plan_id = $1 AND worked_on >= $2::date AND worked_on < $3::date`,
    [planId, from, to],
  );
  return centi(r.rows[0]?.used ?? 0);
}

/** Hours used against hours included for one calendar month in Dubai (default: the current one). */
export async function usageFor(pool: Db, planId: string, month: string = dubaiMonth(), plan?: SupportPlan): Promise<Usage> {
  const p = plan ?? (await getPlan(pool, planId));
  if (!p) throw new SupportError('Plan not found', 404);
  return buildUsage(month, await usedCentiIn(pool, planId, month), p.hours_included);
}

export interface LogHoursInput {
  hours: unknown;
  workedOn?: unknown;
  note?: unknown;
  loggedBy?: string;
}

export async function logHours(pool: Db, planId: string, input: LogHoursInput, now: Date = new Date()): Promise<LogHoursResult> {
  const hours = input.hours;
  if (typeof hours !== 'number' || !Number.isFinite(hours) || hours <= 0) throw new SupportError('Hours must be more than 0');
  if (hours > MAX_HOURS_PER_ENTRY) throw new SupportError(`One entry can be at most ${MAX_HOURS_PER_ENTRY} hours`);
  if (Math.abs(hours * 100 - Math.round(hours * 100)) > 1e-6) throw new SupportError('Hours can have at most two decimals');
  const today = dubaiDate(now);
  const workedOn = input.workedOn === undefined || input.workedOn === '' ? today : String(input.workedOn);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(workedOn) || Number.isNaN(Date.parse(workedOn)) || new Date(workedOn).toISOString().slice(0, 10) !== workedOn) throw new SupportError('Worked on must be a date like 2026-11-05');
  if (workedOn > today) throw new SupportError('Worked on cannot be in the future');
  const note = typeof input.note === 'string' && input.note.trim() ? input.note.trim().slice(0, 1000) : null;
  const plan = await getPlan(pool, planId);
  if (!plan) throw new SupportError('Plan not found', 404);
  if (plan.status === 'cancelled') throw new SupportError('This plan is cancelled', 409);
  const month = workedOn.slice(0, 7);
  const before = await usedCentiIn(pool, planId, month);
  const ins = await pool.query(
    `INSERT INTO public.consultancy_support_hours (support_plan_id, worked_on, hours, note, logged_by) VALUES ($1, $2::date, $3, $4, $5)
     RETURNING id, support_plan_id, worked_on, hours, note, logged_by, created_at`,
    [planId, workedOn, hours, note, input.loggedBy ?? null],
  );
  const after = before + centi(hours);
  const includedCenti = centi(plan.hours_included);
  const crossed: Array<80 | 100> = [];
  // Only a plan with hours alerts, and only the entry that makes the crossing: before was under the line, after is at or over it.
  // Back-dated entries for an earlier month do not alert. This is the no-schema-change dedupe; deleting an entry and logging again can alert again.
  if (includedCenti > 0 && month === dubaiMonth(now)) {
    if (before * 100 < includedCenti * 80 && after * 100 >= includedCenti * 80) crossed.push(80);
    if (before < includedCenti && after >= includedCenti) crossed.push(100);
  }
  return { entry: toEntry(ins.rows[0]), usage: buildUsage(month, after, plan.hours_included), crossed };
}

/** Removes a mistaken entry. Returns false when that entry does not belong to that plan. */
export async function deleteHours(pool: Db, planId: string, hourId: string): Promise<boolean> {
  const r = await pool.query(`DELETE FROM public.consultancy_support_hours WHERE id = $1 AND support_plan_id = $2`, [hourId, planId]);
  return (r.rowCount ?? 0) > 0;
}

export async function setStatus(
  pool: Db,
  planId: string,
  status: SupportStatus,
  extra: { subscriptionId?: string; startedOn?: boolean } = {},
): Promise<SupportPlan | null> {
  if (!SUPPORT_STATUSES.includes(status)) throw new SupportError('Unknown status');
  const r = await pool.query(
    `UPDATE public.consultancy_support_plans
        SET status = $2,
            stripe_subscription_id = COALESCE($3, stripe_subscription_id),
            started_on = CASE WHEN $4::boolean THEN COALESCE(started_on, $5::date) ELSE started_on END,
            cancelled_at = CASE WHEN $2 = 'cancelled' THEN COALESCE(cancelled_at, now()) ELSE cancelled_at END,
            updated_at = now()
      WHERE id = $1 RETURNING id`,
    [planId, status, extra.subscriptionId ?? null, !!extra.startedOn, dubaiDate()],
  );
  return r.rows[0] ? getPlan(pool, planId) : null;
}

export async function setCheckoutSession(pool: Db, planId: string, sessionId: string): Promise<void> {
  await pool.query(`UPDATE public.consultancy_support_plans SET stripe_checkout_session_id = $2, updated_at = now() WHERE id = $1`, [planId, sessionId]);
}

/** The months to show for a plan: the current one and the previous `back` months, newest first. */
export function recentMonths(now: Date = new Date(), back = 5): string[] {
  let [y, m] = dubaiMonth(now).split('-').map(Number);
  const out: string[] = [];
  for (let i = 0; i <= back; i++) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  return out;
}
