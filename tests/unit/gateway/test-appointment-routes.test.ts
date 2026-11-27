/**
 * Who may use the test-appointment tool: only the workspace owner, signed in with their own login (not an API key or a
 * service call). Everyone else is refused and nothing is booked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

const state = vi.hoisted(() => ({
  tenant: { id: 'tenant-1', userId: 'user-1', source: 'user_jwt' } as Record<string, unknown> | undefined,
  owner: true,
  created: [] as Array<Record<string, unknown>>,
  google: true,
}));

vi.mock('../../../apps/gateway/src/services/logger.js', () => ({ logger: { warn: () => {}, debug: () => {}, info: () => {}, error: () => {} } }));
vi.mock('../../../apps/gateway/src/services/voice/security.js', () => ({
  requireVoiceApiAccess: (req: Record<string, unknown>, _res: unknown, next: () => void) => {
    req.resolvedTenantId = 'tenant-1';
    req.tenant = state.tenant;
    next();
  },
  voiceRateLimit: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../../../apps/gateway/src/services/voice/tenant-scope.js', () => ({ voiceDb: { query: async () => ({ rows: [] }) } }));
vi.mock('../../../apps/gateway/src/services/appointments/appointment.service.js', () => ({
  appointmentService: {
    createAppointment: async (input: Record<string, unknown>) => {
      state.created.push(input);
      return { success: true, message: 'Booked', appointmentId: 'appt-1', scheduledTime: String(input.time) };
    },
  },
}));
vi.mock('../../../apps/gateway/src/services/appointments/tenant-timezone.js', () => ({ getTenantTimezone: async () => 'Asia/Dubai' }));
vi.mock('../../../apps/gateway/src/services/calendar/calendar.service.js', () => ({
  calendarService: { hasActiveConnection: async () => state.google },
}));
vi.mock('../../../apps/gateway/src/services/enterprise/rbac.service.js', () => ({
  isTenantOwner: async () => state.owner,
}));

import { createAppointmentsRouter } from '../../../apps/gateway/src/services/appointments/appointments.controller.js';

let server: http.Server | undefined;
afterEach(() => new Promise<void>((done) => (server ? server.close(() => done()) : done())));
beforeEach(() => {
  state.tenant = { id: 'tenant-1', userId: 'user-1', source: 'user_jwt' };
  state.owner = true;
  state.created = [];
  state.google = true;
});

async function call(method: 'GET' | 'POST', path: string): Promise<{ status: number; body: any }> {
  const app = express();
  app.use(express.json());
  app.use('/appointments', createAppointmentsRouter());
  server = http.createServer(app);
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: `/appointments${path}`, method, headers: { 'content-type': 'application/json' } }, (res) => {
      let b = '';
      res.on('data', (c) => (b += c));
      res.on('end', () => resolve({ status: res.statusCode || 0, body: b ? JSON.parse(b) : null }));
    });
    req.on('error', reject);
    req.end(method === 'POST' ? '{}' : undefined);
  });
}

describe('GET /appointments/test-access', () => {
  it('is allowed for the signed-in owner, and says whether Google is connected', async () => {
    const res = await call('GET', '/test-access');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ allowed: true, googleConnected: true });
  });

  it('is not allowed for anyone who is not the owner', async () => {
    state.owner = false;
    expect((await call('GET', '/test-access')).body.data.allowed).toBe(false);
  });

  it('is not allowed for an API key or a service call, even if the tenant owner id matched', async () => {
    state.tenant = { id: 'tenant-1', userId: 'user-1', source: 'api_key' };
    expect((await call('GET', '/test-access')).body.data.allowed).toBe(false);
    state.tenant = undefined;
    expect((await call('GET', '/test-access')).body.data.allowed).toBe(false);
  });
});

describe('POST /appointments/test', () => {
  it('books one labelled test appointment for the owner', async () => {
    const res = await call('POST', '/test');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: 'appt-1', googleConnected: true });
    expect(state.created).toHaveLength(1);
    expect(state.created[0]).toMatchObject({ tenantId: 'tenant-1', name: 'Halla AI test booking', service: 'Test appointment' });
  });

  it('refuses everyone else with 403 and books nothing', async () => {
    state.owner = false;
    const res = await call('POST', '/test');
    expect(res.status).toBe(403);
    expect(state.created).toHaveLength(0);
  });

  it('refuses a non-login caller with 403 and books nothing', async () => {
    state.tenant = { id: 'tenant-1', source: 'internal_service' };
    expect((await call('POST', '/test')).status).toBe(403);
    expect(state.created).toHaveLength(0);
  });
});
