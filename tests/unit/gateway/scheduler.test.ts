import { describe, expect, it, vi } from 'vitest';
import { isWithinCallingHours, nextCallingTime, parseCallingHoursInput, type CallingWindow } from '../../../apps/gateway/src/services/scheduler/calling-hours.js';
import { PermanentJobError, Scheduler, retryDelayMs, type JobHandler } from '../../../apps/gateway/src/services/scheduler/scheduler.js';
import type { ClaimOptions, JobStore, NewJob, ScheduledJob } from '../../../apps/gateway/src/services/scheduler/types.js';
import { dialHandler, dialJobsFor, type DialCampaign, type DialPorts } from '../../../apps/gateway/src/services/scheduler/dial-jobs.js';
import { reminderHandler, reminderPlanner, type ReminderCandidate, type ReminderPorts } from '../../../apps/gateway/src/services/scheduler/reminder-jobs.js';
import { nextCampaignStatus } from '../../../apps/gateway/src/services/scheduler/campaign-control.js';

// ---- fakes -----------------------------------------------------------------------------------------------------------------------

class FakeClock {
  constructor(public ms: number) {}
  now = () => new Date(this.ms);
  advance(ms: number) { this.ms += ms; }
}

/** Mirrors the Postgres store: dedupe on key, lease on claim (the single-threaded stand-in for FOR UPDATE SKIP LOCKED), paused campaigns not due. */
class MemoryStore implements JobStore {
  jobs: (ScheduledJob & { lockedUntil?: number })[] = [];
  campaigns = new Map<string, string>();
  async enqueue(jobs: NewJob[]) {
    let n = 0;
    for (const j of jobs) {
      if (this.jobs.some((x) => x.dedupeKey === j.dedupeKey)) continue;
      this.jobs.push({ id: `job${this.jobs.length + 1}`, tenantId: j.tenantId, kind: j.kind, channel: j.channel ?? null, payload: j.payload ?? {}, campaignId: j.campaignId ?? null, dedupeKey: j.dedupeKey, runAt: j.runAt, status: 'pending', attempts: 0, maxAttempts: j.maxAttempts ?? 3, lastError: null });
      n += 1;
    }
    return n;
  }
  async claimDue(o: ClaimOptions) {
    const due = this.jobs
      .filter((j) => j.status === 'pending' && j.runAt.getTime() <= o.now.getTime() && o.kinds.includes(j.kind) && (!j.campaignId || ['running', 'scheduled'].includes(this.campaigns.get(j.campaignId) ?? '')))
      .sort((a, b) => a.runAt.getTime() - b.runAt.getTime())
      .slice(0, o.limit);
    for (const j of due) { j.status = 'processing'; j.attempts += 1; j.lockedUntil = o.now.getTime() + o.leaseMs; }
    return due.map((j) => ({ ...j }));
  }
  async abandonExpired(now: Date) {
    const lost = this.jobs.filter((j) => j.status === 'processing' && (j.lockedUntil ?? 0) < now.getTime());
    lost.forEach((j) => { j.status = 'abandoned'; });
    return lost.map((j) => ({ ...j }));
  }
  private get(id: string) { return this.jobs.find((j) => j.id === id && j.status === 'processing')!; }
  async finish(id: string, status: 'done' | 'skipped' | 'failed', _now: Date, error?: string | null) { const j = this.get(id); if (j) { j.status = status; j.lastError = error ?? null; } }
  async reschedule(id: string, runAt: Date, o: { consumeAttempt: boolean; error?: string | null }) { const j = this.get(id); if (j) { j.status = 'pending'; j.runAt = runAt; if (!o.consumeAttempt) j.attempts -= 1; j.lastError = o.error ?? null; } }
  async cancelCampaignJobs(campaignId: string) { const p = this.jobs.filter((j) => j.campaignId === campaignId && j.status === 'pending'); p.forEach((j) => { j.status = 'cancelled'; }); return p.length; }
  byStatus(s: string) { return this.jobs.filter((j) => j.status === s); }
}

const T0 = Date.UTC(2026, 10, 16, 6, 0); // Monday 16 Nov 2026 06:00 UTC
const noop: JobHandler = { run: async () => ({ type: 'done' }) };
const makeScheduler = (store: JobStore, clock: FakeClock, handlers: Partial<Record<'appointment_reminder' | 'campaign_dial', JobHandler>> = {}, extra: object = {}) =>
  new Scheduler({ store, clock: clock.now, handlers: { appointment_reminder: noop, campaign_dial: noop, ...handlers }, ...extra });
const job = (over: Partial<NewJob> = {}): NewJob => ({ tenantId: 't1', kind: 'appointment_reminder', channel: 'email', dedupeKey: `k${Math.random()}`, runAt: new Date(T0), ...over });

// ---- calling hours -----------------------------------------------------------------------------------------------------------------

describe('calling hours', () => {
  const dubai: CallingWindow = { timezone: 'Asia/Dubai', startMinute: 9 * 60, endMinute: 20 * 60, days: [1, 2, 3, 4, 5, 6, 7] };

  it('uses the tenant timezone, not the server clock', () => {
    // 06:00 UTC is 10:00 in Dubai (open) but 01:00 in New York (closed)
    expect(isWithinCallingHours(new Date(T0), dubai)).toBe(true);
    expect(isWithinCallingHours(new Date(T0), { ...dubai, timezone: 'America/New_York' })).toBe(false);
  });

  it('is closed at the end minute and open at the start minute', () => {
    expect(isWithinCallingHours(new Date(Date.UTC(2026, 10, 16, 16, 0)), dubai)).toBe(false); // 20:00 Dubai
    expect(isWithinCallingHours(new Date(Date.UTC(2026, 10, 16, 15, 59)), dubai)).toBe(true);
    expect(isWithinCallingHours(new Date(Date.UTC(2026, 10, 16, 5, 0)), dubai)).toBe(true); // 09:00 Dubai
  });

  it('returns now when open, and the next opening when closed', () => {
    expect(nextCallingTime(new Date(T0), dubai).getTime()).toBe(T0);
    const lateEvening = new Date(Date.UTC(2026, 10, 16, 17, 0)); // 21:00 Dubai Monday
    expect(nextCallingTime(lateEvening, dubai).toISOString()).toBe('2026-11-17T05:00:00.000Z'); // 09:00 Dubai Tuesday
    const earlyMorning = new Date(Date.UTC(2026, 10, 16, 2, 0)); // 06:00 Dubai Monday
    expect(nextCallingTime(earlyMorning, dubai).toISOString()).toBe('2026-11-16T05:00:00.000Z');
  });

  it('skips days that are not allowed', () => {
    const weekdays = { ...dubai, days: [1, 2, 3, 4, 5] };
    const fridayNight = new Date(Date.UTC(2026, 10, 20, 17, 0)); // Friday 21:00 Dubai
    expect(nextCallingTime(fridayNight, weekdays).toISOString()).toBe('2026-11-23T05:00:00.000Z'); // Monday 09:00
  });

  it('follows daylight saving time', () => {
    const ny: CallingWindow = { timezone: 'America/New_York', startMinute: 9 * 60, endMinute: 17 * 60, days: [1, 2, 3, 4, 5, 6, 7] };
    // Sat 7 Nov 2026 evening EDT -> opens Sun 8 Nov 09:00 EST (DST ended that night): 14:00 UTC, not 13:00
    expect(nextCallingTime(new Date(Date.UTC(2026, 10, 8, 3, 0)), ny).toISOString()).toBe('2026-11-08T14:00:00.000Z');
    expect(nextCallingTime(new Date(Date.UTC(2026, 10, 7, 23, 0)), ny).toISOString()).toBe('2026-11-08T14:00:00.000Z');
  });

  it('validates input and applies defaults', () => {
    expect(parseCallingHoursInput(undefined)).toMatchObject({ ok: true, value: { start: '09:00', end: '20:00', days: [1, 2, 3, 4, 5, 6, 7], timezone: null } });
    expect(parseCallingHoursInput({ start: '10:00', end: '09:00' })).toMatchObject({ ok: false });
    expect(parseCallingHoursInput({ start: '25:00' })).toMatchObject({ ok: false });
    expect(parseCallingHoursInput({ days: [0, 9] })).toMatchObject({ ok: false });
    expect(parseCallingHoursInput({ timezone: 'Mars/Base' })).toMatchObject({ ok: false });
    expect(parseCallingHoursInput({ timezone: 'Asia/Dubai', days: [3, 1, 1] })).toMatchObject({ ok: true, value: { days: [1, 3], timezone: 'Asia/Dubai' } });
  });
});

// ---- due selection, idempotency, retry -----------------------------------------------------------------------------------------------

describe('due selection', () => {
  it('only runs jobs that are due, oldest first, up to the batch size', async () => {
    const clock = new FakeClock(T0);
    const store = new MemoryStore();
    const ran: string[] = [];
    await store.enqueue([
      job({ dedupeKey: 'late', runAt: new Date(T0 - 1000) }),
      job({ dedupeKey: 'early', runAt: new Date(T0 - 60_000) }),
      job({ dedupeKey: 'future', runAt: new Date(T0 + 60_000) }),
    ]);
    const s = makeScheduler(store, clock, { appointment_reminder: { run: async (j) => { ran.push(j.dedupeKey); return { type: 'done' }; } } });
    await s.tick();
    expect(ran).toEqual(['early', 'late']);
    clock.advance(61_000);
    await s.tick();
    expect(ran).toEqual(['early', 'late', 'future']);
  });
});

describe('idempotency', () => {
  it('the same dedupe key is queued once', async () => {
    const store = new MemoryStore();
    expect(await store.enqueue([job({ dedupeKey: 'a' }), job({ dedupeKey: 'a' })])).toBe(1);
    expect(await store.enqueue([job({ dedupeKey: 'a' })])).toBe(0);
  });

  it('two gateway instances on one table never run the same job twice', async () => {
    const clock = new FakeClock(T0);
    const store = new MemoryStore();
    await store.enqueue(Array.from({ length: 20 }, (_, i) => job({ dedupeKey: `j${i}` })));
    const sent: string[] = [];
    const handlers = { appointment_reminder: { run: async (j: ScheduledJob) => { sent.push(j.id); return { type: 'done' } as const; } } };
    const a = makeScheduler(store, clock, handlers, { batch: { appointment_reminder: 7, campaign_dial: 1 } });
    const b = makeScheduler(store, clock, handlers, { batch: { appointment_reminder: 7, campaign_dial: 1 } });
    for (let i = 0; i < 4; i++) await Promise.all([a.tick(), b.tick()]);
    expect(sent).toHaveLength(20);
    expect(new Set(sent).size).toBe(20);
  });

  it('a restart does not send again what was already sent', async () => {
    const clock = new FakeClock(T0);
    const store = new MemoryStore();
    await store.enqueue([job({ dedupeKey: 'r1' })]);
    const send = vi.fn(async () => ({ type: 'done' }) as const);
    await makeScheduler(store, clock, { appointment_reminder: { run: send } }).tick();
    // process restarts: new scheduler object, same table
    clock.advance(10 * 60_000);
    await makeScheduler(store, clock, { appointment_reminder: { run: send } }).tick();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('a worker that died mid-send is not re-run: the job is abandoned and the handler told', async () => {
    const clock = new FakeClock(T0);
    const store = new MemoryStore();
    await store.enqueue([job({ dedupeKey: 'crash' })]);
    // worker 1 claims the job and "crashes" before finishing
    await store.claimDue({ now: clock.now(), limit: 5, kinds: ['appointment_reminder'], leaseMs: 120_000, workerId: 'dead' });
    const send = vi.fn(async () => ({ type: 'done' }) as const);
    const gaveUp = vi.fn(async () => {});
    const s = makeScheduler(store, clock, { appointment_reminder: { run: send, onGaveUp: gaveUp } });
    await s.tick(); // lease still valid: nothing happens
    expect(store.byStatus('processing')).toHaveLength(1);
    clock.advance(121_000);
    await s.tick();
    expect(send).not.toHaveBeenCalled();
    expect(store.byStatus('abandoned')).toHaveLength(1);
    expect(gaveUp).toHaveBeenCalledTimes(1);
  });
});

describe('retry', () => {
  it('retries a failed send after a backoff, then succeeds', async () => {
    const clock = new FakeClock(T0);
    const store = new MemoryStore();
    await store.enqueue([job({ dedupeKey: 'flaky' })]);
    let calls = 0;
    const s = makeScheduler(store, clock, { appointment_reminder: { run: async () => { calls += 1; if (calls === 1) throw new Error('provider 503'); return { type: 'done' }; } } });
    await s.tick();
    expect(store.jobs[0]).toMatchObject({ status: 'pending', attempts: 1, lastError: 'provider 503' });
    expect(store.jobs[0].runAt.getTime()).toBe(T0 + retryDelayMs(1));
    await s.tick(); // too early
    expect(calls).toBe(1);
    clock.advance(retryDelayMs(1));
    await s.tick();
    expect(calls).toBe(2);
    expect(store.jobs[0].status).toBe('done');
  });

  it('gives up after the maximum attempts and tells the handler', async () => {
    const clock = new FakeClock(T0);
    const store = new MemoryStore();
    await store.enqueue([job({ dedupeKey: 'doomed', maxAttempts: 2 })]);
    const gaveUp = vi.fn(async () => {});
    const s = makeScheduler(store, clock, { appointment_reminder: { run: async () => { throw new Error('nope'); }, onGaveUp: gaveUp } });
    await s.tick();
    clock.advance(retryDelayMs(1));
    await s.tick();
    clock.advance(retryDelayMs(2));
    await s.tick();
    expect(store.jobs[0]).toMatchObject({ status: 'failed', attempts: 2 });
    expect(gaveUp).toHaveBeenCalledTimes(1);
  });

  it('does not retry a permanent error', async () => {
    const clock = new FakeClock(T0);
    const store = new MemoryStore();
    await store.enqueue([job({ dedupeKey: 'perm' })]);
    await makeScheduler(store, clock, { appointment_reminder: { run: async () => { throw new PermanentJobError('consent refused'); } } }).tick();
    expect(store.jobs[0]).toMatchObject({ status: 'failed', attempts: 1 });
  });
});

// ---- reminders -----------------------------------------------------------------------------------------------------------------

describe('appointment reminders', () => {
  const HOUR = 3600_000;
  const makePorts = (appts: { id: string; time: number; status?: string }[]) => {
    const sent: string[] = [];
    const ports: ReminderPorts = {
      findCandidates: async (w, from, to) =>
        appts.filter((a) => (a.status ?? 'booked') === 'booked' && a.time >= from.getTime() && a.time <= to.getTime() && (w.channel === 'email' || w.hours === 24))
          .map((a): ReminderCandidate => ({ id: a.id, tenantId: 't1', scheduledTime: new Date(a.time) })),
      loadAppointment: async (_t, id) => { const a = appts.find((x) => x.id === id); return a ? { status: a.status ?? 'booked', scheduledTime: new Date(a.time) } : null; },
      sendEmail: async (_t, id, hours) => { sent.push(`email:${id}:${hours}`); return { delivered: 1 }; },
      sendWhatsApp: async (_t, id) => { sent.push(`wa:${id}`); return { ok: true }; },
      markSent: async () => {},
    };
    return { ports, sent };
  };

  it('plans a reminder once however many times (or on however many instances) the planner runs', async () => {
    const clock = new FakeClock(T0);
    const store = new MemoryStore();
    const { ports } = makePorts([{ id: 'a1', time: T0 + 24 * HOUR + 10 * 60_000 }]);
    const p = reminderPlanner(store, ports, 0);
    expect(await p.plan(clock.now())).toBe(2); // email 24h + whatsapp 24h
    expect(await p.plan(clock.now())).toBe(0);
    expect(await reminderPlanner(store, ports, 0).plan(clock.now())).toBe(0);
  });

  it('sends each reminder once, at its time, across restarts', async () => {
    const clock = new FakeClock(T0);
    const store = new MemoryStore();
    const appt = T0 + 24 * HOUR + 30 * 60_000;
    const { ports, sent } = makePorts([{ id: 'a1', time: appt }]);
    const build = () => makeScheduler(store, clock, { appointment_reminder: reminderHandler(ports) }, { planners: [reminderPlanner(store, ports, 60_000)] });
    await build().tick();
    expect(sent).toEqual([]); // not yet due: reminder is 30 minutes away
    clock.advance(31 * 60_000);
    await build().tick(); // "restart" each time
    await build().tick();
    expect(sent.sort()).toEqual(['email:a1:24', 'wa:a1']);
  });

  it('does not send a 24 hour reminder for a booking made 3 hours ahead, but does send the 1 hour one', async () => {
    const clock = new FakeClock(T0);
    const store = new MemoryStore();
    const { ports, sent } = makePorts([{ id: 'soon', time: T0 + 3 * HOUR }]);
    const s = makeScheduler(store, clock, { appointment_reminder: reminderHandler(ports) }, { planners: [reminderPlanner(store, ports, 60_000)] });
    await s.tick();
    clock.advance(2 * HOUR + 1000);
    await s.tick();
    expect(sent).toEqual(['email:soon:1']);
  });

  it('skips a reminder when the appointment was cancelled or moved after it was queued', async () => {
    const clock = new FakeClock(T0);
    const store = new MemoryStore();
    const appts = [{ id: 'c1', time: T0 + 24 * HOUR + 10 * 60_000, status: 'booked' }, { id: 'm1', time: T0 + 24 * HOUR + 10 * 60_000, status: 'booked' }];
    const { ports, sent } = makePorts(appts);
    const s = makeScheduler(store, clock, { appointment_reminder: reminderHandler(ports) }, { planners: [reminderPlanner(store, ports, 0)] });
    await s.tick();
    appts[0].status = 'cancelled';
    appts[1].time += 2 * HOUR;
    clock.advance(11 * 60_000);
    await s.tick();
    expect(sent.filter((x) => x.includes('c1') || x.includes('m1:24'))).toEqual([]);
    expect(store.jobs.filter((j) => j.status === 'skipped').length).toBeGreaterThanOrEqual(2);
    // the moved appointment gets its own reminder for its new time
    clock.advance(2 * HOUR);
    await s.tick();
    expect(sent).toContain('email:m1:24');
  });

  it('retries a failed email, and treats a permanent WhatsApp refusal as skipped', async () => {
    const clock = new FakeClock(T0);
    const store = new MemoryStore();
    const { ports } = makePorts([{ id: 'a1', time: T0 + 24 * HOUR + 60_000 }]);
    let emailCalls = 0;
    ports.sendEmail = async () => { emailCalls += 1; if (emailCalls === 1) throw new Error('resend down'); return { delivered: 1 }; };
    ports.sendWhatsApp = async () => ({ ok: false, reason: 'opted_out' });
    const s = makeScheduler(store, clock, { appointment_reminder: reminderHandler(ports) }, { planners: [reminderPlanner(store, ports, 0)] });
    await s.tick();
    clock.advance(2 * 60_000);
    await s.tick();
    clock.advance(retryDelayMs(1));
    await s.tick();
    expect(emailCalls).toBe(2);
    expect(store.jobs.find((j) => j.channel === 'whatsapp')).toMatchObject({ status: 'skipped', lastError: 'opted_out' });
    expect(store.jobs.find((j) => j.channel === 'email')?.status).toBe('done');
  });
});

// ---- campaign dialling: calling hours, pause, resume, stop -----------------------------------------------------------------------------

describe('campaign dialling', () => {
  const campaign = (over: Partial<DialCampaign> = {}): DialCampaign => ({ id: 'c1', status: 'running', timezone: 'Asia/Dubai', callingStart: '09:00:00', callingEnd: '20:00:00', callingDays: [1, 2, 3, 4, 5, 6, 7], fromNumber: '+971500000000', agentId: null, ...over });
  const setup = (camp: DialCampaign, store = new MemoryStore()) => {
    store.campaigns.set(camp.id, camp.status);
    const calls = new Map<string, string>([['cc1', 'pending'], ['cc2', 'pending']]);
    const dialed: string[] = [];
    const ports: DialPorts = {
      getCampaign: async () => ({ ...camp, status: store.campaigns.get(camp.id) as string }),
      getTenantTimezone: async () => 'UTC',
      claimCall: async (_c, id) => { if (calls.get(id) !== 'pending') return null; calls.set(id, 'calling'); return { id, phoneNumber: '+9715', purpose: 'campaign', context: null, leadId: null, customerId: null }; },
      releaseCall: async (id) => { calls.set(id, 'pending'); },
      failCall: async (_c, id) => { calls.set(id, 'failed'); },
      markCampaignRunning: async (id) => { if (store.campaigns.get(id) === 'scheduled') store.campaigns.set(id, 'running'); },
      dial: async ({ call }) => { dialed.push(call.id); return { callSid: `CA${call.id}` }; },
    };
    return { store, ports, calls, dialed };
  };
  const enqueue = (store: MemoryStore, at = T0) => store.enqueue(dialJobsFor({ tenantId: 't1', campaignId: 'c1', callIds: ['cc1', 'cc2'], startAt: new Date(at) }));

  it('dials at the scheduled start time, not before', async () => {
    const clock = new FakeClock(T0);
    const { store, ports, dialed } = setup(campaign({ status: 'scheduled' }));
    await enqueue(store, T0 + 3600_000); // starts 07:00 UTC = 11:00 Dubai
    const s = makeScheduler(store, clock, { campaign_dial: dialHandler(ports) });
    await s.tick();
    expect(dialed).toEqual([]);
    clock.advance(3600_000);
    await s.tick();
    expect(dialed).toEqual(['cc1']);
    expect(store.campaigns.get('c1')).toBe('running'); // scheduled -> running on the first dial
    clock.advance(2000);
    await s.tick();
    expect(dialed).toEqual(['cc1', 'cc2']);
  });

  it('holds calls outside calling hours until the window opens, without using up an attempt', async () => {
    const clock = new FakeClock(Date.UTC(2026, 10, 16, 17, 0)); // 21:00 Dubai
    const { store, ports, dialed, calls } = setup(campaign());
    await enqueue(store, clock.ms);
    const s = makeScheduler(store, clock, { campaign_dial: dialHandler(ports) });
    await s.tick();
    expect(dialed).toEqual([]);
    expect(calls.get('cc1')).toBe('pending'); // untouched
    expect(store.jobs[0]).toMatchObject({ status: 'pending', attempts: 0 });
    expect(store.jobs[0].runAt.toISOString()).toBe('2026-11-17T05:00:00.000Z'); // 09:00 Dubai next morning
    clock.ms = Date.UTC(2026, 10, 17, 5, 0);
    await s.tick();
    expect([...dialed].sort()).toEqual(['cc1', 'cc2']); // the per-tick batch limit (3) paces the dialling once the window opens
  });

  it('falls back to the business timezone when the campaign has none', async () => {
    const clock = new FakeClock(T0); // 06:00 UTC
    const { store, ports, dialed } = setup(campaign({ timezone: null }));
    ports.getTenantTimezone = async () => 'America/New_York'; // 01:00 there: closed
    await enqueue(store);
    await makeScheduler(store, clock, { campaign_dial: dialHandler(ports) }).tick();
    expect(dialed).toEqual([]);
  });

  it('pause stops dialling, resume continues, nothing is dialled twice', async () => {
    const clock = new FakeClock(T0);
    const { store, ports, dialed } = setup(campaign());
    await enqueue(store);
    const s = makeScheduler(store, clock, { campaign_dial: dialHandler(ports) }, { batch: { appointment_reminder: 1, campaign_dial: 1 } });
    await s.tick();
    expect(dialed).toEqual(['cc1']);
    store.campaigns.set('c1', 'paused');
    clock.advance(60_000);
    await s.tick();
    await s.tick();
    expect(dialed).toEqual(['cc1']); // paused: the second job is not even claimed
    expect(store.byStatus('pending')).toHaveLength(1);
    store.campaigns.set('c1', 'running');
    await s.tick();
    expect(dialed).toEqual(['cc1', 'cc2']);
    await s.tick();
    expect(dialed).toEqual(['cc1', 'cc2']);
  });

  it('a pause that lands after a job was claimed puts the job back instead of dialling', async () => {
    const clock = new FakeClock(T0);
    const { store, ports, dialed, calls } = setup(campaign());
    await enqueue(store);
    const [claimed] = await store.claimDue({ now: clock.now(), limit: 1, kinds: ['campaign_dial'], leaseMs: 120_000, workerId: 'w' });
    store.campaigns.set('c1', 'paused');
    const out = await dialHandler(ports).run(claimed, { now: clock.now() });
    expect(out.type).toBe('defer');
    expect(dialed).toEqual([]);
    expect(calls.get('cc1')).toBe('pending');
  });

  it('stop cancels what is queued and nothing more is dialled', async () => {
    const clock = new FakeClock(T0);
    const { store, ports, dialed } = setup(campaign());
    await enqueue(store);
    store.campaigns.set('c1', 'cancelled');
    expect(await store.cancelCampaignJobs('c1', clock.now())).toBe(2);
    await makeScheduler(store, clock, { campaign_dial: dialHandler(ports) }).tick();
    expect(dialed).toEqual([]);
  });

  it('retries a failed dial (released back to pending) and marks it failed when attempts run out', async () => {
    const clock = new FakeClock(T0);
    const { store, ports, calls, dialed } = setup(campaign());
    ports.dial = async () => { throw new Error('twilio 500'); };
    await store.enqueue(dialJobsFor({ tenantId: 't1', campaignId: 'c1', callIds: ['cc1'], startAt: clock.now(), maxAttempts: 2 }));
    const s = makeScheduler(store, clock, { campaign_dial: dialHandler(ports) });
    await s.tick();
    expect(calls.get('cc1')).toBe('pending');
    expect(store.jobs[0]).toMatchObject({ status: 'pending', attempts: 1 });
    clock.advance(retryDelayMs(1));
    await s.tick();
    expect(store.jobs[0].status).toBe('failed');
    expect(calls.get('cc1')).toBe('failed');
    expect(dialed).toEqual([]);
  });

  it('a consent refusal fails the call at once without retrying', async () => {
    const clock = new FakeClock(T0);
    const { store, ports, calls } = setup(campaign());
    const refusal = Object.assign(new Error('Outbound contact refused: no_contact_consent'), { name: 'ConsentRequiredError' });
    ports.dial = async () => { throw refusal; };
    await store.enqueue(dialJobsFor({ tenantId: 't1', campaignId: 'c1', callIds: ['cc1'], startAt: clock.now() }));
    await makeScheduler(store, clock, { campaign_dial: dialHandler(ports) }).tick();
    expect(store.jobs[0]).toMatchObject({ status: 'failed', attempts: 1 });
    expect(calls.get('cc1')).toBe('failed');
  });

  it('spreads a campaign out: each target is queued two seconds after the last', () => {
    const jobs = dialJobsFor({ tenantId: 't1', campaignId: 'c1', callIds: ['a', 'b', 'c'], startAt: new Date(T0) });
    expect(jobs.map((j) => j.runAt.getTime() - T0)).toEqual([0, 2000, 4000]);
    expect(jobs.map((j) => j.dedupeKey)).toEqual(['dial:a', 'dial:b', 'dial:c']);
  });
});

describe('campaign controls', () => {
  it('allows only sensible transitions', () => {
    expect(nextCampaignStatus('draft', 'start')).toBe('running');
    expect(nextCampaignStatus('draft', 'start', { startsLater: true })).toBe('scheduled');
    expect(nextCampaignStatus('running', 'start')).toBeNull(); // starting twice used to dial everyone twice
    expect(nextCampaignStatus('running', 'pause')).toBe('paused');
    expect(nextCampaignStatus('scheduled', 'pause')).toBe('paused');
    expect(nextCampaignStatus('paused', 'pause')).toBeNull();
    expect(nextCampaignStatus('paused', 'resume')).toBe('running');
    expect(nextCampaignStatus('running', 'resume')).toBeNull();
    expect(nextCampaignStatus('paused', 'stop')).toBe('cancelled');
    expect(nextCampaignStatus('completed', 'stop')).toBeNull();
    expect(nextCampaignStatus('cancelled', 'resume')).toBeNull();
  });
});
