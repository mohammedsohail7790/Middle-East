import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../apps/gateway/src/services/voice/tenant-scope.js', () => ({ voiceDb: { query: vi.fn() } }));
vi.mock('../../../apps/gateway/src/services/appointments/tenant-timezone.js', () => ({
  getTenantTimezone: vi.fn().mockResolvedValue('America/New_York'),
  invalidateTenantTimezoneCache: vi.fn(),
}));
vi.mock('../../../apps/gateway/src/services/calendar/google.calendar.service.js', () => ({
  googleCalendarService: { hasConnection: vi.fn().mockResolvedValue(false), getAvailability: vi.fn(), updateEvent: vi.fn() },
}));
vi.mock('../../../apps/gateway/src/services/calendar/calendar.service.js', () => ({
  calendarService: { cancelEvent: vi.fn(), hasActiveConnection: vi.fn().mockResolvedValue(false) },
}));
vi.mock('../../../apps/gateway/src/services/calendar/outlook.calendar.service.js', () => ({
  outlookCalendarService: { getConnection: vi.fn().mockResolvedValue(null) },
}));
vi.mock('../../../apps/gateway/src/services/calendar/acuity.service.js', () => ({
  acuityService: { getConnection: vi.fn().mockResolvedValue(null) },
}));
vi.mock('../../../apps/gateway/src/services/calendar/calendly.service.js', () => {
  class CalendlyApiError extends Error {
    constructor(public status: number, public body = '') {
      super(`Calendly API error ${status}`);
    }
    get isAccessDenied() {
      return this.status === 401 || this.status === 403;
    }
    get isSlotUnavailable() {
      return this.status === 409 || this.status === 422;
    }
  }
  return {
    CalendlyApiError,
    calendlyService: {
      getConnection: vi.fn(),
      getEventTypes: vi.fn(),
      getSchedulingEventType: vi.fn(),
      getAvailableTimes: vi.fn(),
      createBooking: vi.fn(),
      cancelScheduledEvent: vi.fn(),
      getEventInvitee: vi.fn(),
      createInviteLink: vi.fn(),
    },
  };
});
vi.mock('../../../apps/gateway/src/services/leads/leads.service.js', () => ({
  leadsService: {
    createLead: vi.fn().mockResolvedValue({ id: 'lead-1' }),
    updateLeadStatus: vi.fn().mockResolvedValue(undefined),
  },
}));
const sendSms = vi.fn();
vi.mock('../../../apps/gateway/src/services/sms/sms.service.js', () => ({ smsService: { sendSms: (...a: unknown[]) => sendSms(...a) } }));

import { appointmentService } from '../../../apps/gateway/src/services/appointments/appointment.service.js';
import { getTenantAvailabilitySlots } from '../../../apps/gateway/src/services/appointments/tenant-availability.service.js';
import { voiceDb } from '../../../apps/gateway/src/services/voice/tenant-scope.js';
import { calendlyService, CalendlyApiError } from '../../../apps/gateway/src/services/calendar/calendly.service.js';

const cal = calendlyService as any;
const db = voiceDb.query as any;

const EVENT_TYPE = { uri: 'https://api.calendly.com/event_types/ET1', name: 'Consult', durationMinutes: 30 };
const START = new Date(Date.now() + 48 * 3600_000);
START.setMinutes(0, 0, 0);
const slot = (d: Date) => ({ start: d, end: new Date(d.getTime() + 30 * 60_000) });
const OLD_EVENT = 'https://api.calendly.com/scheduled_events/OLD';
const NEW_EVENT = 'https://api.calendly.com/scheduled_events/NEW';

const baseInput = {
  tenantId: 'tenant-1',
  name: 'Jane',
  phone: '+15551234567',
  email: 'jane@x.com',
  service: 'Consult',
  time: START.toISOString(),
};

beforeEach(() => {
  vi.clearAllMocks();
  cal.getConnection.mockResolvedValue({ id: 'c1' });
  cal.getSchedulingEventType.mockResolvedValue(EVENT_TYPE);
  cal.getEventTypes.mockResolvedValue([{ uri: EVENT_TYPE.uri }]);
  cal.getAvailableTimes.mockResolvedValue([slot(START)]);
  cal.createBooking.mockResolvedValue({ eventUri: NEW_EVENT, inviteeUri: 'i' });
  cal.cancelScheduledEvent.mockResolvedValue(undefined);
  cal.getEventInvitee.mockResolvedValue({ name: 'Jane', email: 'jane@x.com' });
  cal.createInviteLink.mockResolvedValue('https://calendly.com/x/y');
  sendSms.mockResolvedValue(undefined);
  db.mockReset();
});

describe('Calendly availability', () => {
  it('offers only the slots Calendly reports as free', async () => {
    const a = new Date(Date.now() + 24 * 3600_000);
    const b = new Date(a.getTime() + 3600_000);
    cal.getAvailableTimes.mockResolvedValue([slot(a), slot(b)]);
    const { slots, timezone } = await getTenantAvailabilitySlots('tenant-avail-1');
    expect(slots.map((s) => s.start.getTime())).toEqual([a.getTime(), b.getTime()]);
    expect(timezone).toBe('America/New_York');
    expect(cal.getAvailableTimes).toHaveBeenCalled();
  });

  it('falls back to business-hours slots when Calendly availability errors', async () => {
    cal.getAvailableTimes.mockRejectedValue(new CalendlyApiError(403));
    db.mockResolvedValue({ rows: [] });
    await getTenantAvailabilitySlots('tenant-avail-2').catch(() => undefined);
    expect(cal.getAvailableTimes).toHaveBeenCalled();
    // fell through to the SQL-backed path instead of returning Calendly slots
    expect(db).toHaveBeenCalled();
  });
});

describe('createAppointment via Calendly', () => {
  it('books through the API after verifying the slot, and records the event uri', async () => {
    db.mockResolvedValueOnce({ rows: [{ id: 'apt-1', scheduled_time: START.toISOString() }] });
    const r = await appointmentService.createAppointment(baseInput);
    expect(r.success).toBe(true);
    expect(r.appointmentId).toBe('apt-1');
    expect(cal.createBooking).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ email: 'jane@x.com', timezone: 'America/New_York', eventType: EVENT_TYPE })
    );
    const [sql, params] = db.mock.calls[0];
    expect(sql).toContain('insert into public.appointments');
    expect(params).toContain('calendly');
    expect(params).toContain(NEW_EVENT);
    expect(sendSms).not.toHaveBeenCalled();
  });

  it('refuses a time Calendly does not list and offers the next open one', async () => {
    const later = new Date(START.getTime() + 2 * 3600_000);
    cal.getAvailableTimes.mockResolvedValue([slot(later)]);
    const r = await appointmentService.createAppointment(baseInput);
    expect(r.success).toBe(false);
    expect(r.alternativeTime).toBe(later.toISOString());
    expect(cal.createBooking).not.toHaveBeenCalled();
    expect(sendSms).not.toHaveBeenCalled();
  });

  it('reports no booking when the slot was taken between check and book (409)', async () => {
    cal.createBooking.mockRejectedValue(new CalendlyApiError(409));
    const r = await appointmentService.createAppointment(baseInput);
    expect(r.success).toBe(false);
    expect(r.message).toMatch(/just taken/);
    expect(db).not.toHaveBeenCalled();
  });

  it('falls back to SMS link, without claiming a booking, when the plan lacks scheduling API (403)', async () => {
    cal.createBooking.mockRejectedValue(new CalendlyApiError(403));
    const r = await appointmentService.createAppointment(baseInput);
    expect(r.success).toBe(true);
    expect(r.appointmentId).toBeUndefined();
    expect(r.message).toMatch(/isn't booked until you choose/);
    expect(sendSms).toHaveBeenCalledWith('tenant-1', baseInput.phone, expect.stringContaining('https://calendly.com/x/y'));
    expect(db).not.toHaveBeenCalled();
  });

  it('falls back to SMS link on a generic API failure (500)', async () => {
    cal.createBooking.mockRejectedValue(new CalendlyApiError(500));
    const r = await appointmentService.createAppointment(baseInput);
    expect(sendSms).toHaveBeenCalled();
    expect(r.appointmentId).toBeUndefined();
    expect(db).not.toHaveBeenCalled();
  });

  it('falls back to SMS link when availability lookup fails', async () => {
    cal.getAvailableTimes.mockRejectedValue(new CalendlyApiError(403));
    const r = await appointmentService.createAppointment(baseInput);
    expect(cal.createBooking).not.toHaveBeenCalled();
    expect(sendSms).toHaveBeenCalled();
    expect(r.message).toMatch(/isn't booked until/);
  });

  it('falls back to SMS link when the caller gave no email', async () => {
    const r = await appointmentService.createAppointment({ ...baseInput, email: undefined });
    expect(cal.createBooking).not.toHaveBeenCalled();
    expect(sendSms).toHaveBeenCalled();
    expect(r.success).toBe(true);
    expect(r.appointmentId).toBeUndefined();
  });

  it('never says booked when the fallback SMS also fails', async () => {
    cal.createBooking.mockRejectedValue(new CalendlyApiError(500));
    sendSms.mockRejectedValue(new Error('twilio down'));
    const r = await appointmentService.createAppointment(baseInput);
    expect(r.success).toBe(false);
    expect(r.message).toMatch(/not booked yet/);
  });

  it('still reports success if only the local row fails after Calendly confirmed', async () => {
    db.mockRejectedValueOnce(new Error('db down'));
    const r = await appointmentService.createAppointment(baseInput);
    expect(cal.createBooking).toHaveBeenCalled();
    expect(r.success).toBe(true);
  });
});

const calendlyRow = {
  id: 'apt-1',
  name: 'Jane',
  phone: '+15551234567',
  service: 'Consult',
  calendar_event_id: null,
  calendar_provider: 'calendly',
  external_calendar_event_id: OLD_EVENT,
};

describe('rescheduleAppointment for a Calendly booking', () => {
  beforeEach(() => {
    db.mockResolvedValueOnce({ rows: [calendlyRow] }).mockResolvedValue({ rows: [] });
  });

  it('books the new time, cancels the old event, and stores the new uri', async () => {
    const r = await appointmentService.rescheduleAppointment('tenant-1', START.toISOString(), { appointmentId: 'apt-1' });
    expect(r.success).toBe(true);
    expect(cal.getEventInvitee).toHaveBeenCalledWith('tenant-1', OLD_EVENT);
    expect(cal.createBooking).toHaveBeenCalledWith('tenant-1', expect.objectContaining({ email: 'jane@x.com' }));
    expect(cal.cancelScheduledEvent).toHaveBeenCalledWith('tenant-1', OLD_EVENT, expect.any(String));
    const order = [cal.createBooking.mock.invocationCallOrder[0], cal.cancelScheduledEvent.mock.invocationCallOrder[0]];
    expect(order[0]).toBeLessThan(order[1]);
    const stored = db.mock.calls.find((c: any[]) => String(c[0]).includes('external_calendar_event_id = $1'));
    expect(stored?.[1][0]).toBe(NEW_EVENT);
  });

  it('leaves the booking unchanged and offers an alternative when the new time is not open', async () => {
    const later = new Date(START.getTime() + 3600_000);
    cal.getAvailableTimes.mockResolvedValue([slot(later)]);
    const r = await appointmentService.rescheduleAppointment('tenant-1', START.toISOString(), { appointmentId: 'apt-1' });
    expect(r.success).toBe(false);
    expect(r.alternativeTime).toBe(later.toISOString());
    expect(cal.createBooking).not.toHaveBeenCalled();
    expect(cal.cancelScheduledEvent).not.toHaveBeenCalled();
  });

  it('leaves the booking unchanged when Calendly availability fails', async () => {
    cal.getAvailableTimes.mockRejectedValue(new CalendlyApiError(500));
    const r = await appointmentService.rescheduleAppointment('tenant-1', START.toISOString(), { appointmentId: 'apt-1' });
    expect(r.success).toBe(false);
    expect(r.message).toMatch(/hasn't changed/);
    expect(db).toHaveBeenCalledTimes(1); // only the lookup
  });

  it('leaves the booking unchanged when the invitee cannot be read', async () => {
    cal.getEventInvitee.mockRejectedValue(new Error('gone'));
    const r = await appointmentService.rescheduleAppointment('tenant-1', START.toISOString(), { appointmentId: 'apt-1' });
    expect(r.success).toBe(false);
    expect(cal.createBooking).not.toHaveBeenCalled();
  });

  it('reports slot-taken (409) without changing anything', async () => {
    cal.createBooking.mockRejectedValue(new CalendlyApiError(409));
    const r = await appointmentService.rescheduleAppointment('tenant-1', START.toISOString(), { appointmentId: 'apt-1' });
    expect(r.success).toBe(false);
    expect(r.message).toMatch(/just taken/);
    expect(cal.cancelScheduledEvent).not.toHaveBeenCalled();
  });

  it('rolls the new booking back if the old one cannot be cancelled', async () => {
    cal.cancelScheduledEvent.mockRejectedValueOnce(new CalendlyApiError(500)).mockResolvedValue(undefined);
    const r = await appointmentService.rescheduleAppointment('tenant-1', START.toISOString(), { appointmentId: 'apt-1' });
    expect(r.success).toBe(false);
    expect(cal.cancelScheduledEvent).toHaveBeenLastCalledWith('tenant-1', NEW_EVENT, expect.any(String));
    expect(db).toHaveBeenCalledTimes(1);
  });
});

describe('cancelAppointment for a Calendly booking', () => {
  it('cancels in Calendly and marks the appointment cancelled', async () => {
    db.mockResolvedValueOnce({ rows: [calendlyRow] }).mockResolvedValue({ rows: [] });
    const r = await appointmentService.cancelAppointment('tenant-1', 'apt-1', 'changed mind');
    expect(r.success).toBe(true);
    expect(cal.cancelScheduledEvent).toHaveBeenCalledWith('tenant-1', OLD_EVENT, 'changed mind');
    expect(db.mock.calls.some((c: any[]) => String(c[0]).includes("status = 'cancelled'"))).toBe(true);
  });

  it('does not report cancelled (and keeps the row booked) when Calendly fails', async () => {
    db.mockResolvedValueOnce({ rows: [calendlyRow] }).mockResolvedValue({ rows: [] });
    cal.cancelScheduledEvent.mockRejectedValue(new CalendlyApiError(500));
    const r = await appointmentService.cancelAppointment('tenant-1', 'apt-1');
    expect(r.success).toBe(false);
    expect(r.message).toMatch(/still booked/);
    expect(db).toHaveBeenCalledTimes(1);
  });
});
