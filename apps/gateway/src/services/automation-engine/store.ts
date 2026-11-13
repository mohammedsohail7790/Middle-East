import type {
  ApprovalMode, ApprovalStatus, AutomationApproval, AutomationRun, RunStatus, StepLogEntry, TenantAutomation,
} from './types.js';

/** All reads and writes for the automation engine. Every query is scoped by tenant id, so one business can never see or change another's automations, runs or approvals. */
export interface Db {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
}

const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));
const isoOrNull = (v: unknown): string | null => (v == null ? null : iso(v));

export function toAutomation(r: any): TenantAutomation {
  return {
    id: r.id, tenantId: r.tenant_id, templateKey: r.template_key, name: r.name, enabled: !!r.enabled,
    approvalMode: r.approval_mode, config: r.config ?? {}, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
  };
}
export function toRun(r: any): AutomationRun {
  return {
    id: r.id, tenantId: r.tenant_id, automationId: r.automation_id, triggerKind: r.trigger_kind, triggerRef: r.trigger_ref,
    triggerPayload: r.trigger_payload ?? {}, status: r.status, steps: Array.isArray(r.steps) ? r.steps : [], error: r.error ?? null,
    minutesSaved: Number(r.minutes_saved ?? 0), startedAt: iso(r.started_at), finishedAt: isoOrNull(r.finished_at),
  };
}
export function toApproval(r: any): AutomationApproval {
  return {
    id: r.id, tenantId: r.tenant_id, runId: r.run_id, stepIndex: Number(r.step_index), stepKey: r.step_key, summary: r.summary,
    proposal: r.proposal ?? {}, status: r.status, decidedBy: r.decided_by ?? null, decidedAt: isoOrNull(r.decided_at),
    createdAt: iso(r.created_at), expiresAt: iso(r.expires_at),
  };
}

// ── automations ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export async function listAutomations(db: Db, tenantId: string): Promise<TenantAutomation[]> {
  const r = await db.query(`SELECT * FROM public.tenant_automations WHERE tenant_id = $1 ORDER BY created_at`, [tenantId]);
  return r.rows.map(toAutomation);
}

export async function getAutomation(db: Db, tenantId: string, templateKey: string): Promise<TenantAutomation | null> {
  const r = await db.query(`SELECT * FROM public.tenant_automations WHERE tenant_id = $1 AND template_key = $2`, [tenantId, templateKey]);
  return r.rows[0] ? toAutomation(r.rows[0]) : null;
}

export async function getAutomationById(db: Db, tenantId: string, id: string): Promise<TenantAutomation | null> {
  const r = await db.query(`SELECT * FROM public.tenant_automations WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
  return r.rows[0] ? toAutomation(r.rows[0]) : null;
}

export interface AutomationPatch {
  name: string;
  enabled?: boolean;
  approvalMode?: ApprovalMode;
  config?: Record<string, unknown>;
  createdBy?: string | null;
}

/** Creates the business's copy of a template the first time, and afterwards changes only the fields that were given. A new automation starts switched off. */
export async function upsertAutomation(db: Db, tenantId: string, templateKey: string, p: AutomationPatch): Promise<TenantAutomation> {
  const r = await db.query(
    `INSERT INTO public.tenant_automations (tenant_id, template_key, name, enabled, approval_mode, config, created_by)
     VALUES ($1, $2, $3, COALESCE($4, false), COALESCE($5, 'ask'), COALESCE($6::jsonb, '{}'::jsonb), $7)
     ON CONFLICT (tenant_id, template_key) DO UPDATE SET
       enabled = COALESCE($4, public.tenant_automations.enabled),
       approval_mode = COALESCE($5, public.tenant_automations.approval_mode),
       config = COALESCE($6::jsonb, public.tenant_automations.config),
       updated_at = now()
     RETURNING *`,
    [tenantId, templateKey, p.name, p.enabled ?? null, p.approvalMode ?? null, p.config === undefined ? null : JSON.stringify(p.config), p.createdBy ?? null],
  );
  return toAutomation(r.rows[0]);
}

/** Every switched-on automation of a business that starts from this kind of trigger. */
export async function enabledForTrigger(db: Db, tenantId: string, templateKeys: string[]): Promise<TenantAutomation[]> {
  if (!templateKeys.length) return [];
  const r = await db.query(
    `SELECT * FROM public.tenant_automations WHERE tenant_id = $1 AND enabled = true AND template_key = ANY($2::text[])`,
    [tenantId, templateKeys],
  );
  return r.rows.map(toAutomation);
}

// ── runs ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface NewRun {
  tenantId: string;
  automationId: string;
  triggerKind: string;
  triggerRef: string;
  triggerPayload: Record<string, unknown>;
}

/** Starts a run. The same trigger never runs the same automation twice: a repeat returns the existing run with `created: false`. */
export async function createRun(db: Db, n: NewRun): Promise<{ run: AutomationRun; created: boolean }> {
  const ins = await db.query(
    `INSERT INTO public.tenant_automation_runs (tenant_id, automation_id, trigger_kind, trigger_ref, trigger_payload)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     ON CONFLICT (automation_id, trigger_kind, trigger_ref) DO NOTHING
     RETURNING *`,
    [n.tenantId, n.automationId, n.triggerKind, n.triggerRef, JSON.stringify(n.triggerPayload ?? {})],
  );
  if (ins.rows[0]) return { run: toRun(ins.rows[0]), created: true };
  const ex = await db.query(
    `SELECT * FROM public.tenant_automation_runs WHERE automation_id = $1 AND trigger_kind = $2 AND trigger_ref = $3 AND tenant_id = $4`,
    [n.automationId, n.triggerKind, n.triggerRef, n.tenantId],
  );
  return { run: toRun(ex.rows[0]), created: false };
}

export interface RunPatch {
  status?: RunStatus;
  steps?: StepLogEntry[];
  error?: string | null;
  minutesSaved?: number;
  finished?: boolean;
}

export async function updateRun(db: Db, tenantId: string, runId: string, p: RunPatch): Promise<AutomationRun | null> {
  const r = await db.query(
    `UPDATE public.tenant_automation_runs SET
       status = COALESCE($3, status),
       steps = COALESCE($4::jsonb, steps),
       error = CASE WHEN $5::boolean THEN $6 ELSE error END,
       minutes_saved = COALESCE($7, minutes_saved),
       finished_at = CASE WHEN $8::boolean THEN now() ELSE finished_at END
     WHERE tenant_id = $1 AND id = $2
     RETURNING *`,
    [tenantId, runId, p.status ?? null, p.steps === undefined ? null : JSON.stringify(p.steps), p.error !== undefined, p.error ?? null, p.minutesSaved ?? null, !!p.finished],
  );
  return r.rows[0] ? toRun(r.rows[0]) : null;
}

export async function getRun(db: Db, tenantId: string, id: string): Promise<AutomationRun | null> {
  const r = await db.query(`SELECT * FROM public.tenant_automation_runs WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
  return r.rows[0] ? toRun(r.rows[0]) : null;
}

export interface RunFilter {
  status?: RunStatus;
  automationId?: string;
  limit?: number;
  offset?: number;
}

export async function listRuns(db: Db, tenantId: string, f: RunFilter = {}): Promise<AutomationRun[]> {
  const limit = Math.min(Math.max(Math.trunc(f.limit ?? 50), 1), 200);
  const offset = Math.max(Math.trunc(f.offset ?? 0), 0);
  const r = await db.query(
    `SELECT * FROM public.tenant_automation_runs
     WHERE tenant_id = $1 AND ($2::text IS NULL OR status = $2) AND ($3::uuid IS NULL OR automation_id = $3)
     ORDER BY started_at DESC LIMIT $4 OFFSET $5`,
    [tenantId, f.status ?? null, f.automationId ?? null, limit, offset],
  );
  return r.rows.map(toRun);
}

export interface AutomationStats {
  days: number;
  runs: number;
  succeeded: number;
  failed: number;
  waitingApproval: number;
  minutesSaved: number;
  byAutomation: Array<{ automationId: string; templateKey: string; name: string; runs: number; succeeded: number; minutesSaved: number }>;
}

/** Counts for the report. `minutesSaved` adds up the per-run estimates of runs that succeeded: an estimate, not a measurement. */
export async function stats(db: Db, tenantId: string, days = 30): Promise<AutomationStats> {
  const d = Math.min(Math.max(Math.trunc(days), 1), 365);
  const t = await db.query(
    `SELECT count(*)::int AS runs,
            count(*) FILTER (WHERE status = 'succeeded')::int AS succeeded,
            count(*) FILTER (WHERE status = 'failed')::int AS failed,
            count(*) FILTER (WHERE status = 'waiting_approval')::int AS waiting,
            COALESCE(sum(minutes_saved) FILTER (WHERE status = 'succeeded'), 0)::float AS minutes
     FROM public.tenant_automation_runs WHERE tenant_id = $1 AND started_at >= now() - ($2::int * interval '1 day')`,
    [tenantId, d],
  );
  const by = await db.query(
    `SELECT a.id AS automation_id, a.template_key, a.name, count(r.id)::int AS runs,
            count(r.id) FILTER (WHERE r.status = 'succeeded')::int AS succeeded,
            COALESCE(sum(r.minutes_saved) FILTER (WHERE r.status = 'succeeded'), 0)::float AS minutes
     FROM public.tenant_automations a
     LEFT JOIN public.tenant_automation_runs r ON r.automation_id = a.id AND r.started_at >= now() - ($2::int * interval '1 day')
     WHERE a.tenant_id = $1 GROUP BY a.id, a.template_key, a.name ORDER BY minutes DESC, a.name`,
    [tenantId, d],
  );
  const row = t.rows[0] ?? {};
  return {
    days: d, runs: row.runs ?? 0, succeeded: row.succeeded ?? 0, failed: row.failed ?? 0, waitingApproval: row.waiting ?? 0,
    minutesSaved: Math.round((row.minutes ?? 0) * 100) / 100,
    byAutomation: by.rows.map((b: any) => ({ automationId: b.automation_id, templateKey: b.template_key, name: b.name, runs: b.runs, succeeded: b.succeeded, minutesSaved: Math.round(b.minutes * 100) / 100 })),
  };
}

// ── approvals ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface NewApproval {
  tenantId: string;
  runId: string;
  stepIndex: number;
  stepKey: string;
  summary: string;
  proposal: Record<string, unknown>;
}

/** One approval per step of a run: asking twice for the same step returns the first. */
export async function createApproval(db: Db, n: NewApproval): Promise<AutomationApproval> {
  const ins = await db.query(
    `INSERT INTO public.tenant_automation_approvals (tenant_id, run_id, step_index, step_key, summary, proposal)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb) ON CONFLICT (run_id, step_index) DO NOTHING RETURNING *`,
    [n.tenantId, n.runId, n.stepIndex, n.stepKey, n.summary, JSON.stringify(n.proposal ?? {})],
  );
  if (ins.rows[0]) return toApproval(ins.rows[0]);
  const ex = await db.query(`SELECT * FROM public.tenant_automation_approvals WHERE run_id = $1 AND step_index = $2 AND tenant_id = $3`, [n.runId, n.stepIndex, n.tenantId]);
  return toApproval(ex.rows[0]);
}

export async function listApprovals(db: Db, tenantId: string, status?: ApprovalStatus, limit = 100): Promise<AutomationApproval[]> {
  const r = await db.query(
    `SELECT * FROM public.tenant_automation_approvals WHERE tenant_id = $1 AND ($2::text IS NULL OR status = $2) ORDER BY created_at DESC LIMIT $3`,
    [tenantId, status ?? null, Math.min(Math.max(Math.trunc(limit), 1), 200)],
  );
  return r.rows.map(toApproval);
}

export async function getApproval(db: Db, tenantId: string, id: string): Promise<AutomationApproval | null> {
  const r = await db.query(`SELECT * FROM public.tenant_automation_approvals WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
  return r.rows[0] ? toApproval(r.rows[0]) : null;
}

export type DecideResult = { ok: true; approval: AutomationApproval } | { ok: false; reason: 'not_found' | 'already_decided' | 'expired' };

/** Records the owner's decision. Only a pending, unexpired approval can be decided, and only once: a second answer changes nothing. */
export async function decideApproval(db: Db, tenantId: string, id: string, decision: 'approved' | 'rejected', decidedBy: string): Promise<DecideResult> {
  const upd = await db.query(
    `UPDATE public.tenant_automation_approvals SET status = $3, decided_by = $4, decided_at = now()
     WHERE tenant_id = $1 AND id = $2 AND status = 'pending' AND expires_at > now() RETURNING *`,
    [tenantId, id, decision, decidedBy],
  );
  if (upd.rows[0]) return { ok: true, approval: toApproval(upd.rows[0]) };
  const cur = await getApproval(db, tenantId, id);
  if (!cur) return { ok: false, reason: 'not_found' };
  if (cur.status === 'pending') return { ok: false, reason: 'expired' };
  return { ok: false, reason: cur.status === 'expired' ? 'expired' : 'already_decided' };
}

/** Marks pending approvals past their deadline as expired and returns them, so the engine can end their runs. */
export async function expirePendingApprovals(db: Db): Promise<AutomationApproval[]> {
  const r = await db.query(`UPDATE public.tenant_automation_approvals SET status = 'expired' WHERE status = 'pending' AND expires_at <= now() RETURNING *`);
  return r.rows.map(toApproval);
}
