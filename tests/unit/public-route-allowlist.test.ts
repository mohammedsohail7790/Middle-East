import { describe, expect, it, vi } from 'vitest';

vi.mock('../../apps/gateway/src/middleware/require-tenant.js', () => ({ requireTenant: vi.fn() }));
vi.mock('../../apps/gateway/src/services/auth/require-supabase-user.js', () => ({ requireSupabaseUser: vi.fn() }));

import { apiAuthUnlessPublic } from '../../apps/gateway/src/middleware/api-auth-unless-public.js';

// Runs the real auth layer: a public route must pass straight through, anything else must be stopped (never reach `next` without a login).
function passes(method: string, url: string): boolean {
  const next = vi.fn();
  const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  apiAuthUnlessPublic({ method, originalUrl: '/api/v1' + url, path: url } as any, res, next);
  return next.mock.calls.length === 1 && res.status.mock.calls.length === 0;
}

describe('public routes that need no login', () => {
  it('lets the audit link check, Form 2 and the payment page through', () => {
    expect(passes('GET', '/public/audit/link?t=abc')).toBe(true);
    expect(passes('POST', '/public/audit/form2')).toBe(true);
    expect(passes('POST', '/public/audit/pay')).toBe(true);
  });
  it('lets the fit check through', () => {
    expect(passes('POST', '/public/fit-check')).toBe(true);
  });
  it('does not open anything else under the same prefix', () => {
    expect(passes('POST', '/public/audit/anything-else')).toBe(false);
    expect(passes('GET', '/public/audit/form2')).toBe(false);
    expect(passes('GET', '/tenants/123')).toBe(false);
  });
});
