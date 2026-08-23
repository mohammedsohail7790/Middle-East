import { calendarService } from './calendar.service.js';

export class GoogleCalendarService {
    async hasConnection(tenantId: string): Promise<boolean> {
        return calendarService.hasActiveConnection(tenantId);
    }

    async getAvailability(tenantId: string, start: Date, end: Date): Promise<boolean> {
        try {
            if (!(await this.hasConnection(tenantId))) {
                return true;
            }
            const slots = await calendarService.getAvailability(tenantId, start, end);
            const freeSlots = slots.filter((s) => s.available);
            return freeSlots.length > 0;
        } catch {
            return true;
        }
    }

    /** Google Calendar event id (external), not local appointments.id */
    async createEvent(tenantId: string, eventDetails: { summary: string, start: Date, end: Date, description: string }): Promise<string> {
        return calendarService.createGoogleEventOnly(
            tenantId,
            eventDetails.summary,
            eventDetails.start,
            eventDetails.end,
            eventDetails.description
        );
    }

    async updateEvent(tenantId: string, eventId: string, start: Date, end: Date): Promise<void> {
        await calendarService.updateEvent(tenantId, eventId, start, end);
    }
}

export const googleCalendarService = new GoogleCalendarService();
