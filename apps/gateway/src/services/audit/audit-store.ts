import type { Pool } from 'pg';
import type { Assessment } from './audit-estimate.js';
import type { AuditReport } from './audit-report.js';

/**
 * One row per paid audit (table audit_reports, migration 080). Everything is plain SQL with parameters; the functions take the pool so tests can pass a stand-in.
 * Status moves one way: submitted -> in_review -> approved -> paid -> delivered. A failed draft or a failed delivery has its own status so the team can see it.
 */
export type AuditStatus = 'submitted' | 'draft_failed' | 'in_review' | 'approved' | 'paid' | 'delivered' | 'delivery_failed';

export interface AuditRow {
  id: string;
  company: string;
  email: string;
  contact_name: string | null;
  currency: string;
  lang: 'en' | 'ar';
  answers: Record<string, string>;
  report: AuditReport | null;
  assessment: Assessment | null;
  status: AuditStatus;
  approved_at: string | null;
  paid_at: string | null;
  delivered_at: string | null;
}

const COLUMNS = 'id, company, email, contact_name, currency, lang, answers, report, assessment, status, approved_at, paid_at, delivered_at';

export async function saveSubmission(
  pool: Pick<Pool, 'query'>,
  s: { id: string; company: string; email: string; name?: string; currency: string; lang: 'en' | 'ar'; answers: Record<string, string> },
): Promise<void> {
  // Submitting again (the client fixes an answer) replaces the answers and starts the draft over, unless the audit is already approved or paid.
  await pool.query(
    `INSERT INTO public.audit_reports (id, company, email, contact_name, currency, lang, answers)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     ON CONFLICT (id) DO UPDATE
       SET answers = EXCLUDED.answers, lang = EXCLUDED.lang, contact_name = EXCLUDED.contact_name, updated_at = now(),
           status = CASE WHEN public.audit_reports.status IN ('approved', 'paid', 'delivered', 'delivery_failed') THEN public.audit_reports.status ELSE 'submitted' END`,
    [s.id, s.company, s.email, s.name ?? null, s.currency, s.lang, JSON.stringify(s.answers)],
  );
}

export async function getAudit(pool: Pick<Pool, 'query'>, id: string): Promise<AuditRow | null> {
  const r = await pool.query(`SELECT ${COLUMNS} FROM public.audit_reports WHERE id = $1`, [id]);
  return (r.rows[0] as AuditRow | undefined) ?? null;
}

export async function saveDraft(pool: Pick<Pool, 'query'>, id: string, report: AuditReport, assessment: Assessment): Promise<void> {
  await pool.query(
    `UPDATE public.audit_reports SET report = $2::jsonb, assessment = $3::jsonb, status = 'in_review', updated_at = now()
     WHERE id = $1 AND status IN ('submitted', 'draft_failed', 'in_review')`,
    [id, JSON.stringify(report), JSON.stringify(assessment)],
  );
}

export async function markDraftFailed(pool: Pick<Pool, 'query'>, id: string): Promise<void> {
  await pool.query(`UPDATE public.audit_reports SET status = 'draft_failed', updated_at = now() WHERE id = $1 AND status IN ('submitted', 'draft_failed')`, [id]);
}

/** The team's edits. Allowed only while the audit is still in review. Returns false when it was not saved (wrong status, unknown id). */
export async function saveEdits(pool: Pick<Pool, 'query'>, id: string, report: AuditReport): Promise<boolean> {
  const r = await pool.query(
    `UPDATE public.audit_reports SET report = $2::jsonb, updated_at = now() WHERE id = $1 AND status = 'in_review'`,
    [id, JSON.stringify(report)],
  );
  return (r.rowCount ?? 0) > 0;
}

/** Approve once. Returns false when it was already approved (or is not in review), so a second click does nothing. */
export async function approve(pool: Pick<Pool, 'query'>, id: string): Promise<boolean> {
  const r = await pool.query(
    `UPDATE public.audit_reports SET status = 'approved', approved_at = now(), updated_at = now() WHERE id = $1 AND status = 'in_review' AND report IS NOT NULL`,
    [id],
  );
  return (r.rowCount ?? 0) > 0;
}

/**
 * Record the payment. The money is always recorded (paid_at). The status moves to 'paid', which is what triggers delivery, only when the team has approved the report
 * (or delivery failed before and is being retried). A payment that arrives before approval is kept and waits; approving later delivers it. A delivered audit is left alone.
 */
export async function markPaid(pool: Pick<Pool, 'query'>, id: string): Promise<AuditRow | null> {
  const r = await pool.query(
    `UPDATE public.audit_reports
     SET paid_at = COALESCE(paid_at, now()),
         status = CASE WHEN status IN ('approved', 'paid', 'delivery_failed') THEN 'paid' ELSE status END,
         updated_at = now()
     WHERE id = $1 AND status <> 'delivered' RETURNING ${COLUMNS}`,
    [id],
  );
  return (r.rows[0] as AuditRow | undefined) ?? null;
}

export async function markDelivered(pool: Pick<Pool, 'query'>, id: string, ok: boolean): Promise<void> {
  await pool.query(
    ok
      ? `UPDATE public.audit_reports SET status = 'delivered', delivered_at = now(), updated_at = now() WHERE id = $1 AND status IN ('paid', 'delivery_failed')`
      : `UPDATE public.audit_reports SET status = 'delivery_failed', updated_at = now() WHERE id = $1 AND status = 'paid'`,
    [id],
  );
}
