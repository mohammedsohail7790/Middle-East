import { PermanentJobError, type JobHandler, type Planner } from './scheduler.js';
import type { JobStore, NewJob } from './types.js';

export type ReminderChannel = 'email' | 'whatsapp';
export interface ReminderWindow { channel: ReminderChannel; hours: number; graceMs: number }

/**
 * Which reminders exist. A reminder is only created while it can still be useful: a booking made 3 hours before the visit never gets
 * a "24 hours" reminder, and one missed by a long outage is dropped instead of arriving after the visit.
 * SMS reminders are not included: SMS follow-ups were retired from the product.
 */
export const REMINDER_WINDOWS: ReminderWindow[] = [
  { channel: 'email', hours: 24, graceMs: 2 * 3600_000 },
  { channel: 'email', hours: 1, graceMs: 15 * 60_000 },
  { channel: 'whatsapp', hours: 24, graceMs: 2 * 3600_000 },
];

export const PLAN_HORIZON_MS = 60 * 60_000; // queue reminders up to an hour ahead; they run at their own time

export interface ReminderCandidate { id: string; tenantId: string; scheduledTime: Date }

export interface ReminderPorts {
  /** Booked appointments starting between `from` and `to` that have not already had this reminder (legacy flags respected). */
  findCandidates(w: ReminderWindow, from: Date, to: Date): Promise<ReminderCandidate[]>;
  loadAppointment(tenantId: string, appointmentId: string): Promise<{ status: string; scheduledTime: Date } | null>;
  /** Throws when delivery failed and nothing was sent. */
  sendEmail(tenantId: string, appointmentId: string, hours: number): Promise<{ delivered: number; skippedReason?: string }>;
  sendWhatsApp(tenantId: string, appointmentId: string): Promise<{ ok: boolean; reason?: string }>;
  markSent(appointmentId: string, channel: ReminderChannel, hours: number): Promise<void>;
}

export const reminderDedupeKey = (appointmentId: string, channel: ReminderChannel, hours: number, scheduledAtMs: number) =>
  `reminder:${appointmentId}:${channel}:${hours}h:${scheduledAtMs}`;

export function reminderJobFor(c: ReminderCandidate, w: ReminderWindow): NewJob {
  const at = c.scheduledTime.getTime();
  return {
    tenantId: c.tenantId,
    kind: 'appointment_reminder',
    channel: w.channel,
    payload: { appointmentId: c.id, hours: w.hours, scheduledAtMs: at },
    dedupeKey: reminderDedupeKey(c.id, w.channel, w.hours, at), // moving the appointment gives a new key, so the new time gets its own reminder
    runAt: new Date(at - w.hours * 3600_000),
  };
}

export function reminderPlanner(store: JobStore, ports: ReminderPorts, everyMs = 60_000): Planner {
  return {
    name: 'appointment-reminders',
    everyMs,
    async plan(now) {
      let created = 0;
      for (const w of REMINDER_WINDOWS) {
        const lead = w.hours * 3600_000;
        const rows = await ports.findCandidates(w, new Date(now.getTime() + lead - w.graceMs), new Date(now.getTime() + lead + PLAN_HORIZON_MS));
        created += await store.enqueue(rows.map((c) => reminderJobFor(c, w)));
      }
      return created;
    },
  };
}

const WHATSAPP_PERMANENT = new Set(['bad_phone', 'restricted_tenant', 'opted_out', 'no_opt_in', 'not_connected', 'not_found']);

export function reminderHandler(ports: ReminderPorts): JobHandler {
  return {
    async run(job, { now }) {
      const { appointmentId, hours, scheduledAtMs } = job.payload as { appointmentId: string; hours: number; scheduledAtMs: number };
      const channel = job.channel as ReminderChannel;
      const a = await ports.loadAppointment(job.tenantId, appointmentId);
      if (!a || a.status !== 'booked') return { type: 'skipped', reason: 'appointment_not_booked' };
      if (a.scheduledTime.getTime() !== scheduledAtMs) return { type: 'skipped', reason: 'appointment_moved' };
      if (now.getTime() >= a.scheduledTime.getTime()) return { type: 'skipped', reason: 'appointment_started' };

      if (channel === 'email') {
        const r = await ports.sendEmail(job.tenantId, appointmentId, hours);
        if (!r.delivered) return { type: 'skipped', reason: r.skippedReason ?? 'no_recipient' };
      } else if (channel === 'whatsapp') {
        const r = await ports.sendWhatsApp(job.tenantId, appointmentId);
        if (!r.ok) {
          if (WHATSAPP_PERMANENT.has(r.reason ?? '')) return { type: 'skipped', reason: r.reason ?? 'not_sent' };
          throw new Error(`whatsapp send failed: ${r.reason ?? 'unknown'}`);
        }
      } else {
        throw new PermanentJobError(`unknown reminder channel ${String(channel)}`);
      }
      await ports.markSent(appointmentId, channel, hours).catch(() => {}); // legacy flag only; the job row is the record
      return { type: 'done' };
    },
  };
}
