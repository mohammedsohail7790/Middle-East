import { describe, expect, it } from 'vitest';
import { renderEmergencyAlertEmail } from '../../../apps/gateway/src/services/automation/call-summary-email';
import { closedHolidayKeys, toDateKey } from '../../../apps/gateway/src/services/appointments/tenant-availability.service';

describe('emergency alert email', () => {
  it('is urgent, names the business and gives the callback number', () => {
    const { subject, html } = renderEmergencyAlertEmail({ companyName: 'Glow Clinic', callerPhone: '+971501234567', reasonLabel: 'Possible emergency detected on a call' });
    expect(subject).toBe('URGENT: a caller needs help now (Glow Clinic)');
    expect(html).toContain('Call back now: +971501234567');
    expect(html).toContain('Needs attention now');
    expect(html).toContain('/en/dashboard/calls');
  });

  it('leaves the number out when it is not given, and says where to look', () => {
    const { html } = renderEmergencyAlertEmail({ companyName: 'Glow Clinic', reasonLabel: 'The caller asked for urgent help' });
    expect(html).not.toContain('Call back now');
    expect(html).toContain('Open the call in your dashboard to see the caller.');
  });

  it('cannot be used to inject markup through the business name', () => {
    const { html } = renderEmergencyAlertEmail({ companyName: '<script>alert(1)</script>', reasonLabel: 'x' });
    expect(html).not.toContain('<script>alert');
  });
});

describe('holiday closing days', () => {
  it('builds date keys from the local calendar day', () => {
    expect(toDateKey(new Date(2026, 11, 2))).toBe('2026-12-02');
  });

  it('collects closed holidays from strings and dates and ignores open ones', () => {
    const keys = closedHolidayKeys([
      { date: '2026-12-02', is_closed: true },
      { date: new Date(2026, 11, 3), is_closed: null },
      { date: '2026-12-25T00:00:00.000Z', is_closed: true },
      { date: '2026-12-26', is_closed: false },
      { date: 'not a date', is_closed: true },
    ]);
    expect([...keys].sort()).toEqual(['2026-12-02', '2026-12-03', '2026-12-25']);
  });
});
