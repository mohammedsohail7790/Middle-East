import { voiceDb } from '../voice/tenant-scope.js';
import { enqueueDialJobs } from './dial-jobs.js';
import { isWithinCallingHours, nextCallingTime, parseHm, type CallingWindow } from './calling-hours.js';
import type { JobStore } from './types.js';

export type CampaignAction = 'start' | 'pause' | 'resume' | 'stop';

/** What each control may do from each status. Anything else is refused. */
export function nextCampaignStatus(current: string, action: CampaignAction, opts: { startsLater?: boolean } = {}): string | null {
  switch (action) {
    case 'start': return current === 'draft' ? (opts.startsLater ? 'scheduled' : 'running') : null;
    case 'pause': return current === 'running' || current === 'scheduled' ? 'paused' : null;
    case 'resume': return current === 'paused' ? 'running' : null;
    case 'stop': return ['draft', 'running', 'scheduled', 'paused'].includes(current) ? 'cancelled' : null;
  }
}

export class CampaignControlError extends Error {
  constructor(readonly httpStatus: number, message: string) { super(message); }
}

async function loadCampaign(tenantId: string, campaignId: string) {
  const r = await voiceDb.query(`SELECT id, status, dial_max_attempts FROM public.campaigns WHERE id = $1 AND tenant_id = $2`, [campaignId, tenantId]);
  if (!r.rows[0]) throw new CampaignControlError(404, 'Campaign not found');
  return r.rows[0] as { id: string; status: string; dial_max_attempts: number };
}

async function pendingCallIds(campaignId: string): Promise<string[]> {
  const r = await voiceDb.query(`SELECT id FROM public.campaign_calls WHERE campaign_id = $1 AND status = 'pending' ORDER BY created_at ASC LIMIT 5000`, [campaignId]);
  return r.rows.map((x) => x.id as string);
}

export async function startCampaign(
  store: JobStore,
  args: {
    tenantId: string; campaignId: string; fromNumber: string; agentId: string | null; now: Date;
    scheduleAt?: Date | null; hours: { start: string; end: string; days: number[]; timezone: string | null };
  }
): Promise<{ status: string; queued: number; scheduleAt: Date | null }> {
  const c = await loadCampaign(args.tenantId, args.campaignId);
  const startsLater = !!args.scheduleAt && args.scheduleAt.getTime() > args.now.getTime();
  const next = nextCampaignStatus(c.status, 'start', { startsLater });
  if (!next) throw new CampaignControlError(409, `A ${c.status} campaign cannot be started; use pause, resume or stop`);
  const ids = await pendingCallIds(args.campaignId);
  if (ids.length === 0) throw new CampaignControlError(400, 'Campaign has no pending targets');

  // Claim the draft -> started transition first so two requests cannot both enqueue.
  const claimed = await voiceDb.query(
    `UPDATE public.campaigns
        SET status = $3, schedule_at = $4, timezone = $5, calling_start = $6::time, calling_end = $7::time, calling_days = $8::smallint[],
            dial_from_number = $9, dial_agent_id = $10, updated_at = $11
      WHERE id = $1 AND tenant_id = $2 AND status = 'draft' RETURNING id`,
    [args.campaignId, args.tenantId, next, args.scheduleAt ?? null, args.hours.timezone, args.hours.start, args.hours.end, args.hours.days, args.fromNumber, args.agentId, args.now]
  );
  if (!claimed.rowCount) throw new CampaignControlError(409, 'Campaign was started by another request');
  const startAt = startsLater ? (args.scheduleAt as Date) : args.now;
  const queued = await enqueueDialJobs(store, { tenantId: args.tenantId, campaignId: args.campaignId, callIds: ids, startAt, maxAttempts: c.dial_max_attempts });
  return { status: next, queued, scheduleAt: args.scheduleAt ?? null };
}

export async function pauseCampaign(tenantId: string, campaignId: string, now: Date): Promise<string> {
  const c = await loadCampaign(tenantId, campaignId);
  if (!nextCampaignStatus(c.status, 'pause')) throw new CampaignControlError(409, `A ${c.status} campaign cannot be paused`);
  await voiceDb.query(`UPDATE public.campaigns SET status = 'paused', paused_at = $3, updated_at = $3 WHERE id = $1 AND tenant_id = $2 AND status IN ('running', 'scheduled')`, [campaignId, tenantId, now]);
  return 'paused';
}

export async function resumeCampaign(store: JobStore, tenantId: string, campaignId: string, now: Date): Promise<{ status: string; queued: number }> {
  const c = await loadCampaign(tenantId, campaignId);
  if (!nextCampaignStatus(c.status, 'resume')) throw new CampaignControlError(409, `A ${c.status} campaign cannot be resumed`);
  await voiceDb.query(`UPDATE public.campaigns SET status = 'running', paused_at = NULL, updated_at = $3 WHERE id = $1 AND tenant_id = $2 AND status = 'paused'`, [campaignId, tenantId, now]);
  // Targets that never got a job (a campaign paused before it was started) are queued now; existing jobs are left alone.
  const queued = await enqueueDialJobs(store, { tenantId, campaignId, callIds: await pendingCallIds(campaignId), startAt: now, maxAttempts: c.dial_max_attempts });
  return { status: 'running', queued };
}

export async function stopCampaign(store: JobStore, tenantId: string, campaignId: string, now: Date): Promise<{ status: string; cancelledJobs: number }> {
  const c = await loadCampaign(tenantId, campaignId);
  if (!nextCampaignStatus(c.status, 'stop')) throw new CampaignControlError(409, `A ${c.status} campaign cannot be stopped`);
  await voiceDb.query(`UPDATE public.campaigns SET status = 'cancelled', updated_at = $3 WHERE id = $1 AND tenant_id = $2 AND status IN ('draft', 'running', 'scheduled', 'paused')`, [campaignId, tenantId, now]);
  const cancelledJobs = await store.cancelCampaignJobs(campaignId, now);
  return { status: 'cancelled', cancelledJobs };
}

export async function getCampaignStatus(tenantId: string, campaignId: string, now: Date) {
  const r = await voiceDb.query(
    `SELECT id, name, status, schedule_at, timezone, calling_start::text AS calling_start, calling_end::text AS calling_end, calling_days,
            total_targets, completed_count, success_count, failed_count, paused_at, updated_at
       FROM public.campaigns WHERE id = $1 AND tenant_id = $2`,
    [campaignId, tenantId]
  );
  const c = r.rows[0];
  if (!c) throw new CampaignControlError(404, 'Campaign not found');
  const jobs = await voiceDb.query(
    `SELECT status, count(*)::int AS n, min(run_at) FILTER (WHERE status = 'pending') AS next_run_at FROM public.scheduled_jobs WHERE campaign_id = $1 GROUP BY status`,
    [campaignId]
  );
  const counts: Record<string, number> = {};
  let nextRunAt: Date | null = null;
  for (const j of jobs.rows) {
    counts[j.status] = j.n;
    if (j.next_run_at) nextRunAt = new Date(j.next_run_at);
  }
  let timezone: string = c.timezone;
  if (!timezone) {
    const { getTenantTimezone } = await import('../appointments/tenant-timezone.js');
    timezone = await getTenantTimezone(tenantId).catch(() => 'UTC');
  }
  const window: CallingWindow = { timezone, startMinute: parseHm(c.calling_start) ?? 540, endMinute: parseHm(c.calling_end) ?? 1200, days: c.calling_days };
  let withinCallingHours: boolean | null = null;
  let nextDialAt: Date | null = nextRunAt;
  try {
    withinCallingHours = isWithinCallingHours(now, window);
    if (nextRunAt) nextDialAt = new Date(Math.max(nextRunAt.getTime(), nextCallingTime(nextRunAt, window).getTime()));
  } catch { /* unknown timezone saved earlier: report no window */ }
  return {
    id: c.id, name: c.name, status: c.status, scheduleAt: c.schedule_at, pausedAt: c.paused_at,
    callingHours: { timezone, start: c.calling_start, end: c.calling_end, days: c.calling_days, openNow: withinCallingHours },
    progress: { total: c.total_targets, completed: c.completed_count, succeeded: c.success_count, failed: c.failed_count },
    queue: { pending: counts.pending ?? 0, processing: counts.processing ?? 0, done: counts.done ?? 0, failed: counts.failed ?? 0, skipped: counts.skipped ?? 0, cancelled: counts.cancelled ?? 0, abandoned: counts.abandoned ?? 0 },
    nextDialAt,
  };
}
