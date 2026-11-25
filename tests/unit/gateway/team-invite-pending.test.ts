import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  existing: [] as Array<{ id: string; role: string }>,
  inviteError: null as null | { message: string },
  addArgs: null as null | unknown[],
  updateArgs: null as null | unknown[],
  queries: [] as Array<{ sql: string; params: unknown[] }>,
}));

vi.mock('../../../apps/gateway/src/services/logger.js', () => ({
  logger: { warn: () => {}, debug: () => {}, info: () => {}, error: () => {} },
}));
vi.mock('../../../apps/gateway/src/services/dashboard/dashboard-events.js', () => ({
  publishDashboardPushType: () => {},
}));
vi.mock('../../../apps/gateway/src/services/integrations/oauth-redirect.js', () => ({
  getDashboardBaseUrl: () => 'https://example.test',
}));
vi.mock('../../../apps/gateway/src/services/auth/supabase-admin.js', () => ({
  getSupabaseAdmin: () => ({
    auth: {
      admin: {
        inviteUserByEmail: async () => ({ error: state.inviteError }),
        getUserById: async () => ({ data: { user: { user_metadata: { tenant_id: 't1' } } } }),
        updateUserById: async () => ({}),
      },
    },
  }),
}));
vi.mock('../../../apps/gateway/src/services/voice/tenant-scope.js', () => ({
  voiceDb: {
    query: async (sql: string, params: unknown[]) => {
      state.queries.push({ sql, params });
      if (/SELECT id, role FROM public.team_members/i.test(sql)) return { rows: state.existing };
      if (/SELECT tenant_id FROM public.team_members/i.test(sql)) return { rows: [{ tenant_id: 't1' }] };
      return { rows: [] };
    },
  },
}));
vi.mock('../../../apps/gateway/src/services/team/team.service.js', () => ({
  teamService: {
    addTeamMember: async (...args: unknown[]) => {
      state.addArgs = args;
      return { id: 'm1' };
    },
    updateTeamMember: async (...args: unknown[]) => {
      state.updateArgs = args;
      return { id: String(args[1]) };
    },
  },
}));

import {
  inviteTeamMember,
  linkTeamMemberFromAuth,
  TeamInviteError,
} from '../../../apps/gateway/src/services/team/team-invite.service.js';

beforeEach(() => {
  state.existing = [];
  state.inviteError = null;
  state.addArgs = null;
  state.updateArgs = null;
  state.queries = [];
});

describe('inviting a teammate', () => {
  it('saves a pending invite with no user id (not a text placeholder) and the lower-cased email', async () => {
    const res = await inviteTeamMember('t1', ' New.Person+Viewer@Gmail.com ', 'New Person', 'viewer');
    expect(state.addArgs).toEqual(['t1', null, 'new.person+viewer@gmail.com', 'New Person', 'viewer']);
    expect(res.inviteSent).toBe(true);
  });

  it('updates an existing pending member instead of adding a duplicate', async () => {
    state.existing = [{ id: 'm9', role: 'agent' }];
    await inviteTeamMember('t1', 'a@b.co', 'A B', 'viewer');
    expect(state.addArgs).toBeNull();
    expect(state.updateArgs?.[1]).toBe('m9');
  });

  it('refuses to invite the owner, so the owner is never turned into another role', async () => {
    state.existing = [{ id: 'm1', role: 'owner' }];
    await expect(inviteTeamMember('t1', 'owner@b.co', 'Owner', 'agent')).rejects.toBeInstanceOf(TeamInviteError);
    expect(state.updateArgs).toBeNull();
  });

  it('still saves the member when the address already has an account', async () => {
    state.inviteError = { message: 'User already registered' };
    const res = await inviteTeamMember('t1', 'x@y.co', 'X', 'agent');
    expect(res.inviteSent).toBe(false);
    expect(state.addArgs?.[1]).toBeNull();
  });
});

describe('accepting an invite', () => {
  it('fills in the user id on the row matched by that email only', async () => {
    await linkTeamMemberFromAuth('11111111-1111-4111-8111-111111111111', 'Invitee@Gmail.com');
    const update = state.queries.find((q) => /UPDATE public.team_members/i.test(q.sql))!;
    expect(update.params).toEqual(['11111111-1111-4111-8111-111111111111', 'invitee@gmail.com', 't1']);
    expect(update.sql).not.toMatch(/invite:/);
    expect(update.sql).toMatch(/lower\(trim\(email\)\) = \$2/);
  });

  it('never refers to the old text placeholder in any query', async () => {
    await linkTeamMemberFromAuth('11111111-1111-4111-8111-111111111111', 'a@b.co');
    expect(state.queries.some((q) => /invite:/.test(q.sql) || q.params.some((p) => String(p).startsWith('invite:')))).toBe(false);
  });
});
