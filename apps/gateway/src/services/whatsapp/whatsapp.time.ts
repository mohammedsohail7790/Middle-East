/** Timezone helpers: the model speaks in the business's local wall-clock time, the server (UTC) needs an exact instant. */

const HAS_OFFSET = /(Z|[+-]\d{2}:?\d{2})$/i;

function offsetMs(instant: number, timeZone: string): number {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p: Record<string, number> = {};
  for (const part of f.formatToParts(new Date(instant))) if (part.type !== 'literal') p[part.type] = Number(part.value);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/**
 * "2026-10-24T14:00" (no offset) in `timeZone` -> the real instant. Strings that already carry Z or an offset are used as given.
 * Returns null for anything that doesn't parse.
 */
export function parseLocalDateTime(input: string, timeZone: string): Date | null {
  const s = String(input ?? '').trim();
  if (!s) return null;
  if (HAS_OFFSET.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const naive = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], m[6] ? +m[6] : 0);
  try {
    // Two passes settle DST edges: guess the offset at the naive instant, then re-check at the corrected one.
    let t = naive - offsetMs(naive, timeZone);
    t = naive - offsetMs(t, timeZone);
    return new Date(t);
  } catch {
    return null;
  }
}

/** "Saturday 24 October 2026, 14:00" in the business's zone, for the model's context line. */
export function describeNow(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeStyle: 'short', timeZone }).format(now);
}
