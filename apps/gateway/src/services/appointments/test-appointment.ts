import type { AppointmentResult } from './appointment.service.js';

/**
 * Owner-only "Add test appointment": books a clearly labelled appointment through the same path the AI receptionist uses,
 * so it shows on the dashboard calendar and is sent to the connected Google Calendar. It exists so the owner (and anyone
 * reviewing the Google integration) can see a booking arrive in Google without making a phone call. The label says "test".
 */
export const TEST_APPOINTMENT_NAME = 'Halla AI test booking';
export const TEST_APPOINTMENT_SERVICE = 'Test appointment';

const TEST_HOUR_LOCAL = 14;
const FIRST_DAY_OFFSET = 2;
const DAYS_TO_TRY = 8;

/** How far a time zone is ahead of UTC at a given moment, in minutes. */
function zoneOffsetMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(at);
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'));
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60000);
}

/** The UTC moment at which a wall clock (year, month, day, hour) reads that time in the given time zone. */
function localToUtc(y: number, m: number, d: number, hour: number, timeZone: string): Date {
  const guess = Date.UTC(y, m - 1, d, hour, 0, 0);
  const first = guess - zoneOffsetMinutes(new Date(guess), timeZone) * 60000;
  // The offset can differ at the corrected moment (clocks changing that day), so correct once more.
  return new Date(guess - zoneOffsetMinutes(new Date(first), timeZone) * 60000);
}

function validZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return timeZone;
  } catch {
    return 'UTC';
  }
}

/** Eight candidate slots at 2 PM local time, starting two days out, as ISO strings in time order. */
export function testSlotCandidates(from: Date, timeZone: string): string[] {
  const zone = validZone(timeZone);
  // The calendar date "today" in that zone, so "two days out" means two days on the workspace's own calendar.
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(from);
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const baseUtc = Date.UTC(n('year'), n('month') - 1, n('day'));
  const out: string[] = [];
  for (let i = 0; i < DAYS_TO_TRY; i += 1) {
    const day = new Date(baseUtc + (FIRST_DAY_OFFSET + i) * 86_400_000);
    out.push(localToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), TEST_HOUR_LOCAL, zone).toISOString());
  }
  return out;
}

export type TestAppointmentOutcome =
  | { success: true; id: string; scheduledTime: string; googleConnected: boolean }
  | { success: false; message: string };

export interface TestAppointmentDeps {
  timeZone: string;
  create: (input: { tenantId: string; name: string; phone: string; service: string; time: string }) => Promise<AppointmentResult>;
  hasGoogle: () => Promise<boolean>;
  now?: Date;
}

/** Tries each candidate day in turn and keeps the first one the normal booking path accepts. Never throws. */
export async function createTestAppointment(tenantId: string, deps: TestAppointmentDeps): Promise<TestAppointmentOutcome> {
  try {
    for (const time of testSlotCandidates(deps.now ?? new Date(), deps.timeZone)) {
      const result = await deps.create({
        tenantId,
        name: TEST_APPOINTMENT_NAME,
        phone: '',
        service: TEST_APPOINTMENT_SERVICE,
        time,
      });
      if (result.success && result.appointmentId) {
        return {
          success: true,
          id: result.appointmentId,
          scheduledTime: result.scheduledTime || time,
          googleConnected: await deps.hasGoogle(),
        };
      }
    }
    return { success: false, message: 'No free slot at 2 PM in the next eight days. Free up a day in your calendar and try again.' };
  } catch {
    return { success: false, message: 'The test appointment could not be created.' };
  }
}
