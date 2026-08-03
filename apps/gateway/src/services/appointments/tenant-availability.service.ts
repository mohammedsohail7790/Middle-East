import { voiceDb } from '../voice/tenant-scope.js';
import { logger } from '../logger.js';
import { getTenantTimezone } from './tenant-timezone.js';
import {
  getBusinessHoursColumnSet,
  rowIsOpen,
} from '../business-hours/business-hours-schema.js';

const DAY_NAME_TO_DOW: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export interface AvailabilitySlotResult {
  start: Date;
  end: Date;
  label: string;
}

type CachedAvailability = {
  slots: AvailabilitySlotResult[];
  timezone: string;
  expiresAt: number;
};

const AVAIL_CACHE_TTL_MS = Number(process.env.VOICE_AVAIL_CACHE_TTL_MS || 45_000);
const availCache = new Map<string, CachedAvailability>();

const EXTERNAL_AVAIL_TIMEOUT_MS = Number(process.env.VOICE_EXTERNAL_AVAIL_TIMEOUT_MS || 3000);

/**
 * Real busy periods from whichever external calendar is connected (Google takes
 * priority over Outlook if both are somehow connected). Time-boxed so a slow or
 * broken external API can never stall a live call — falls back to [] (i.e. rely
 * on internal business_hours + appointments only, today's behavior) on timeout
 * or error.
 */
async function getExternalBusyIntervals(
  tenantId: string,
  rangeStart: Date,
  rangeEnd: Date,
  durationMinutes: number
): Promise<{ start: number; end: number }[]> {
  try {
    const { calendarService } = await import('../calendar/calendar.service.js');
    if (await calendarService.hasActiveConnection(tenantId)) {
      const slots = await Promise.race([
        calendarService.getAvailability(tenantId, rangeStart, rangeEnd, durationMinutes),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), EXTERNAL_AVAIL_TIMEOUT_MS)),
      ]);
      if (!slots) {
        logger.warn('EXTERNAL_AVAILABILITY_TIMEOUT', { tenantId, provider: 'google' });
        return [];
      }
      return slots
        .filter((s) => !s.available)
        .map((s) => ({ start: new Date(s.start).getTime(), end: new Date(s.end).getTime() }));
    }

    const { outlookCalendarService } = await import('../calendar/outlook.calendar.service.js');
    const outlookConn = await outlookCalendarService.getConnection(tenantId);
    if (outlookConn) {
      const slots = await Promise.race([
        outlookCalendarService.getAvailability(tenantId, rangeStart, rangeEnd, durationMinutes),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), EXTERNAL_AVAIL_TIMEOUT_MS)),
      ]);
      if (!slots) {
        logger.warn('EXTERNAL_AVAILABILITY_TIMEOUT', { tenantId, provider: 'outlook' });
        return [];
      }
      return slots
        .filter((s) => !s.available)
        .map((s) => ({ start: new Date(s.start).getTime(), end: new Date(s.end).getTime() }));
    }

    return [];
  } catch (err) {
    logger.warn('EXTERNAL_AVAILABILITY_CHECK_FAILED', { tenantId, error: String(err) });
    return [];
  }
}

function availabilityCacheKey(
  tenantId: string,
  rangeStartIso: string,
  horizonDays: number,
  durationMinutes: number
): string {
  return `${tenantId}:${rangeStartIso}:${horizonDays}:${durationMinutes}`;
}

export function invalidateTenantAvailabilityCache(tenantId: string): void {
  for (const key of availCache.keys()) {
    if (key.startsWith(`${tenantId}:`)) {
      availCache.delete(key);
    }
  }
}

/**
 * Tenant-scoped availability from business_hours + internal appointments, cross-checked
 * against the connected external calendar's real busy times (Google or Outlook) when one
 * is connected and reachable within the timeout.
 */
export async function getTenantAvailabilitySlots(
  tenantId: string,
  options?: { date?: string; durationMinutes?: number; horizonDays?: number }
): Promise<{ slots: AvailabilitySlotResult[]; timezone: string }> {
  const durationMinutes = options?.durationMinutes ?? 60;
  const horizonDays = options?.horizonDays ?? 10;
  const rangeStart = options?.date ? new Date(options.date) : new Date();
  if (Number.isNaN(rangeStart.getTime())) {
    rangeStart.setTime(Date.now());
  }
  rangeStart.setHours(0, 0, 0, 0);

  const rangeEnd = new Date(rangeStart);
  rangeEnd.setDate(rangeEnd.getDate() + horizonDays);

  const cacheKey = availabilityCacheKey(
    tenantId,
    rangeStart.toISOString().slice(0, 10),
    horizonDays,
    durationMinutes
  );
  const cached = availCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return {
      slots: cached.slots.map((s) => ({
        start: new Date(s.start),
        end: new Date(s.end),
        label: s.label,
      })),
      timezone: cached.timezone,
    };
  }

  type HourRow = { day_of_week: number; start_time: string; end_time: string; is_open: boolean };

  const columns = await getBusinessHoursColumnSet(voiceDb);
  const [timezone, bhResult, bookedResult] = await Promise.all([
    getTenantTimezone(tenantId),
    voiceDb.query(
      `SELECT day_of_week,
              ${columns.startCol} AS start_time,
              ${columns.endCol} AS end_time,
              ${columns.openCol} AS open_flag
       FROM public.business_hours
       WHERE tenant_id = $1`,
      [tenantId]
    ),
    voiceDb.query(
      `SELECT scheduled_time
       FROM public.appointments
       WHERE tenant_id = $1
         AND scheduled_time >= $2
         AND scheduled_time < $3
         AND status NOT IN ('cancelled', 'canceled')`,
      [tenantId, rangeStart.toISOString(), rangeEnd.toISOString()]
    ),
  ]);

  const hours: HourRow[] = (bhResult.rows as Array<Record<string, unknown>>).map((row) => ({
    day_of_week: Number(row.day_of_week),
    start_time: String(row.start_time ?? '').slice(0, 5),
    end_time: String(row.end_time ?? '').slice(0, 5),
    is_open: rowIsOpen(row, columns),
  }));

  if (!hours.length) {
    const tenantRow = await voiceDb.query(
      `SELECT metadata FROM public.voice_tenants WHERE id = $1 LIMIT 1`,
      [tenantId]
    );
    const meta = tenantRow.rows[0]?.metadata as {
      business_hours?: { days?: string[]; start?: string; end?: string };
    };
    const bh = meta?.business_hours;
    if (bh?.days?.length && bh.start && bh.end) {
      for (const dayName of bh.days) {
        const dow = DAY_NAME_TO_DOW[dayName];
        if (dow === undefined) continue;
        hours.push({
          day_of_week: dow,
          start_time: bh.start.length === 5 ? bh.start : `${bh.start}:00`.slice(0, 5),
          end_time: bh.end.length === 5 ? bh.end : `${bh.end}:00`.slice(0, 5),
          is_open: true,
        });
      }
    }
  }

  if (!hours.length) {
    for (const dow of [1, 2, 3, 4, 5]) {
      hours.push({
        day_of_week: dow,
        start_time: '09:00',
        end_time: '17:00',
        is_open: true,
      });
    }
  }

  const booked = (bookedResult.rows as { scheduled_time: Date | string }[]).map((r) =>
    new Date(r.scheduled_time).getTime()
  );

  const externalBusy = await getExternalBusyIntervals(tenantId, rangeStart, rangeEnd, durationMinutes);

  const slots: AvailabilitySlotResult[] = [];
  const now = Date.now();
  const cursor = new Date(rangeStart);

  while (cursor < rangeEnd && slots.length < 12) {
    const dow = cursor.getDay();
    const dayHours = hours.find((h) => h.day_of_week === dow && h.is_open);
    if (dayHours) {
      const [sh, sm] = dayHours.start_time.split(':').map(Number);
      const [eh, em] = dayHours.end_time.split(':').map(Number);
      const slotStart = new Date(cursor);
      slotStart.setHours(sh, sm || 0, 0, 0);
      const dayEnd = new Date(cursor);
      dayEnd.setHours(eh, em || 0, 0, 0);

      let t = new Date(slotStart);
      while (t.getTime() + durationMinutes * 60_000 <= dayEnd.getTime() && slots.length < 12) {
        const slotEnd = new Date(t.getTime() + durationMinutes * 60_000);
        if (t.getTime() > now) {
          const conflicts = booked.some(
            (b) => Math.abs(b - t.getTime()) < durationMinutes * 60_000
          );
          const externalConflict = externalBusy.some(
            (b) => t.getTime() < b.end && slotEnd.getTime() > b.start
          );
          if (!conflicts && !externalConflict) {
            slots.push({
              start: new Date(t),
              end: slotEnd,
              label: t.toLocaleString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                timeZone: timezone,
              }),
            });
          }
        }
        t = new Date(t.getTime() + durationMinutes * 60_000);
      }
    }
    cursor.setDate(cursor.getDate() + 1);
    cursor.setHours(0, 0, 0, 0);
  }

  logger.debug('TENANT_AVAILABILITY', {
    tenantId,
    slotCount: slots.length,
    timezone,
    cached: false,
  });

  availCache.set(cacheKey, {
    slots,
    timezone,
    expiresAt: Date.now() + AVAIL_CACHE_TTL_MS,
  });

  return { slots, timezone };
}
