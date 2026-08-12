/**
 * Outlook Calendar integration — skeleton stub.
 * No external calendar sync in the skeleton; getConnection() always resolves
 * null so callers fall through to internal-only appointment booking.
 */

import type { CalendarSlot } from './google.calendar.service.js';

export const outlookCalendarService = {
  async getConnection(_tenantId: string): Promise<Record<string, unknown> | null> {
    return null;
  },

  async getAvailability(
    _tenantId: string,
    _rangeStart: Date,
    _rangeEnd: Date,
    _durationMinutes: number
  ): Promise<CalendarSlot[] | null> {
    return [];
  },

  async createEvent(
    _tenantId: string,
    _title: string,
    _start: Date,
    _end: Date,
    _location: string | undefined,
    _phone: string,
    _description: string
  ): Promise<{ externalId: string } | null> {
    return null;
  },

  async updateEvent(_tenantId: string, _eventId: string, _start: Date, _end: Date): Promise<boolean> {
    return false;
  },

  async cancelEvent(_tenantId: string, _eventId: string): Promise<boolean> {
    return false;
  },
};
