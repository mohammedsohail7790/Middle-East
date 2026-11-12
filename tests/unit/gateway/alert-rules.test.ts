import { describe, expect, it } from 'vitest';
import { alertFromBillingWarning, alertFromIntegrationFailure } from '../../../apps/gateway/src/services/alerts/alert-rules.js';

describe('billing warnings as alerts', () => {
  it('turns minutes at 90% into a warning with English and Arabic text and the numbers', () => {
    const a = alertFromBillingWarning({ id: 'w1', warningType: 'usage_90_percent', message: "You've used 675 of 750 minutes.", details: { minutesUsed: 675, includedMinutes: 750, usagePercent: 90 } })!;
    expect(a).toMatchObject({ kind: 'usage_90_percent', severity: 'warning', href: '/dashboard/billing', dedupeKey: 'billing:usage_90_percent:w1' });
    expect(a.body).toBe("You've used 675 of 750 minutes.");
    expect(a.bodyAr).toContain('675');
    expect(a.bodyAr).toContain('750');
    expect(a.titleAr).toMatch(/[؀-ۿ]/);
  });

  it('marks minutes at 100%, an exhausted trial and an expired trial as critical', () => {
    for (const t of ['usage_100_percent', 'trial_minutes_exhausted', 'trial_expired']) {
      expect(alertFromBillingWarning({ warningType: t })?.severity).toBe('critical');
    }
  });

  it('passes over the early trial counters but tells them at 58 minutes', () => {
    for (const t of ['trial_40_minutes', 'trial_50_minutes', 'trial_55_minutes']) expect(alertFromBillingWarning({ warningType: t })).toBeNull();
    expect(alertFromBillingWarning({ warningType: 'trial_58_minutes' })?.severity).toBe('warning');
  });

  it('ignores warning types it does not know', () => {
    expect(alertFromBillingWarning({ warningType: 'something_else' })).toBeNull();
  });

  it('falls back to its own wording when the warning has no message or numbers', () => {
    const a = alertFromBillingWarning({ warningType: 'usage_90_percent', details: null })!;
    expect(a.body).toMatch(/90%/);
    expect(a.bodyAr).toMatch(/90%/);
  });

  it('gives each warning its own dedupe key', () => {
    expect(alertFromBillingWarning({ id: 'a', warningType: 'trial_expired' })!.dedupeKey).not.toBe(alertFromBillingWarning({ id: 'b', warningType: 'trial_expired' })!.dedupeKey);
  });
});

describe('integration failures as alerts', () => {
  const day = new Date('2026-11-12T10:00:00Z');

  it('names the tool and points to the Integrations page', () => {
    const a = alertFromIntegrationFailure('google-calendar', day);
    expect(a.title).toBe('Google Calendar needs attention');
    expect(a.href).toBe('/dashboard/integrations');
    expect(a.severity).toBe('warning');
    expect(a.titleAr).toContain('Google Calendar');
  });

  it('is generic when the tool is not known', () => {
    for (const p of ['multi', '', 'unknown']) expect(alertFromIntegrationFailure(p, day).title).toBe('A connected tool needs attention');
  });

  it('alerts once per tool per day', () => {
    expect(alertFromIntegrationFailure('hubspot', day).dedupeKey).toBe('integration:hubspot:2026-11-12');
    expect(alertFromIntegrationFailure('hubspot', new Date('2026-11-13T01:00:00Z')).dedupeKey).toBe('integration:hubspot:2026-11-13');
    expect(alertFromIntegrationFailure('pipedrive', day).dedupeKey).not.toBe(alertFromIntegrationFailure('hubspot', day).dedupeKey);
  });

  it('never carries raw text from outside into the alert', () => {
    const a = alertFromIntegrationFailure('<script>alert(1)</script>', day);
    expect(JSON.stringify(a)).not.toMatch(/[<>]/);
    expect(a.title).toMatch(/^[A-Za-z0-9 ]+ needs attention$/);
  });
});
