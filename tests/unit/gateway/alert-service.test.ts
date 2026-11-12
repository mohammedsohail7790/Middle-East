import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({ raiseAlert: vi.fn(), markEmailed: vi.fn() }));
vi.mock('../../../apps/gateway/src/services/alerts/alert-store.js', () => store);
vi.mock('../../../apps/gateway/src/services/db/pool.js', () => ({ pool: { query: vi.fn() } }));
vi.mock('../../../apps/gateway/src/services/automation/automation.service.js', () => ({ automationService: { getOwnerNotificationEmails: vi.fn() } }));

import { alertEmailsEnabled, raiseBillingWarningAlert, raiseIntegrationFailureAlert, raiseTenantAlert, renderAlertEmail } from '../../../apps/gateway/src/services/alerts/alert-service.js';
import { alertFromBillingWarning, alertFromIntegrationFailure, type AlertCandidate } from '../../../apps/gateway/src/services/alerts/alert-rules.js';

const candidate = (over: Partial<AlertCandidate> = {}): AlertCandidate => ({ kind: 'usage_90_percent', severity: 'warning', title: 'Minutes low', titleAr: 'الدقائق قليلة', body: 'You have used 90%.', bodyAr: 'استهلكت 90%.', href: '/dashboard/billing', dedupeKey: 'k1', ...over });

let deps: any;
beforeEach(() => {
  store.raiseAlert.mockReset();
  store.markEmailed.mockReset();
  store.raiseAlert.mockResolvedValue({ id: 'a1' });
  store.markEmailed.mockResolvedValue(undefined);
  deps = {
    pool: { query: vi.fn().mockResolvedValue({ rows: [{ v: null }] }) },
    ownerEmails: vi.fn().mockResolvedValue(['owner@acme.test']),
    sendMail: vi.fn().mockResolvedValue(undefined),
    dashboardUrl: 'https://hallaai.com',
  };
});

describe('raising an alert', () => {
  it('saves it and emails the owner, in English with the Arabic underneath, with a link to the right page', async () => {
    expect(await raiseTenantAlert('t1', candidate(), deps)).toBe('created');
    expect(store.raiseAlert).toHaveBeenCalledWith(deps.pool, 't1', expect.objectContaining({ dedupeKey: 'k1' }));
    const mail = deps.sendMail.mock.calls[0][0];
    expect(mail.to).toEqual(['owner@acme.test']);
    expect(mail.subject).toBe('Minutes low');
    expect(mail.html).toContain('You have used 90%.');
    expect(mail.html).toContain('استهلكت 90%.');
    expect(mail.html).toContain('https://hallaai.com/dashboard/billing');
    expect(store.markEmailed).toHaveBeenCalledWith(deps.pool, 't1', 'a1');
  });

  it('puts "Action needed" in the subject of a critical alert', async () => {
    await raiseTenantAlert('t1', candidate({ severity: 'critical' }), deps);
    expect(deps.sendMail.mock.calls[0][0].subject).toBe('Action needed: Minutes low');
  });

  it('does nothing more for an alert that was already raised', async () => {
    store.raiseAlert.mockResolvedValue(null);
    expect(await raiseTenantAlert('t1', candidate(), deps)).toBe('duplicate');
    expect(deps.sendMail).not.toHaveBeenCalled();
  });

  it('does not email information-only alerts', async () => {
    expect(await raiseTenantAlert('t1', candidate({ severity: 'info' }), deps)).toBe('created');
    expect(deps.sendMail).not.toHaveBeenCalled();
  });

  it('respects a business that switched alert emails off, and still saves the alert', async () => {
    deps.pool.query.mockResolvedValue({ rows: [{ v: 'false' }] });
    expect(await raiseTenantAlert('t1', candidate(), deps)).toBe('created');
    expect(store.raiseAlert).toHaveBeenCalled();
    expect(deps.sendMail).not.toHaveBeenCalled();
  });

  it('does not email when there is nobody to email', async () => {
    deps.ownerEmails.mockResolvedValue([]);
    expect(await raiseTenantAlert('t1', candidate(), deps)).toBe('created');
    expect(deps.sendMail).not.toHaveBeenCalled();
  });

  it('keeps the alert when the email fails, and does not mark it emailed', async () => {
    deps.sendMail.mockRejectedValue(new Error('smtp down'));
    expect(await raiseTenantAlert('t1', candidate(), deps)).toBe('created');
    expect(store.markEmailed).not.toHaveBeenCalled();
  });

  it('never throws, even when the database is down', async () => {
    store.raiseAlert.mockRejectedValue(new Error('db down'));
    expect(await raiseTenantAlert('t1', candidate(), deps)).toBe('failed');
  });

  it('escapes anything that could be markup in the email', () => {
    const { html } = renderAlertEmail(candidate({ body: '<b>x</b> & y', bodyAr: '<i>ي</i>' }), 'https://hallaai.com');
    expect(html).not.toContain('<b>x</b>');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
});

describe('alert emails setting', () => {
  it('is on unless the business set alert_emails to false', async () => {
    expect(await alertEmailsEnabled({ query: vi.fn().mockResolvedValue({ rows: [{ v: null }] }) } as any, 't')).toBe(true);
    expect(await alertEmailsEnabled({ query: vi.fn().mockResolvedValue({ rows: [{ v: 'true' }] }) } as any, 't')).toBe(true);
    expect(await alertEmailsEnabled({ query: vi.fn().mockResolvedValue({ rows: [{ v: 'FALSE' }] }) } as any, 't')).toBe(false);
    expect(await alertEmailsEnabled({ query: vi.fn().mockResolvedValue({ rows: [] }) } as any, 't')).toBe(true);
  });
});

describe('the two ways an alert starts', () => {
  it('raises an alert from a billing warning, and ignores one that is not worth it', async () => {
    await raiseBillingWarningAlert('t1', { id: 'w9', warningType: 'usage_100_percent' }, deps);
    expect(store.raiseAlert).toHaveBeenCalledTimes(1);
    expect(store.raiseAlert.mock.calls[0][2].dedupeKey).toBe(alertFromBillingWarning({ id: 'w9', warningType: 'usage_100_percent' })!.dedupeKey);
    store.raiseAlert.mockClear();
    await raiseBillingWarningAlert('t1', { id: 'w10', warningType: 'trial_40_minutes' }, deps);
    expect(store.raiseAlert).not.toHaveBeenCalled();
  });

  it('raises an alert from an integration failure, once per tool per day', async () => {
    await raiseIntegrationFailureAlert('t1', 'hubspot', deps);
    const sent = store.raiseAlert.mock.calls[0][2];
    expect(sent.dedupeKey).toBe(alertFromIntegrationFailure('hubspot', new Date()).dedupeKey);
    expect(sent.kind).toBe('integration_failed');
  });

  it('does nothing without a business', async () => {
    await raiseIntegrationFailureAlert('', 'hubspot', deps);
    expect(store.raiseAlert).not.toHaveBeenCalled();
  });
});
