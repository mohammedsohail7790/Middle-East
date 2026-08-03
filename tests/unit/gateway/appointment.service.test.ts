import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../apps/gateway/src/services/voice/tenant-scope.js', () => ({
  voiceDb: { query: vi.fn() },
}));

vi.mock('../../../apps/gateway/src/services/calendar/google.calendar.service.js', () => ({
  googleCalendarService: {
    hasConnection: vi.fn(),
    createEvent: vi.fn(),
    getAvailability: vi.fn(),
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
