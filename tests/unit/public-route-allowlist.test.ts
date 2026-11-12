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
  it('lets the send-the-questionnaire page from our fit-check email through, for reading only', () => {
    expect(passes('GET', '/public/audit/approve?t=abc')).toBe(true);
    expect(passes('GET', '/public/audit/approve?t=abc&confirm=1')).toBe(true);
    expect(passes('POST', '/public/audit/approve')).toBe(false);
  });
  it('lets the send-the-payment-link page from the questionnaire email through, for reading only', () => {
    expect(passes('GET', '/public/audit/send-payment?t=abc')).toBe(true);
    expect(passes('GET', '/public/audit/send-payment?t=abc&confirm=1')).toBe(true);
    expect(passes('POST', '/public/audit/send-payment')).toBe(false);
  });
  it('lets the team review page for the AI audit draft through: open, preview the PDF, save and approve', () => {
    expect(passes('GET', '/public/audit/review?t=abc')).toBe(true);
    expect(passes('GET', '/public/audit/review/pdf?t=abc')).toBe(true);
    expect(passes('POST', '/public/audit/review')).toBe(true);
    expect(passes('POST', '/public/audit/review/pdf')).toBe(false);
    expect(passes('PUT', '/public/audit/review')).toBe(false);
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

// A route added to the public audit router but forgotten in the allowlist answers "Unauthorized" in production (this happened to the review page).
// This reads the real router and checks every route it declares against the real auth layer, so the two cannot drift apart again.
describe('every public audit route is reachable without a login', () => {
  it('lists each route the public audit router declares and finds it in the allowlist', async () => {
    vi.resetModules();
    const { createPublicAuditRouter } = await import('../../apps/gateway/src/services/audit/public-audit.controller.js');
    const declared: Array<{ method: string; path: string }> = [];
    const walk = (stack: any[], prefix = '') => {
      for (const layer of stack) {
        if (layer.route) for (const m of Object.keys(layer.route.methods)) declared.push({ method: m.toUpperCase(), path: prefix + layer.route.path });
        else if (layer.handle?.stack) walk(layer.handle.stack, prefix);
      }
    };
    walk((createPublicAuditRouter() as any).stack);
    expect(declared.length).toBeGreaterThanOrEqual(8);
    const blocked = declared.filter((r) => !passes(r.method, `/public/audit${r.path}`));
    expect(blocked).toEqual([]);
  });
});
