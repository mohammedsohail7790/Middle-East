import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { aiRatePerMinute, estimateCostUsd, loadUsage } from '../../../apps/gateway/src/services/usage/team-usage.service.js';
import { createTeamUsageRouter } from '../../../apps/gateway/src/services/usage/team-usage.router.js';
import { requireConsultancyAdmin } from '../../../apps/gateway/src/services/consultancy/admin-access.js';
import { recentTeamAlerts, resetTeamAlertState, sendTeamAlert } from '../../../apps/gateway/src/services/ops-alerts/team-alert.js';

describe('cost estimate', () => {
  it('adds the phone and AI rates per minute', () => {
    expect(estimateCostUsd(10, 0.1)).toBe(1.14);
    expect(estimateCostUsd(0)).toBe(0);
  });
  it('reads the AI rate from the environment, ignoring bad values', () => {
    expect(aiRatePerMinute({ TEAM_USAGE_AI_USD_PER_MINUTE: '0.2' } as any)).toBe(0.2);
    expect(aiRatePerMinute({ TEAM_USAGE_AI_USD_PER_MINUTE: 'abc' } as any)).toBe(0.1);
    expect(aiRatePerMinute({ TEAM_USAGE_AI_USD_PER_MINUTE: '-1' } as any)).toBe(0.1);
    expect(aiRatePerMinute({} as any)).toBe(0.1);
  });
});

describe('loadUsage', () => {
  it('sorts clients by cost and totals them', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [
      { tenant_id: 'a', name: 'Small', calls: 2, minutes: 3 },
      { tenant_id: 'b', name: 'Big', calls: 10, minutes: 60 },
    ] }) };
    const p = await loadUsage(db, 7, 0.1);
    expect(p.rows.map((r) => r.name)).toEqual(['Big', 'Small']);
    expect(p.totals.calls).toBe(12);
    expect(p.totals.minutes).toBe(63);
    expect(db.query.mock.calls[0][1]).toEqual([7]);
  });
});

describe('usage route and team gate', () => {
  let server: Server;
  let base: string;
  const start = async (lookup: (id: string) => Promise<string | null>) => {
    const app = express();
    app.use((req, _res, next) => { (req as any).tenant = { source: 'user_jwt', userId: 'u1' }; next(); });
    app.use(requireConsultancyAdmin({ lookup, env: { CONSULTANCY_ADMIN_EMAILS: 'team@halla.com' } as any }));
    app.use('/usage', createTeamUsageRouter({ db: { query: vi.fn().mockResolvedValue({ rows: [] }) } }));
    await new Promise<void>((r) => { server = app.listen(0, '127.0.0.1', r); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/usage`;
  };
  afterEach(async () => { await new Promise((r) => server.close(r)); });

  it('is refused for anyone not on the team list', async () => {
    await start(async () => 'client@clinic.com');
    expect((await fetch(base)).status).toBe(403);
  });
  it('returns both periods, rates and alerts for the team', async () => {
    await start(async () => 'team@halla.com');
    const res = await fetch(base);
    const json: any = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.periods.map((p: any) => p.days)).toEqual([7, 30]);
    expect(json.data.rates.aiUsdPerMinute).toBe(0.1);
    expect(Array.isArray(json.data.alerts)).toBe(true);
  });
});

describe('sent alert log', () => {
  beforeEach(() => resetTeamAlertState());
  it('remembers an alert that was emailed, but not one that was limited', async () => {
    const deps = { send: vi.fn().mockResolvedValue(undefined), now: () => 5_000_000, recipients: () => ['a@b.com'] };
    await sendTeamAlert({ kind: 'calls_failing', title: 'Calls are failing', detail: 'x' }, deps);
    await sendTeamAlert({ kind: 'calls_failing', title: 'Calls are failing', detail: 'x' }, deps);
    expect(recentTeamAlerts()).toHaveLength(1);
    expect(recentTeamAlerts()[0].title).toBe('Calls are failing');
  });
});
