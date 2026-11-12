import { nextCallingTime, isWithinCallingHours, parseHm, type CallingWindow } from './calling-hours.js';
import { PermanentJobError, type JobHandler } from './scheduler.js';
import type { JobStore, NewJob } from './types.js';

export const DIAL_STAGGER_MS = 2000;

export interface DialCampaign {
  id: string;
  status: string;
  timezone: string | null;
  callingStart: string;
  callingEnd: string;
  callingDays: number[];
  fromNumber: string | null;
  agentId: string | null;
}

export interface DialCall {
  id: string;
  phoneNumber: string;
  purpose: string | null;
  context: unknown;
  leadId: string | null;
  customerId: string | null;
}

export interface DialPorts {
  getCampaign(tenantId: string, campaignId: string): Promise<DialCampaign | null>;
  getTenantTimezone(tenantId: string): Promise<string>;
  /** pending -> calling, atomically; null when the call is not pending any more (already dialled or removed). */
  claimCall(campaignId: string, campaignCallId: string): Promise<DialCall | null>;
  releaseCall(campaignCallId: string): Promise<void>;
  failCall(campaignId: string, campaignCallId: string, reason: string): Promise<void>;
  markCampaignRunning(campaignId: string): Promise<void>;
  dial(args: { tenantId: string; campaign: DialCampaign; call: DialCall }): Promise<{ callSid: string }>;
}

export function dialDedupeKey(campaignCallId: string) {
  return `dial:${campaignCallId}`;
}

/** One job per pending call, spread out by the stagger and not earlier than the campaign's start time. */
export function dialJobsFor(args: { tenantId: string; campaignId: string; callIds: string[]; startAt: Date; maxAttempts?: number }): NewJob[] {
  return args.callIds.map((id, i) => ({
    tenantId: args.tenantId,
    kind: 'campaign_dial' as const,
    campaignId: args.campaignId,
    payload: { campaignCallId: id },
    dedupeKey: dialDedupeKey(id),
    runAt: new Date(args.startAt.getTime() + i * DIAL_STAGGER_MS),
    maxAttempts: args.maxAttempts ?? 3,
  }));
}

export async function enqueueDialJobs(store: JobStore, args: Parameters<typeof dialJobsFor>[0]): Promise<number> {
  return store.enqueue(dialJobsFor(args));
}

export function windowFor(c: DialCampaign, timezone: string): CallingWindow {
  return {
    timezone,
    startMinute: parseHm(c.callingStart) ?? 9 * 60,
    endMinute: parseHm(c.callingEnd) ?? 20 * 60,
    days: c.callingDays,
  };
}

const isConsentRefusal = (err: unknown) => err instanceof Error && err.name === 'ConsentRequiredError';

export function dialHandler(ports: DialPorts): JobHandler {
  return {
    async run(job, { now }) {
      const campaignCallId = String(job.payload.campaignCallId);
      const campaignId = job.campaignId as string;
      const campaign = await ports.getCampaign(job.tenantId, campaignId);
      // A pause or stop that landed after the job was claimed: put it back untouched (pause) or drop it (stop).
      if (!campaign) return { type: 'skipped', reason: 'campaign_missing' };
      if (campaign.status === 'paused') return { type: 'defer', until: new Date(now.getTime() + 60_000), reason: 'campaign_paused' };
      if (campaign.status !== 'running' && campaign.status !== 'scheduled') return { type: 'skipped', reason: `campaign_${campaign.status}` };

      let timezone = campaign.timezone;
      if (!timezone) timezone = await ports.getTenantTimezone(job.tenantId).catch(() => 'UTC');
      let window: CallingWindow;
      try {
        window = windowFor(campaign, timezone);
        isWithinCallingHours(now, window); // throws on an unknown timezone
      } catch {
        window = windowFor(campaign, 'UTC');
      }
      if (!isWithinCallingHours(now, window)) {
        return { type: 'defer', until: nextCallingTime(now, window), reason: 'outside_calling_hours' };
      }

      const call = await ports.claimCall(campaignId, campaignCallId);
      if (!call) return { type: 'skipped', reason: 'call_not_pending' };
      if (!campaign.fromNumber) {
        await ports.releaseCall(campaignCallId);
        throw new PermanentJobError('campaign has no outbound number');
      }

      await ports.markCampaignRunning(campaignId);
      try {
        await ports.dial({ tenantId: job.tenantId, campaign, call });
      } catch (err) {
        if (isConsentRefusal(err)) {
          await ports.releaseCall(campaignCallId);
          throw new PermanentJobError(err instanceof Error ? err.message : 'consent refused');
        }
        await ports.releaseCall(campaignCallId); // nothing was placed: safe to try again
        throw err;
      }
      return { type: 'done' };
    },
    async onGaveUp(job, reason) {
      if (!job.campaignId) return;
      await ports.failCall(job.campaignId, String(job.payload.campaignCallId), reason);
    },
  };
}
