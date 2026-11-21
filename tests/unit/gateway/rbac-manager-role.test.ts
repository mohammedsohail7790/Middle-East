/** A team member invited as "manager" must be treated as a manager, not silently as read-only. */
import { describe, it, expect, vi } from 'vitest';

const rows = vi.hoisted(() => ({ team: undefined as string | undefined }));
vi.mock('../../../apps/gateway/src/services/voice/tenant-scope.js', () => ({
  voiceDb: {
    query: async (sql: string) => {
      if (sql.includes('org_members')) return { rows: [] };
      if (sql.includes('voice_tenants')) return { rows: [] };
      if (sql.includes('team_members')) return { rows: rows.team ? [{ role: rows.team }] : [] };
      return { rows: [] };
    },
  },
}));

import { resolveUserRole } from '../../../apps/gateway/src/services/enterprise/rbac.service.js';

describe('resolveUserRole for invited team members', () => {
  it.each([
    ['owner', 'owner'],
    ['admin', 'admin'],
    ['manager', 'manager'],
    ['agent', 'operator'],
    ['viewer', 'readonly'],
  ])('team role %s becomes %s', async (team, expected) => {
    rows.team = team;
    expect(await resolveUserRole('t1', 'u1')).toBe(expected);
  });

  it('an unknown team role or no membership at all is read-only', async () => {
    rows.team = 'wizard';
    expect(await resolveUserRole('t1', 'u1')).toBe('readonly');
    rows.team = undefined;
    expect(await resolveUserRole('t1', 'u1')).toBe('readonly');
  });
});
