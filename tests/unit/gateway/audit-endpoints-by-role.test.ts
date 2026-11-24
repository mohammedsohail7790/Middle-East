/**
 * Who may see the audit history, per role (the Viewer / Agent refusals), tested on the real router with a fake database.
 * Reading and exporting need audit:read (owner, admin, manager, agent and analyst have it; read-only does not).
 * Permanent deletion is a change request, so the central role guard sends it to owner and admin only.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

const state = vi.hoisted(() => ({
  role: 'owner' as string,
  queries: [] as string[],
  recorded: [] as Array<Record<string, unknown>>,
}));

vi.mock('../../../apps/gateway/src/services/logger.js', () => ({
  logger: { warn: () => {}, debug: () => {}, info: () => {}, error: () => {} },
}));
vi.mock('../../../apps/gateway/src/middleware/require-tenant.js', () => ({
  requireTenant: (req: Record<string, unknown>, _res: unknown, next: () => void) => {
    req.tenant = { id: 'tenant-1', userId: 'user-1', source: 'user_jwt', scopes: [] };
    next();
  },
}));
vi.mock('../../../apps/gateway/src/services/voice/tenant-scope.js', () => ({
  voiceDb: {
    query: async (sql: string) => {
      state.queries.push(sql);
      if (/count\(\*\)/i.test(sql)) return { rows: [{ n: 1 }] };
      if (/distinct event_type/i.test(sql)) return { rows: [{ event_type: 'lead.updated' }] };
      return {
        rows: [
          {
            id: 'e1',
            created_at: '2026-11-22T10:00:00Z',
            event_type: 'lead.updated',
            actor_email: 'a@b.co',
            actor_id: 'user-1',
            resource_type: 'lead',
            resource_id: 'l1',
            ip_address: '1.2.3.4',
          },
        ],
      };
    },
  },
}));
vi.mock('../../../apps/gateway/src/services/enterprise/enterprise-audit.service.js', () => ({
  recordEnterpriseAuditEvent: async (e: Record<string, unknown>) => {
    state.recorded.push(e);
  },
}));
vi.mock('../../../apps/gateway/src/services/enterprise/rbac.service.js', async (orig) => {
  const real = await orig<typeof import('../../../apps/gateway/src/services/enterprise/rbac.service.js')>();
  return { ...real, resolveUserRole: async () => state.role };
});
vi.mock('../../../apps/gateway/src/services/compliance/compliance.service.js', () => ({
  getRetentionSummary: async () => ({}),
  requestGdprExport: async () => ({ status: 'queued' }),
  requestSecureDelete: async () => ({ status: 'completed', deleted: 1 }),
  redactPii: (t: string) => t,
}));

import { createComplianceRouter } from '../../../apps/gateway/src/services/compliance/compliance.controller.js';
import { requiredPermissionForWrite } from '../../../apps/gateway/src/middleware/role-guard.js';
import { requirePermission, type EnterpriseRole } from '../../../apps/gateway/src/services/enterprise/rbac.service.js';

let server: http.Server | undefined;
afterEach(() => new Promise<void>((done) => (server ? server.close(() => done()) : done())));
beforeEach(() => {
  state.role = 'owner';
  state.queries = [];
  state.recorded = [];
});

async function get(path: string): Promise<{ status: number; body: string }> {
  const app = express();
  app.use('/compliance', createComplianceRouter());
  server = http.createServer(app);
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  return new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port, path: `/compliance${path}` }, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode || 0, body }));
      })
      .on('error', reject);
  });
}

const CAN_READ: EnterpriseRole[] = ['owner', 'admin', 'manager', 'operator', 'analyst'];

describe('audit history by role', () => {
  for (const role of CAN_READ) {
    it(`${role} sees the rows and can export`, async () => {
      state.role = role;
      const list = JSON.parse((await get('/audit-events')).body);
      expect(list.data).toHaveLength(1);
      expect(list.total).toBe(1);
      const csv = await get('/audit-events/export');
      expect(csv.status).toBe(200);
      expect(csv.body).toContain('lead.updated');
      expect(state.recorded.map((e) => e.eventType)).toContain('audit.exported');
    });
  }

  it('read-only gets an empty list, never the rows, and never touches the audit table', async () => {
    state.role = 'readonly';
    const list = JSON.parse((await get('/audit-events')).body);
    expect(list).toEqual({ success: true, data: [], total: 0 });
    const types = JSON.parse((await get('/audit-event-types')).body);
    expect(types.data).toEqual([]);
    expect(state.queries).toHaveLength(0);
  });

  it('read-only cannot export: 403, no data, and no export event is written', async () => {
    state.role = 'readonly';
    const res = await get('/audit-events/export');
    expect(res.status).toBe(403);
    expect(res.body).not.toContain('lead.updated');
    expect(state.queries).toHaveLength(0);
    expect(state.recorded).toHaveLength(0);
  });
});

describe('permanent deletion and the data export need an owner or admin', () => {
  const MAY: Record<EnterpriseRole, boolean> = { owner: true, admin: true, manager: false, operator: false, analyst: false, readonly: false };
  for (const path of ['/compliance/secure-delete', '/compliance/gdpr-export', '/compliance/redact']) {
    it(`the central guard asks for ops:write on ${path}`, () => {
      expect(requiredPermissionForWrite(path)).toBe('ops:write');
    });
  }
  for (const role of Object.keys(MAY) as EnterpriseRole[]) {
    it(`${role} ${MAY[role] ? 'may' : 'may not'} change compliance settings or delete data`, () => {
      expect(requirePermission(role, 'ops:write').ok).toBe(MAY[role]);
    });
  }
});
