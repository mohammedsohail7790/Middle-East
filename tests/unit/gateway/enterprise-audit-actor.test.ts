/**
 * Every audit event should say who (email, not just an id) and from where (IP), without each caller having to remember.
 * The email is looked up from the workspace's team list, then the sign-in account. A failed lookup never blocks the event.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({
  inserts: [] as unknown[][],
  team: undefined as string | undefined,
  account: undefined as string | undefined,
  lookupFails: false,
  corr: {} as Record<string, unknown>,
}));

vi.mock('../../../apps/gateway/src/services/logger.js', () => ({
  logger: { warn: () => {}, debug: () => {}, info: () => {}, error: () => {} },
}));
vi.mock('../../../apps/gateway/src/services/observability/correlation-context.js', () => ({ getCorrelation: () => state.corr }));
vi.mock('../../../apps/gateway/src/services/voice/tenant-scope.js', () => ({
  voiceDb: {
    query: async (sql: string, params: unknown[]) => {
      if (/insert into public\.enterprise_audit_events/i.test(sql)) {
        state.inserts.push(params);
        return { rows: [] };
      }
      if (state.lookupFails) throw new Error('lookup failed');
      if (/from public\.team_members/i.test(sql)) return { rows: state.team ? [{ email: state.team }] : [] };
      if (/from auth\.users/i.test(sql)) return { rows: state.account ? [{ email: state.account }] : [] };
      return { rows: [] };
    },
  },
}));

import { recordEnterpriseAuditEvent } from '../../../apps/gateway/src/services/enterprise/enterprise-audit.service.js';

// INSERT parameter order: id, tenant, type, actor_id, actor_email, resource_type, resource_id, payload, correlation, causation, ip
const EMAIL = 4;
const IP = 10;

beforeEach(() => {
  state.inserts = [];
  state.team = undefined;
  state.account = undefined;
  state.lookupFails = false;
  state.corr = {};
});

describe('recordEnterpriseAuditEvent actor and IP', () => {
  it('fills the email from the team list when only the user id is given', async () => {
    state.team = 'owner@example.com';
    await recordEnterpriseAuditEvent({ tenantId: 't1', eventType: 'x', actorId: 'u1' });
    expect(state.inserts[0][EMAIL]).toBe('owner@example.com');
  });

  it('falls back to the sign-in account when the person is not on the team list', async () => {
    state.account = 'founder@example.com';
    await recordEnterpriseAuditEvent({ tenantId: 't1', eventType: 'x', actorId: 'u1' });
    expect(state.inserts[0][EMAIL]).toBe('founder@example.com');
  });

  it('keeps an email the caller already gave and does not look it up', async () => {
    state.team = 'other@example.com';
    await recordEnterpriseAuditEvent({ tenantId: 't1', eventType: 'x', actorId: 'u1', actorEmail: 'given@example.com' });
    expect(state.inserts[0][EMAIL]).toBe('given@example.com');
  });

  it('still records the event when the lookup fails', async () => {
    state.lookupFails = true;
    await recordEnterpriseAuditEvent({ tenantId: 't1', eventType: 'x', actorId: 'u1' });
    expect(state.inserts.length).toBe(1);
    expect(state.inserts[0][EMAIL]).toBeNull();
  });

  it('does not look anything up for system events with no person', async () => {
    state.team = 'owner@example.com';
    await recordEnterpriseAuditEvent({ tenantId: 't1', eventType: 'x' });
    expect(state.inserts[0][EMAIL]).toBeNull();
  });

  it('takes the IP from the current request when the caller gave none', async () => {
    state.corr = { ip: '203.0.113.7' };
    await recordEnterpriseAuditEvent({ tenantId: 't1', eventType: 'x' });
    expect(state.inserts[0][IP]).toBe('203.0.113.7');
  });

  it('prefers an IP the caller passed', async () => {
    state.corr = { ip: '203.0.113.7' };
    await recordEnterpriseAuditEvent({ tenantId: 't1', eventType: 'x', ipAddress: '198.51.100.2' });
    expect(state.inserts[0][IP]).toBe('198.51.100.2');
  });
});
