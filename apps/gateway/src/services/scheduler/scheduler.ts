import type { JobKind, JobStore, ScheduledJob } from './types.js';

export type JobOutcome =
  | { type: 'done' }
  | { type: 'skipped'; reason: string }
  | { type: 'defer'; until: Date; reason: string }; // not tried yet (e.g. outside calling hours): the attempt is given back

/** Throw this from a handler when retrying cannot help (bad number, consent refused). */
export class PermanentJobError extends Error {}

export interface JobHandler {
  /** Throw to have the job retried with backoff (it must not have sent anything). */
  run(job: ScheduledJob, ctx: { now: Date }): Promise<JobOutcome>;
  /** Called when the job will not run again: retries used up, a permanent error, or abandoned after a crash. */
  onGaveUp?(job: ScheduledJob, reason: string): Promise<void>;
}

export interface Planner { name: string; everyMs: number; plan(now: Date): Promise<number> }

export interface SchedulerOptions {
  store: JobStore;
  handlers: Record<JobKind, JobHandler>;
  planners?: Planner[];
  clock?: () => Date;
  workerId?: string;
  leaseMs?: number;
  /** Max jobs taken per tick, per kind. Dial jobs are few per tick on purpose: that is the pacing against Twilio. */
  batch?: Record<JobKind, number>;
  backoffMs?: number[];
  log?: (event: string, data?: Record<string, unknown>) => void;
}

export const DEFAULT_BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000];

export function retryDelayMs(attemptsMade: number, backoff = DEFAULT_BACKOFF_MS): number {
  return backoff[Math.min(Math.max(attemptsMade, 1), backoff.length) - 1];
}

export class Scheduler {
  private readonly store: JobStore;
  private readonly handlers: Record<JobKind, JobHandler>;
  private readonly planners: Planner[];
  private readonly clock: () => Date;
  private readonly workerId: string;
  private readonly leaseMs: number;
  private readonly batch: Record<JobKind, number>;
  private readonly backoff: number[];
  private readonly log: (event: string, data?: Record<string, unknown>) => void;
  private readonly lastPlanned = new Map<string, number>();
  private ticking = false;

  constructor(o: SchedulerOptions) {
    this.store = o.store;
    this.handlers = o.handlers;
    this.planners = o.planners ?? [];
    this.clock = o.clock ?? (() => new Date());
    this.workerId = o.workerId ?? `worker-${Math.random().toString(36).slice(2, 10)}`;
    this.leaseMs = o.leaseMs ?? 2 * 60_000;
    this.batch = o.batch ?? { appointment_reminder: 50, campaign_dial: 3 };
    this.backoff = o.backoffMs ?? DEFAULT_BACKOFF_MS;
    this.log = o.log ?? (() => {});
  }

  /** One pass: plan, give up on jobs whose worker died, then run what is due. Overlapping ticks are skipped. */
  async tick(): Promise<{ ran: number }> {
    if (this.ticking) return { ran: 0 };
    this.ticking = true;
    try {
      const start = this.clock();
      for (const p of this.planners) {
        const last = this.lastPlanned.get(p.name);
        if (last !== undefined && start.getTime() - last < p.everyMs) continue;
        this.lastPlanned.set(p.name, start.getTime());
        try {
          const created = await p.plan(start);
          if (created) this.log('SCHEDULER_PLANNED', { planner: p.name, created });
        } catch (err) {
          this.log('SCHEDULER_PLAN_FAILED', { planner: p.name, error: String(err) });
        }
      }

      for (const job of await this.store.abandonExpired(this.clock())) {
        this.log('SCHEDULER_JOB_ABANDONED', { jobId: job.id, kind: job.kind });
        await this.handlers[job.kind].onGaveUp?.(job, 'abandoned').catch(() => {});
      }

      let ran = 0;
      for (const kind of Object.keys(this.batch) as JobKind[]) {
        const jobs = await this.store.claimDue({ now: this.clock(), limit: this.batch[kind], kinds: [kind], leaseMs: this.leaseMs, workerId: this.workerId });
        for (const job of jobs) {
          await this.execute(job);
          ran += 1;
        }
      }
      return { ran };
    } finally {
      this.ticking = false;
    }
  }

  private async execute(job: ScheduledJob): Promise<void> {
    const handler = this.handlers[job.kind];
    try {
      const outcome = await handler.run(job, { now: this.clock() });
      const now = this.clock();
      if (outcome.type === 'done') await this.store.finish(job.id, 'done', now);
      else if (outcome.type === 'skipped') await this.store.finish(job.id, 'skipped', now, outcome.reason);
      else await this.store.reschedule(job.id, outcome.until, { consumeAttempt: false, error: outcome.reason, now });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const now = this.clock();
      const permanent = err instanceof PermanentJobError;
      if (!permanent && job.attempts < job.maxAttempts) {
        const runAt = new Date(now.getTime() + retryDelayMs(job.attempts, this.backoff));
        this.log('SCHEDULER_JOB_RETRY', { jobId: job.id, kind: job.kind, attempt: job.attempts, error: message.slice(0, 200) });
        await this.store.reschedule(job.id, runAt, { consumeAttempt: true, error: message, now });
      } else {
        this.log('SCHEDULER_JOB_FAILED', { jobId: job.id, kind: job.kind, attempt: job.attempts, permanent, error: message.slice(0, 200) });
        await this.store.finish(job.id, 'failed', now, message);
        await handler.onGaveUp?.(job, message).catch(() => {});
      }
    }
  }
}
