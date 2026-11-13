export type JobKind = 'appointment_reminder' | 'campaign_dial';
export type JobStatus = 'pending' | 'processing' | 'done' | 'failed' | 'skipped' | 'cancelled' | 'abandoned';

export interface ScheduledJob {
  id: string;
  tenantId: string;
  kind: JobKind;
  channel: string | null;
  payload: Record<string, any>;
  campaignId: string | null;
  dedupeKey: string;
  runAt: Date;
  status: JobStatus;
  attempts: number; // includes the current attempt once claimed
  maxAttempts: number;
  lastError: string | null;
}

export interface NewJob {
  tenantId: string;
  kind: JobKind;
  channel?: string | null;
  payload?: Record<string, any>;
  campaignId?: string | null;
  dedupeKey: string;
  runAt: Date;
  maxAttempts?: number;
}

export interface ClaimOptions { now: Date; limit: number; kinds: JobKind[]; leaseMs: number; workerId: string }

/** Storage for due jobs. The Postgres implementation is the source of truth; tests use an in-memory twin. */
export interface JobStore {
  /** Inserts jobs whose dedupe key is new; returns how many were new. */
  enqueue(jobs: NewJob[]): Promise<number>;
  /** Atomically takes up to `limit` due, unpaused jobs (attempts + 1, lease set). Two callers never get the same job. */
  claimDue(opts: ClaimOptions): Promise<ScheduledJob[]>;
  /** Jobs whose lease ran out while processing: outcome unknown, so they are marked abandoned rather than run again. */
  abandonExpired(now: Date): Promise<ScheduledJob[]>;
  finish(id: string, status: 'done' | 'skipped' | 'failed', now: Date, error?: string | null): Promise<void>;
  /** Back to pending at `runAt`; `consumeAttempt = false` gives the attempt back (deferred, not tried). */
  reschedule(id: string, runAt: Date, opts: { consumeAttempt: boolean; error?: string | null; now: Date }): Promise<void>;
  cancelCampaignJobs(campaignId: string, now: Date): Promise<number>;
}
