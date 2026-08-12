/**
 * Google Calendar integration — skeleton stub.
 * No external calendar sync in the skeleton; hasConnection() always reports
 * false so callers fall through to internal-only appointment booking.
 */

export interface CalendarSlot {
  start: string;
  end: string;
  available: boolean;
}

export const googleCalendarService = {
  async hasConnection(_tenantId: string): Promise<boolean> {
    return false;
  },

  /** Returns whether the given window is free on the tenant's Google Calendar. */
  async getAvailability(_tenantId: string, _start: Date, _end: Date): Promise<boolean> {
    return true;
  },

  async createEvent(_tenantId: string, _event: Record<string, unknown>): Promise<string | null> {
    return null;
  },

  async updateEvent(_tenantId: string, _eventId: string, _start: Date, _end: Date): Promise<boolean> {
    return false;
  },
};
