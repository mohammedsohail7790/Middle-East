/**
 * Roles are enforced centrally on every change request (POST/PUT/PATCH/DELETE) from a signed-in dashboard user.
 * Viewer: look only. Agent (operator): everyday work, not settings. Admin: everything except billing changes. Owner: everything.
 * The role is looked up on the server; the old x-dashboard-role header is ignored. API keys, internal service calls and public
 * routes are not touched by this check.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const roleFor = vi.hoisted(() => ({ value: 'readonly' as string, fail: false, calls: 0 }));
vi.mock('../../../apps/gateway/src/services/enterprise/rbac.service.js', async () => {
  const actual = await vi.importActual<typeof import('../../../apps/gateway/src/services/enterprise/rbac.service.js')>(
    '../../../apps/gateway/src/services/enterprise/rbac.service.js',
  );
  return {
    ...actual,
    resolveUserRole: async () => {
      roleFor.calls += 1;
      if (roleFor.fail) throw new Error('db down');
      return roleFor.value;
    },
  };
});

const denied = vi.hoisted(() => [] as Array<Record<string, any>>);
vi.mock('../../../apps/gateway/src/services/enterprise/enterprise-audit.service.js', () => ({
  recordEnterpriseAuditEvent: async (args: Record<string, any>) => { denied.push(args); },
}));

import {
  roleGuardMiddleware,
  requiredPermissionForWrite,
  resetRoleCacheForTests,
} from '../../../apps/gateway/src/middleware/role-guard.js';
import { hasPermission } from '../../../apps/gateway/src/services/enterprise/rbac.service.js';

type Source = 'user_jwt' | 'legacy_jwt' | 'tenant_api_key' | 'internal_service';
function run(method: string, path: string, opts: { source?: Source | null; headers?: Record<string, string> } = {}) {
  const source = opts.source === undefined ? 'user_jwt' : opts.source;
  const req: any = {
    method,
    originalUrl: `/api/v1${path}`,
    path,
    headers: opts.headers ?? {},
    header: (n: string) => (opts.headers ?? {})[n.toLowerCase()],
    tenant: source ? { id: 't1', userId: 'u1', source } : undefined,
  };
  let status = 200;
  let body: any;
  let nexted = false;
  const res: any = { status(c: number) { status = c; return res; }, json(b: unknown) { body = b; return res; } };
  return roleGuardMiddleware(req, res, () => { nexted = true; }).then(() => ({ allowed: nexted, status, body }));
}

beforeEach(() => {
  roleFor.value = 'readonly';
  roleFor.fail = false;
  roleFor.calls = 0;
  resetRoleCacheForTests();
  denied.length = 0;
  delete process.env.CALLIQ_ENTERPRISE_RBAC;
});

describe('which permission a change needs', () => {
  it.each([
    ['/leads/123', 'work:write'],
    ['/calls/abc/notes', 'work:write'],
    ['/appointments', 'work:write'],
    ['/knowledge', 'work:write'],
    ['/voice/outbound', 'work:write'],
    ['/channels/whatsapp/conversations/5/messages', 'work:write'],
    ['/some-new-route', 'work:write'],
    ['/channels/whatsapp/connect', 'ops:write'],
    ['/channels/whatsapp', 'ops:write'],
    ['/ai-config', 'ops:write'],
    ['/phone-numbers/provision', 'ops:write'],
    ['/integrations/hubspot/connect', 'ops:write'],
    ['/automations/abc', 'ops:write'],
    ['/business-hours', 'ops:write'],
    ['/team/invite', 'ops:write'],
    ['/api-keys', 'ops:write'],
    ['/billing/checkout', 'billing:write'],
  ])('%s needs %s', (path, perm) => {
    expect(requiredPermissionForWrite(path)).toBe(perm);
  });

  it.each(['/support/ticket', '/dashboard-assistant/chat', '/search', '/alerts/read', '/team/check-permission', '/team/sync-auth'])('%s is open to every role', (path) => {
    expect(requiredPermissionForWrite(path)).toBeNull();
  });
});

describe('role by area, for a signed-in dashboard user', () => {
  const roles = ['owner', 'admin', 'manager', 'operator', 'analyst', 'readonly'] as const;
  const matrix: Array<[string, string, Record<(typeof roles)[number], boolean>]> = [
    ['GET', '/leads', { owner: true, admin: true, manager: true, operator: true, analyst: true, readonly: true }],
    ['GET', '/ai-config', { owner: true, admin: true, manager: true, operator: true, analyst: true, readonly: true }],
    ['POST', '/leads', { owner: true, admin: true, manager: true, operator: true, analyst: false, readonly: false }],
    ['DELETE', '/knowledge/7', { owner: true, admin: true, manager: true, operator: true, analyst: false, readonly: false }],
    ['PUT', '/ai-config', { owner: true, admin: true, manager: false, operator: false, analyst: false, readonly: false }],
    ['POST', '/phone-numbers/provision', { owner: true, admin: true, manager: false, operator: false, analyst: false, readonly: false }],
    ['POST', '/billing/checkout', { owner: true, admin: false, manager: false, operator: false, analyst: false, readonly: false }],
    ['POST', '/support/ticket', { owner: true, admin: true, manager: true, operator: true, analyst: true, readonly: true }],
  ];
  for (const [method, path, expected] of matrix) {
    for (const role of roles) {
      it(`${role} ${expected[role] ? 'can' : 'cannot'} ${method} ${path}`, async () => {
        roleFor.value = role;
        const r = await run(method, path);
        expect(r.allowed).toBe(expected[role]);
        if (!expected[role]) {
          expect(r.status).toBe(403);
          expect(r.body.success).toBe(false);
          expect(String(r.body.error)).toContain(role);
        }
      });
    }
  }
});

describe('what the check must not touch', () => {
  it('lets API keys and internal service calls through (their own scopes apply)', async () => {
    expect((await run('POST', '/leads', { source: 'tenant_api_key' })).allowed).toBe(true);
    expect((await run('POST', '/ai-config', { source: 'internal_service' })).allowed).toBe(true);
    expect(roleFor.calls).toBe(0);
  });

  it('lets a request with no signed-in workspace through (public routes, sign-up)', async () => {
    expect((await run('POST', '/public/fit-check', { source: null })).allowed).toBe(true);
    expect((await run('POST', '/tenants', { source: null })).allowed).toBe(true);
  });

  it('never looks up a role for a read', async () => {
    await run('GET', '/leads');
    expect(roleFor.calls).toBe(0);
  });

  it('is switched off by CALLIQ_ENTERPRISE_RBAC=false (dev and test only)', async () => {
    process.env.CALLIQ_ENTERPRISE_RBAC = 'false';
    roleFor.value = 'readonly';
    expect((await run('POST', '/ai-config')).allowed).toBe(true);
  });
});

describe('trust and failure', () => {
  it('ignores the x-dashboard-role header the browser sends', async () => {
    roleFor.value = 'readonly';
    const r = await run('POST', '/leads', { headers: { 'x-dashboard-role': 'owner' } });
    expect(r.allowed).toBe(false);
    resetRoleCacheForTests(); // a new person, so the 30 second role memory does not apply
    roleFor.value = 'admin';
    const r2 = await run('POST', '/leads', { headers: { 'x-dashboard-role': 'readonly' } });
    expect(r2.allowed).toBe(true);
  });

  it('refuses the change when the role lookup itself fails', async () => {
    roleFor.fail = true;
    const r = await run('POST', '/leads');
    expect(r.allowed).toBe(false);
    expect(r.status).toBe(403);
  });

  it('looks the role up once for a burst of changes by the same person', async () => {
    roleFor.value = 'operator';
    await run('POST', '/leads');
    await run('PUT', '/leads/1');
    await run('DELETE', '/knowledge/2');
    expect(roleFor.calls).toBe(1);
  });
});

describe('the permission table', () => {
  it('gives everyday work to owner, admin, manager and agent (operator) but not analyst or read-only', () => {
    for (const r of ['owner', 'admin', 'manager', 'operator'] as const) expect(hasPermission(r, 'work:write')).toBe(true);
    for (const r of ['analyst', 'readonly'] as const) expect(hasPermission(r, 'work:write')).toBe(false);
  });
  it('keeps settings changes (ops:write) for owner and admin only', () => {
    expect(hasPermission('operator', 'ops:write')).toBe(false);
    expect(hasPermission('manager', 'ops:write')).toBe(false);
    expect(hasPermission('admin', 'ops:write')).toBe(true);
  });
});

describe('refused changes are recorded', () => {
  it('writes a role_denied audit event with who, their role, and what they tried', async () => {
    roleFor.value = 'readonly';
    await run('PUT', '/ai-config');
    expect(denied).toHaveLength(1);
    expect(denied[0]).toMatchObject({
      tenantId: 't1',
      actorId: 'u1',
      eventType: 'role_denied',
      payload: { method: 'PUT', path: '/ai-config', role: 'readonly', needed: 'ops:write' },
    });
  });

  it('writes nothing when the change is allowed', async () => {
    roleFor.value = 'admin';
    await run('PUT', '/ai-config');
    expect(denied).toHaveLength(0);
  });

  it('writes nothing when the role could not be looked up (that is not a role decision)', async () => {
    roleFor.fail = true;
    await run('POST', '/leads');
    expect(denied).toHaveLength(0);
  });
});
