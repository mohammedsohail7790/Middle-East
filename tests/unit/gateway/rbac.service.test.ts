import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const queryMock = vi.fn();

vi.mock('../../../apps/gateway/src/services/voice/tenant-scope.js', () => ({
  voiceDb: { query: (...args: unknown[]) => queryMock(...args) },
}));

import {
  resolveUserRole,
  hasPermission,
  requirePermission,
} from '../../../apps/gateway/src/services/enterprise/rbac.service.js';

describe('rbac.service resolveUserRole — fails closed', () => {
  beforeEach(() => {
    queryMock.mockReset();
    delete process.env.CALLIQ_ENTERPRISE_RBAC;
  });

  afterEach(() => {
    delete process.env.CALLIQ_ENTERPRISE_RBAC;
  });

  it('returns readonly (not operator) when no userId is provided', async () => {
    const role = await resolveUserRole('tenant-1', undefined);
    expect(role).toBe('readonly');
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('returns readonly (not operator) when the role lookup query throws', async () => {
    queryMock.mockRejectedValueOnce(new Error('self-signed certificate in certificate chain'));
    const role = await resolveUserRole('tenant-1', 'user-1');
    expect(role).toBe('readonly');
  });

  it('returns readonly when the user has no active org_members row', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const role = await resolveUserRole('tenant-1', 'user-1');
    expect(role).toBe('readonly');
  });

  it('returns the resolved role on a successful lookup', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ role: 'admin' }] });
    const role = await resolveUserRole('tenant-1', 'user-1');
    expect(role).toBe('admin');
  });

  it('still bypasses to operator when RBAC is explicitly disabled', async () => {
    process.env.CALLIQ_ENTERPRISE_RBAC = 'false';
    const role = await resolveUserRole('tenant-1', 'user-1');
    expect(role).toBe('operator');
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe('rbac.service requirePermission', () => {
  it('readonly cannot write to governance', () => {
    expect(hasPermission('readonly', 'governance:write')).toBe(false);
    expect(requirePermission('readonly', 'governance:write').ok).toBe(false);
  });

  it('owner can write to governance and billing', () => {
    expect(hasPermission('owner', 'governance:write')).toBe(true);
    expect(hasPermission('owner', 'billing:write')).toBe(true);
  });
});
