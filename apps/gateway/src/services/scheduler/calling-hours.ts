/**
 * Calling hours: when a campaign may dial, in the tenant's timezone. Pure functions, the clock is always passed in.
 * A window is a start and end time of day (start < end, no overnight windows) on a set of ISO weekdays (1 = Monday).
 */

export interface CallingWindow {
  timezone: string;
  startMinute: number; // minutes after local midnight, inclusive
  endMinute: number; // exclusive
  days: number[];
}

export const DEFAULT_CALLING_START = '09:00';
export const DEFAULT_CALLING_END = '20:00';
export const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];

export function parseHm(value: unknown): number | null {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(value ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function isValidTimezone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

interface LocalParts { year: number; month: number; day: number; minute: number; isoDow: number }

function localParts(date: Date, timezone: string): LocalParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', weekday: 'short',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const dow = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday')) + 1;
  return {
    year: Number(get('year')), month: Number(get('month')), day: Number(get('day')),
    minute: Number(get('hour')) * 60 + Number(get('minute')), isoDow: dow,
  };
}

function offsetMs(utcMs: number, timezone: string): number {
  const p = localParts(new Date(utcMs), timezone);
  const seconds = Math.floor(utcMs / 1000) % 60; // localParts drops seconds; offsets are whole minutes
  return Date.UTC(p.year, p.month - 1, p.day, 0, p.minute, seconds) - (Math.floor(utcMs / 1000) * 1000);
}

/** The UTC instant at which the wall clock in `timezone` reads this local date and minute-of-day. */
function zonedToUtc(year: number, month: number, day: number, minute: number, timezone: string): Date {
  const guess = Date.UTC(year, month - 1, day, 0, minute);
  const first = guess - offsetMs(guess, timezone);
  return new Date(guess - offsetMs(first, timezone));
}

export function isWithinCallingHours(now: Date, w: CallingWindow): boolean {
  const p = localParts(now, w.timezone);
  return w.days.includes(p.isoDow) && p.minute >= w.startMinute && p.minute < w.endMinute;
}

/** `now` when dialling is allowed, otherwise the next moment the window opens. */
export function nextCallingTime(now: Date, w: CallingWindow): Date {
  if (isWithinCallingHours(now, w)) return now;
  if (w.days.length === 0) return new Date(now.getTime() + 24 * 3600_000);
  const p = localParts(now, w.timezone);
  for (let offset = 0; offset <= 8; offset += 1) {
    const civil = new Date(Date.UTC(p.year, p.month - 1, p.day + offset));
    const isoDow = ((civil.getUTCDay() + 6) % 7) + 1;
    if (!w.days.includes(isoDow)) continue;
    if (offset === 0 && p.minute >= w.startMinute) continue; // today's window already closed
    return zonedToUtc(civil.getUTCFullYear(), civil.getUTCMonth() + 1, civil.getUTCDate(), w.startMinute, w.timezone);
  }
  return new Date(now.getTime() + 24 * 3600_000);
}

export type CallingHoursInput = { start?: unknown; end?: unknown; days?: unknown; timezone?: unknown };

/** Validates what the API accepts; fields left out fall back to the defaults. */
export function parseCallingHoursInput(
  input: CallingHoursInput | undefined,
): { ok: true; value: { start: string; end: string; days: number[]; timezone: string | null } } | { ok: false; error: string } {
  const startRaw = input?.start ?? DEFAULT_CALLING_START;
  const endRaw = input?.end ?? DEFAULT_CALLING_END;
  const s = parseHm(startRaw);
  const e = parseHm(endRaw);
  if (s === null || e === null) return { ok: false, error: 'callingHours start and end must look like 09:00' };
  if (s >= e) return { ok: false, error: 'callingHours end must be after start (overnight windows are not supported)' };
  let days = ALL_DAYS;
  if (input?.days !== undefined) {
    if (!Array.isArray(input.days) || input.days.length === 0 || !input.days.every((d) => Number.isInteger(d) && d >= 1 && d <= 7)) {
      return { ok: false, error: 'callingHours days must be a list of weekdays from 1 (Monday) to 7 (Sunday)' };
    }
    days = [...new Set(input.days as number[])].sort();
  }
  let timezone: string | null = null;
  if (input?.timezone !== undefined && input.timezone !== null) {
    if (!isValidTimezone(input.timezone)) return { ok: false, error: 'callingHours timezone must be an IANA timezone such as Asia/Dubai' };
    timezone = input.timezone;
  }
  return { ok: true, value: { start: String(startRaw), end: String(endRaw), days, timezone } };
}
