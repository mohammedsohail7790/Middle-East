import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../apps/gateway/src/services/voice/tenant-scope.js', () => ({
  voiceDb: { query: vi.fn() },
}));

vi.mock('../../../apps/gateway/src/services/calendar/google.calendar.service.js', () => ({
  googleCalendarService: {
    hasConnection: vi.fn(),
    createEvent: vi.fn(),
    getAvailability: vi.fn(),
    updateEvent: vi.fn(),
  },
}));

vi.mock('../../../apps/gateway/src/services/calendar/outlook.calendar.service.js', () => ({
  outlookCalendarService: {
    getConnection: vi.fn().mockResolvedValue(null),
    updateEvent: vi.fn(),
    cancelEvent: vi.fn(),
  },
}));

vi.mock('../../../apps/gateway/src/services/calendar/acuity.service.js', () => ({
  acuityService: {
    getConnection: vi.fn().mockResolvedValue(null),
    getAppointmentTypes: vi.fn(),
    createAppointment: vi.fn(),
    cancelAppointment: vi.fn(),
  },
}));

vi.mock('../../../apps/gateway/src/services/calendar/calendly.service.js', () => ({
  calendlyService: {
    getConnection: vi.fn().mockResolvedValue(null),
    getEventTypes: vi.fn(),
    createInviteLink: vi.fn(),
  },
}));

vi.mock('../../../apps/gateway/src/services/leads/leads.service.js', () => ({
  leadsService: {
    createLead: vi.fn().mockResolvedValue({ id: 'lead-1' }),
    updateLeadStatus: vi.fn().mockResolvedValue(undefined),
  },
}));

import { appointmentService } from '../../../apps/gateway/src/services/appointments/appointment.service.js';
import { voiceDb } from '../../../apps/gateway/src/services/voice/tenant-scope.js';
import { googleCalendarService } from '../../../apps/gateway/src/services/calendar/google.calendar.service.js';

describe('AppointmentService.createAppointment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (googleCalendarService.hasConnection as any).mockResolvedValue(false);
    (voiceDb.query as any)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: 'apt-1', scheduled_time: '2026-06-01T15:00:00.000Z' }],
      });
  });

  it('persists appointment without Google Calendar', async () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const result = await appointmentService.createAppointment({
      tenantId: 'tenant-1',
      name: 'Jane',
      phone: '+15551234567',
      service: 'HVAC',
      time: future,
    });

    expect(result.success).toBe(true);
    expect(result.appointmentId).toBe('apt-1');
    expect(googleCalendarService.createEvent).not.toHaveBeenCalled();
    expect(voiceDb.query).toHaveBeenCalledWith(
      expect.stringContaining('insert into public.appointments'),
      expect.any(Array)
    );
  });
});

describe('AppointmentService.rescheduleAppointment (Google)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (googleCalendarService.hasConnection as any).mockResolvedValue(false);
    (googleCalendarService.updateEvent as any).mockResolvedValue(undefined);
    (voiceDb.query as any).mockImplementation(async (sql: string) => {
      if (/from public\.appointments\s+where id = \$1 and tenant_id = \$2 and status = 'booked'/i.test(sql)) {
        return {
          rows: [
            {
              id: 'apt-uuid-1',
              name: 'Jane',
              phone: '',
              service: 'Test',
              calendar_event_id: 'googleEventIdNotAUuid',
              calendar_provider: 'google',
              external_calendar_event_id: null,
            },
          ],
        };
      }
      return { rows: [] };
    });
  });

  it('gives Google the appointment id (not Google\'s own event id), which updateEvent looks up itself', async () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const result = await appointmentService.rescheduleAppointment('tenant-1', future, { appointmentId: 'apt-uuid-1' });

    expect(result.success).toBe(true);
    expect(googleCalendarService.updateEvent).toHaveBeenCalledTimes(1);
    expect((googleCalendarService.updateEvent as any).mock.calls[0][1]).toBe('apt-uuid-1');
  });
});
