/**
 * Owner-only workforce template route (POST /api/v1/tenants/:id/workforce-template) and the provisioning entry points
 * behind it. A real Express app served over a real local HTTP server; the Supabase token verifier, the database pool and
 * the provisioning module are mocked at their own module boundary, so this proves the authorization wiring and the guards,
 * NOT the SQL against a real database (that stays NOT VALIDATED here).
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import express from 'express';
import http from 'http';
import type { AddressInfo } from 'net';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const TENANT_UNKNOWN = '33333333-3333-4333-8333-333333333333';

const applyMock = vi.fn();

vi.mock('../../../apps/gateway/src/services/auth/jwt-tenant-verifier.js', () => ({
  verifySupabaseAuthOnly: vi.fn(async (token: string) => {
    const users: Record<string, string> = { 'owner-a': 'u-owner-a', 'member-a': 'u-member-a', 'owner-b': 'u-owner-b', outsider: 'u-outsider' };
    return users[token] ? { userId: users[token], email: `${users[token]}@example.test`, tenantId: undefined } : { error: 'Unauthorized', status: 401 };
  }),
}));

// voice_tenants: A is owned by u-owner-a (u-member-a is only a team member), B by u-owner-b, plus one tenant with no owner.
vi.mock('../../../apps/gateway/src/services/db/pool.js', () => {
  const tenants: Record<string, { id: string; company_name: string; owner_user_id: string | null }> = {
    '11111111-1111-4111-8111-111111111111': { id: '11111111-1111-4111-8111-111111111111', company_name: 'Tenant A Medical', owner_user_id: 'u-owner-a' },
    '22222222-2222-4222-8222-222222222222': { id: '22222222-2222-4222-8222-222222222222', company_name: 'Tenant B Shop', owner_user_id: 'u-owner-b' },
    '44444444-4444-4444-8444-444444444444': { id: '44444444-4444-4444-8444-444444444444', company_name: 'Ownerless', owner_user_id: null },
  };
  return {
    pool: {
      query: vi.fn(async (sql: string, params: unknown[]) => {
        if (/FROM public\.voice_tenants/i.test(sql)) {
          const row = tenants[String(params[0])];
          return { rows: row ? [row] : [] };
        }
        return { rows: [] };
      }),
    },
  };
});

vi.mock('../../../apps/gateway/src/services/workforce-templates/provision.js', () => {
  class WorkforceProvisioningError extends Error {}
  return { WorkforceProvisioningError, applyWorkforceTemplateForOwner: (...a: unknown[]) => applyMock(...a) };
});

let server: http.Server;
let base = '';

beforeAll(async () => {
  const { createWorkforceOwnerRouter } = await import('../../../apps/gateway/src/services/workforce-templates/workforce-owner.controller.js');
  const app = express();
  app.use(express.json());
  app.use('/api/v1/tenants', createWorkforceOwnerRouter());
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/tenants`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const prevFlag = process.env.HALLA_OWNER_WORKFORCE_APPLY;
beforeEach(() => {
  applyMock.mockReset();
  applyMock.mockImplementation(async (tenantId: string, template: { vertical: string; version: string; agents: Array<{ key: string; name: string; systemPrompt: string }> }, opts: { dryRun?: boolean }) => ({
    tenantId, vertical: template.vertical, templateVersion: template.version, dryRun: Boolean(opts.dryRun), config: 'skipped', governance: 'skipped',
    agents: template.agents.map((a) => ({ key: a.key, name: a.name, id: null, action: opts.dryRun ? 'would_create' : 'created' })),
    warnings: ['The tenant knowledge base is empty.'],
  }));
  process.env.HALLA_OWNER_WORKFORCE_APPLY = 'true';
});
afterEach(() => {
  if (prevFlag === undefined) delete process.env.HALLA_OWNER_WORKFORCE_APPLY; else process.env.HALLA_OWNER_WORKFORCE_APPLY = prevFlag;
});

const post = (tenantId: string, token: string | null, body: unknown) =>
  fetch(`${base}/${tenantId}/workforce-template`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

describe('owner-only workforce template route: access control', () => {
  it('is OFF by default: 404 for everyone, nothing applied', async () => {
    delete process.env.HALLA_OWNER_WORKFORCE_APPLY;
    const r = await post(TENANT_A, 'owner-a', { vertical: 'medical_tourism' });
    expect(r.status).toBe(404);
    expect(applyMock).not.toHaveBeenCalled();
  });

  it('also stays off for any value other than the exact string "true"', async () => {
    for (const v of ['1', 'yes', 'TRUEISH', '']) {
      process.env.HALLA_OWNER_WORKFORCE_APPLY = v;
      expect((await post(TENANT_A, 'owner-a', { vertical: 'medical_tourism' })).status).toBe(404);
    }
    expect(applyMock).not.toHaveBeenCalled();
  });

  it('requires a verified login: no token and a bad token are 401', async () => {
    expect((await post(TENANT_A, null, { vertical: 'medical_tourism' })).status).toBe(401);
    expect((await post(TENANT_A, 'forged', { vertical: 'medical_tourism' })).status).toBe(401);
    expect(applyMock).not.toHaveBeenCalled();
  });

  it('refuses a team member who is not the owner of the same tenant', async () => {
    const r = await post(TENANT_A, 'member-a', { vertical: 'medical_tourism' });
    expect(r.status).toBe(403);
    expect(applyMock).not.toHaveBeenCalled();
  });

  it('tenant isolation: the owner of tenant B cannot touch tenant A (and vice versa), and an outsider cannot touch either', async () => {
    expect((await post(TENANT_A, 'owner-b', { vertical: 'dropshipping' })).status).toBe(403);
    expect((await post(TENANT_B, 'owner-a', { vertical: 'dropshipping' })).status).toBe(403);
    expect((await post(TENANT_A, 'outsider', { vertical: 'medical_tourism' })).status).toBe(403);
    expect(applyMock).not.toHaveBeenCalled();
  });

  it('an unknown tenant and an ownerless tenant are refused with the same 403 (no tenant-id discovery); a malformed id is 400', async () => {
    expect((await post(TENANT_UNKNOWN, 'owner-a', { vertical: 'medical_tourism' })).status).toBe(403);
    expect((await post('44444444-4444-4444-8444-444444444444', 'owner-a', { vertical: 'medical_tourism' })).status).toBe(403);
    expect((await post('not-a-uuid', 'owner-a', { vertical: 'medical_tourism' })).status).toBe(400);
    expect(applyMock).not.toHaveBeenCalled();
  });
});

describe('owner-only workforce template route: safe-by-default behaviour', () => {
  it('rejects an unknown vertical', async () => {
    expect((await post(TENANT_A, 'owner-a', { vertical: 'plumbing' })).status).toBe(400);
    expect((await post(TENANT_A, 'owner-a', {})).status).toBe(400);
    expect((await post(TENANT_A, 'owner-a', { vertical: '__proto__' })).status).toBe(400);
    expect(applyMock).not.toHaveBeenCalled();
  });

  it('is a DRY RUN unless dryRun is the explicit boolean false', async () => {
    for (const body of [{ vertical: 'medical_tourism' }, { vertical: 'medical_tourism', dryRun: 'false' }, { vertical: 'medical_tourism', dryRun: 0 }]) {
      applyMock.mockClear();
      const r = await post(TENANT_A, 'owner-a', body);
      expect(r.status).toBe(200);
      expect(applyMock).toHaveBeenCalledTimes(1);
      expect(applyMock.mock.calls[0][2]).toEqual({ dryRun: true });
    }
  });

  it('a real apply needs the exact tenant name', async () => {
    expect((await post(TENANT_A, 'owner-a', { vertical: 'medical_tourism', dryRun: false })).status).toBe(400);
    expect((await post(TENANT_A, 'owner-a', { vertical: 'medical_tourism', dryRun: false, confirmTenantName: 'tenant a medical' })).status).toBe(400);
    expect((await post(TENANT_A, 'owner-a', { vertical: 'medical_tourism', dryRun: false, confirmTenantName: 'Tenant B Shop' })).status).toBe(400);
    expect(applyMock).not.toHaveBeenCalled();
    const ok = await post(TENANT_A, 'owner-a', { vertical: 'medical_tourism', dryRun: false, confirmTenantName: 'Tenant A Medical' });
    expect(ok.status).toBe(200);
    expect(applyMock).toHaveBeenCalledTimes(1);
    expect(applyMock.mock.calls[0][0]).toBe(TENANT_A);
    expect(applyMock.mock.calls[0][2]).toEqual({ dryRun: false });
  });

  it('applies the template of the requested vertical to the URL tenant only (never a body-supplied tenant)', async () => {
    await post(TENANT_B, 'owner-b', { vertical: 'dropshipping', tenantId: TENANT_A, organizationId: TENANT_A });
    expect(applyMock).toHaveBeenCalledTimes(1);
    expect(applyMock.mock.calls[0][0]).toBe(TENANT_B);
    expect((applyMock.mock.calls[0][1] as { vertical: string }).vertical).toBe('dropshipping');
  });

  it('the response carries agent names and actions only: no prompts, no instructions', async () => {
    const r = await post(TENANT_A, 'owner-a', { vertical: 'medical_tourism' });
    const text = await r.text();
    const body = JSON.parse(text);
    expect(body.success).toBe(true);
    expect(body.data.agents.length).toBe(3);
    expect(Object.keys(body.data.agents[0]).sort()).toEqual(['action', 'key', 'name']);
    expect(text).not.toMatch(/systemPrompt|HARD LIMITS|doInstructions/);
  });

  it('turns a provisioning pre-flight refusal into a 409 with the reason', async () => {
    const { WorkforceProvisioningError } = await import('../../../apps/gateway/src/services/workforce-templates/provision.js');
    applyMock.mockRejectedValueOnce(new WorkforceProvisioningError('Refusing to provision: the tenant has no valid E.164 transfer number.'));
    const r = await post(TENANT_A, 'owner-a', { vertical: 'medical_tourism' });
    expect(r.status).toBe(409);
    expect((await r.json()).error).toMatch(/transfer number/);
  });
});
