import type { ClaimOptions, JobStore, NewJob, ScheduledJob } from './types.js';

export interface Queryable { query(text: string, values?: unknown[]): Promise<{ rows: any[]; rowCount?: number | null }> }

const toJob = (r: any): ScheduledJob => ({
  id: r.id,
  tenantId: r.tenant_id,
  kind: r.kind,
  channel: r.channel,
  payload: r.payload ?? {},
  campaignId: r.campaign_id,
  dedupeKey: r.dedupe_key,
  runAt: new Date(r.run_at),
  status: r.status,
  attempts: r.attempts,
  maxAttempts: r.max_attempts,
  lastError: r.last_error,
});

/** Postgres-backed job store (table public.scheduled_jobs, migration 082). */
export class PgJobStore implements JobStore {
  constructor(private readonly db: Queryable) {}

  async enqueue(jobs: NewJob[]): Promise<number> {
    let created = 0;
    for (const j of jobs) {
      const r = await this.db.query(
        `INSERT INTO public.scheduled_jobs (tenant_id, kind, channel, payload, campaign_id, dedupe_key, run_at, max_attempts)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8)
         ON CONFLICT (dedupe_key) DO NOTHING`,
        [j.tenantId, j.kind, j.channel ?? null, JSON.stringify(j.payload ?? {}), j.campaignId ?? null, j.dedupeKey, j.runAt, j.maxAttempts ?? 3]
      );
      created += r.rowCount ?? 0;
    }
    return created;
  }

  async claimDue(o: ClaimOptions): Promise<ScheduledJob[]> {
    // One statement: pick due rows with SKIP LOCKED (rows another instance is claiming are passed over, not waited for) and flip them to
    // 'processing' before any lock is released. Jobs of a paused or stopped campaign are not due.
    const r = await this.db.query(
      `WITH due AS (
         SELECT j.id FROM public.scheduled_jobs j
         LEFT JOIN public.campaigns c ON c.id = j.campaign_id
         WHERE j.status = 'pending' AND j.run_at <= $1 AND j.kind = ANY($2::text[])
           AND (j.campaign_id IS NULL OR c.status IN ('running', 'scheduled'))
         ORDER BY j.run_at ASC, j.created_at ASC
         LIMIT $3
         FOR UPDATE OF j SKIP LOCKED
       )
       UPDATE public.scheduled_jobs j
          SET status = 'processing', attempts = j.attempts + 1, locked_until = $4, locked_by = $5, updated_at = $1
         FROM due WHERE j.id = due.id
       RETURNING j.*`,
      [o.now, o.kinds, o.limit, new Date(o.now.getTime() + o.leaseMs), o.workerId]
    );
    return r.rows.map(toJob).sort((a, b) => a.runAt.getTime() - b.runAt.getTime());
  }

  async abandonExpired(now: Date): Promise<ScheduledJob[]> {
    const r = await this.db.query(
      `UPDATE public.scheduled_jobs
          SET status = 'abandoned', last_error = 'worker stopped mid-send; not repeated because the outcome is unknown', updated_at = $1, completed_at = $1
        WHERE status = 'processing' AND locked_until < $1
       RETURNING *`,
      [now]
    );
    return r.rows.map(toJob);
  }

  async finish(id: string, status: 'done' | 'skipped' | 'failed', now: Date, error?: string | null): Promise<void> {
    await this.db.query(
      `UPDATE public.scheduled_jobs SET status = $2, last_error = $3, locked_until = NULL, updated_at = $4, completed_at = $4
        WHERE id = $1 AND status = 'processing'`,
      [id, status, error ? error.slice(0, 500) : null, now]
    );
  }

  async reschedule(id: string, runAt: Date, o: { consumeAttempt: boolean; error?: string | null; now: Date }): Promise<void> {
    await this.db.query(
      `UPDATE public.scheduled_jobs
          SET status = 'pending', run_at = $2, attempts = GREATEST(attempts - $3, 0), last_error = $4, locked_until = NULL, updated_at = $5
        WHERE id = $1 AND status = 'processing'`,
      [id, runAt, o.consumeAttempt ? 0 : 1, o.error ? o.error.slice(0, 500) : null, o.now]
    );
  }

  async cancelCampaignJobs(campaignId: string, now: Date): Promise<number> {
    const r = await this.db.query(
      `UPDATE public.scheduled_jobs SET status = 'cancelled', updated_at = $2, completed_at = $2
        WHERE campaign_id = $1 AND status = 'pending'`,
      [campaignId, now]
    );
    return r.rowCount ?? 0;
  }
}
