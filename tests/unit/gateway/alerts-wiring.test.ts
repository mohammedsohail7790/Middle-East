import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';

const h = vi.hoisted(() => ({
  query: vi.fn(),
  raiseBilling: vi.fn(),
  raiseIntegration: vi.fn(),
  tenant: { id: 'tenant-1' as string | null },
  store: { listAlerts: vi.fn(), markAlertRead: vi.fn(), markAllAlertsRead: vi.fn() },
}));

vi.mock('../../../apps/gateway/src/services/db/pool.js', () => ({ pool: { query: h.query } }));
vi.mock('../../../apps/gateway/src/services/alerts/alert-service.js', () => ({
  raiseBillingWarningAlert: h.raiseBilling,
  raiseIntegrationFailureAlert: h.raiseIntegration,
  alertEmailsEnabled: vi.fn().mockResolvedValue(true),
}));
vi.mock('../../../apps/gateway/src/services/alerts/alert-store.js', () => h.store);
vi.mock('../../../apps/gateway/src/services/auth/tenant-context.js', () => ({ getTenantId: () => h.tenant.id }));
vi.mock('../../../apps/gateway/src/services/voice/alert.service.js', () => ({ voiceAlertService: { onCallStarted: vi.fn(), onCallError: vi.fn(), onLatency: vi.fn(), onIntegrationFailure: vi.fn() } }));

import { trialManager } from '../../../apps/gateway/src/services/billing/trial.service.js';
import { voiceMetrics } from '../../../apps/gateway/src/services/voice/voice.metrics.js';
import { createAlertsRouter } from '../../../apps/gateway/src/services/alerts/alerts.controller.js';

const tick = () => new Promise((r) => setTimeout(r, 20));

beforeEach(() => {
  Object.values(h.store).forEach((f) => f.mockReset());
  h.raiseBilling.mockReset().mockResolvedValue(undefined);
  h.raiseIntegration.mockReset().mockResolvedValue(undefined);
  h.query.mockReset();
  h.tenant.id = 'tenant-1';
});

describe('billing warnings reach the alerts inbox', () => {
  it('raises an alert from every warning that is stored, with the stored id', async () => {
    h.query.mockResolvedValue({ rows: [{ id: 'w1', warning_type: 'usage_90_percent', message: 'm', details: { minutesUsed: 9 }, acknowledged: false, created_at: new Date() }] });
    const w = await trialManager.createWarning('tenant-1', 'usage_90_percent', 'm', { minutesUsed: 9 });
    await tick();
    expect(w.id).toBe('w1');
    expect(h.raiseBilling).toHaveBeenCalledWith('tenant-1', expect.objectContaining({ id: 'w1', warningType: 'usage_90_percent' }));
  });

  it('still returns the warning if raising the alert fails', async () => {
    h.query.mockResolvedValue({ rows: [{ id: 'w2', warning_type: 'trial_expired', message: 'm', details: {}, acknowledged: false, created_at: new Date() }] });
    h.raiseBilling.mockRejectedValue(new Error('boom'));
    await expect(trialManager.createWarning('tenant-1', 'trial_expired', 'm', {})).resolves.toMatchObject({ id: 'w2' });
    await tick();
  });
});

describe('integration failures reach the alerts inbox', () => {
  it('raises an alert for the business and tool', async () => {
    voiceMetrics.integrationFailure('tenant-1', 'hubspot', 'secret internal error text');
    await tick();
    expect(h.raiseIntegration).toHaveBeenCalledWith('tenant-1', 'hubspot');
    expect(JSON.stringify(h.raiseIntegration.mock.calls)).not.toContain('secret internal error');
  });
});

describe('alerts API', () => {
  let server: any;
  let base: string;
  beforeEach(async () => {
    const app = express();
    app.use(express.json());
    app.use('/alerts', createAlertsRouter({ pool: { query: h.query } }));
    await new Promise<void>((r) => { server = app.listen(0, '127.0.0.1', () => r()); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/alerts`;
    return () => new Promise<void>((r) => server.close(() => r()));
  });

  it('lists the business\'s alerts with the unread count', async () => {
    h.store.listAlerts.mockResolvedValue({ alerts: [{ id: 'a' }], unread: 1 });
    const res = await fetch(base);
    expect(await res.json()).toEqual({ success: true, data: { alerts: [{ id: 'a' }], unread: 1 } });
    expect(h.store.listAlerts).toHaveBeenCalledWith(expect.anything(), 'tenant-1', 30);
  });

  it('passes a bounded limit and ignores junk', async () => {
    h.store.listAlerts.mockResolvedValue({ alerts: [], unread: 0 });
    await fetch(`${base}?limit=5`);
    expect(h.store.listAlerts.mock.calls[0][2]).toBe(5);
    await fetch(`${base}?limit=abc`);
    expect(h.store.listAlerts.mock.calls[1][2]).toBe(30);
  });

  it('marks one alert read for this business only, and says 404 when it is not theirs', async () => {
    const id = '11111111-2222-3333-4444-555555555555';
    h.store.markAlertRead.mockResolvedValue(true);
    expect((await fetch(`${base}/${id}/read`, { method: 'POST' })).status).toBe(200);
    expect(h.store.markAlertRead).toHaveBeenCalledWith(expect.anything(), 'tenant-1', id);
    h.store.markAlertRead.mockResolvedValue(false);
    expect((await fetch(`${base}/${id}/read`, { method: 'POST' })).status).toBe(404);
  });

  it('rejects an alert id that is not a UUID before touching the database', async () => {
    expect((await fetch(`${base}/not-an-id/read`, { method: 'POST' })).status).toBe(400);
    expect(h.store.markAlertRead).not.toHaveBeenCalled();
  });

  it('marks all read', async () => {
    h.store.markAllAlertsRead.mockResolvedValue(4);
    expect(await (await fetch(`${base}/read-all`, { method: 'POST' })).json()).toEqual({ success: true, data: { marked: 4 } });
  });

  it('turns alert emails off and on, and rejects anything that is not true or false', async () => {
    h.query.mockResolvedValue({ rowCount: 1 });
    const put = (body: unknown) => fetch(`${base}/settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    expect((await put({ emailEnabled: false })).status).toBe(200);
    expect(h.query.mock.calls[0][1]).toEqual(['tenant-1', 'false']);
    expect((await put({ emailEnabled: 'no' })).status).toBe(400);
    expect(h.query).toHaveBeenCalledTimes(1);
    const get = await (await fetch(`${base}/settings`)).json();
    expect(get).toEqual({ success: true, data: { emailEnabled: true } });
  });

  it('refuses every call without a business', async () => {
    h.tenant.id = null;
    expect((await fetch(base)).status).toBe(400);
    expect((await fetch(`${base}/read-all`, { method: 'POST' })).status).toBe(400);
    expect((await fetch(`${base}/settings`)).status).toBe(400);
  });
});
