/**
 * Calendar aggregator — skeleton stub.
 * Fans out to per-provider calendar services in the full product; in the
 * skeleton there are no connected providers, so hasActiveConnection() is
 * always false and callers fall through to internal-only appointment booking.
 */

import type { CalendarSlot } from './google.calendar.service.js';

export const calendarService = {
  async hasActiveConnection(_tenantId: string): Promise<boolean> {
    return false;
  },

  async getAvailability(
    _tenantId: string,
    _rangeStart: Date,
    _rangeEnd: Date,
    _durationMinutes: number
  ): Promise<CalendarSlot[] | null> {
    return [];
  },

  async cancelEvent(_tenantId: string, _appointmentId: string): Promise<boolean> {
    return false;
  },
};
