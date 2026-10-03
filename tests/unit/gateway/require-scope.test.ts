import { describe, it, expect, vi } from 'vitest';
import { requireScope } from '../../../apps/gateway/src/middleware/require-scope.js';
import { attachTenantContext } from '../../../apps/gateway/src/services/auth/tenant-context.js';

function mockReqRes(tenant?: Parameters<typeof attachTenantContext>[1]) {
  const req: any = {};
  if (tenant) attachTenantContext(req, tenant);
  const res: any = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  const next = vi.fn();
  return { req, res, next };
}

describe('requireScope', () => {
  it('rejects when no tenant context is attached', () => {
    const { req, res, next } = mockReqRes();
    requireScope('leads.write')(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows a tenant API key that carries the required scope', () => {
    const { req, res, next } = mockReqRes({
      id: 'tenant-1',
      source: 'tenant_api_key',
      scopes: ['leads.write', 'workforce.read'],
    });
    requireScope('leads.write')(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('rejects a tenant API key missing the required scope', () => {
    const { req, res, next } = mockReqRes({
      id: 'tenant-1',
      source: 'tenant_api_key',
      scopes: ['workforce.read'],
    });
    requireScope('leads.write')(req, res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects an internal-service credential forging an unauthorized scope', () => {
    const { req, res, next } = mockReqRes({
      id: 'tenant-1',
      source: 'internal_service',
      scopes: ['calls.write'],
    });
    requireScope('workforce.write')(req, res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('does not enforce scopes for a dashboard user JWT (no scopes array)', () => {
    const { req, res, next } = mockReqRes({
      id: 'tenant-1',
      source: 'user_jwt',
      userId: 'user-1',
    });
    requireScope('workforce.write')(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });
});
