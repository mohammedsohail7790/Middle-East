import { describe, expect, it } from 'vitest';
import { callSummarySubject, formatDuration, renderCallSummaryEmail, type CallSummaryInput } from '../../../apps/gateway/src/services/automation/call-summary-email';

const base: CallSummaryInput = {
  companyName: 'Glow Clinic',
  callerName: 'Sara Ali',
  callerPhone: '+971501234567',
  service: 'Laser hair removal',
  summary: 'Sara wants a laser session next Tuesday afternoon.',
  outcome: 'completed',
  durationMs: 134_000,
  sentiment: 'positive',
  leadQuality: 'hot',
  appointment: 'Tuesday 11 Nov, 15:00',
  includePersonalDetails: true,
};

describe('owner call summary email', () => {
  it('formats durations', () => {
    expect(formatDuration(45_000)).toBe('45s');
    expect(formatDuration(120_000)).toBe('2m');
    expect(formatDuration(134_000)).toBe('2m 14s');
  });

  it('names the caller and the outcome in the subject', () => {
    expect(callSummarySubject(base)).toBe('New call: Sara Ali · Handled by the AI');
    expect(callSummarySubject({ ...base, callerName: undefined })).toContain('+971501234567');
  });

  it('puts the caller, what was booked and the summary in the body', () => {
    const { html } = renderCallSummaryEmail(base);
    expect(html).toContain('Sara Ali');
    expect(html).toContain('+971501234567');
    expect(html).toContain('Tuesday 11 Nov, 15:00');
    expect(html).toContain('Sara wants a laser session next Tuesday afternoon.');
    expect(html).toContain('/en/dashboard/calls');
    expect(html).toContain('Halla AI');
  });

  it('marks an urgent call clearly', () => {
    const out = renderCallSummaryEmail({ ...base, urgent: true });
    expect(out.subject).toBe('URGENT call: Sara Ali');
    expect(out.html).toContain('urgent situation');
    expect(out.html).toContain('Call back: +971501234567');
  });

  it('leaves out every personal detail when the caller did not consent', () => {
    const out = renderCallSummaryEmail({ ...base, includePersonalDetails: false });
    expect(out.subject).toBe('New call: a caller · Handled by the AI');
    for (const secret of ['Sara', '+971501234567', 'Laser', 'Tuesday', 'wants a laser']) {
      expect(out.html).not.toContain(secret);
    }
    expect(out.html).toContain('did not agree to their details being kept');
  });

  it('cannot be used to inject markup', () => {
    const { html } = renderCallSummaryEmail({ ...base, callerName: '<img src=x onerror=alert(1)>', summary: '<script>alert(1)</script>' });
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>alert');
  });
});
