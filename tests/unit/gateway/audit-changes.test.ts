/**
 * Every successful change (POST/PUT/PATCH/DELETE) by a signed-in dashboard user is written to the audit log: who, what kind of change,
 * which record, when. Request bodies are never stored (they can hold personal data or keys). Reads, failed requests, API keys,
 * internal calls and noisy routes are not recorded.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

const recorded = vi.hoisted(() => [] as Array<Record<string, any>>);
vi.mock('../../../apps/gateway/src/services/enterprise/enterprise-audit.service.js', () => ({
  recordEnterpriseAuditEvent: async (args: Record<string, any>) => { recorded.push(args); },
}));

import { auditChangesMiddleware, describeChange } from '../../../apps/gateway/src/middleware/audit-changes.js';

type Source = 'user_jwt' | 'legacy_jwt' | 'tenant_api_key' | 'internal_service';
function run(method: string, url: string, opts: { status?: number; source?: Source | null; body?: unknown } = {}) {
  const source = opts.source === undefined ? 'user_jwt' : opts.source;
  const req: any = {
    method,
    originalUrl: `/api/v1${url}`,
    body: opts.body,
    ip: '203.0.113.9',
    tenant: source ? { id: 'tenant-1', userId: 'user-1', source } : undefined,
  };
  const res: any = Object.assign(new EventEmitter(), { statusCode: opts.status ?? 200 });
  let nexted = false;
  auditChangesMiddleware(req, res, () => { nexted = true; });
  res.emit('finish');
  return nexted;
}

beforeEach(() => { recorded.length = 0; });

describe('what a change is called', () => {
  it.each([
    ['POST', '/team/invite', 'team_member_invited', 'team_member'],
    ['POST', '/team', 'team_member_added', 'team_member'],
    ['PUT', '/team/9b2f6c1e-1111-4222-8333-444455556666', 'team_member_updated', 'team_member'],
    ['DELETE', '/team/9b2f6c1e-1111-4222-8333-444455556666', 'team_member_removed', 'team_member'],
    ['POST', '/api-keys', 'api_key_created', 'api_key'],
    ['DELETE', '/api-keys/abc-123-def-456', 'api_key_revoked', 'api_key'],
    ['PUT', '/ai-config', 'ai_config_updated', 'ai_config'],
    ['POST', '/billing/checkout', 'billing_changed', 'billing'],
    ['POST', '/phone-numbers/provision', 'phone_number_changed', 'phone_number'],
    ['PATCH', '/leads/42', 'leads_updated', 'leads'],
    ['DELETE', '/knowledge/7', 'knowledge_deleted', 'knowledge'],
    ['POST', '/appointments', 'appointments_created', 'appointments'],
  ])('%s %s is %s', (method, path, eventType, resourceType) => {
    expect(describeChange(method, path)).toMatchObject({ eventType, resourceType });
  });

  it('picks out the record id when there is one', () => {
    expect(describeChange('PATCH', '/leads/42').resourceId).toBe('42');
    expect(describeChange('DELETE', '/team/9b2f6c1e-1111-4222-8333-444455556666').resourceId).toBe('9b2f6c1e-1111-4222-8333-444455556666');
    expect(describeChange('POST', '/team/invite').resourceId).toBeUndefined();
  });
});

describe('what gets recorded', () => {
  it('records a successful change with who, what and which record, and nothing from the body', () => {
    run('PATCH', '/leads/42?x=1', { status: 200, body: { phone: '+971500000000', secret: 'sk_live_x' } });
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      tenantId: 'tenant-1',
      actorId: 'user-1',
      eventType: 'leads_updated',
      resourceType: 'leads',
      resourceId: '42',
      payload: { method: 'PATCH', path: '/leads/42', status: 200 },
    });
    expect(JSON.stringify(recorded[0])).not.toContain('sk_live_x');
    expect(JSON.stringify(recorded[0])).not.toContain('+971500000000');
  });

  it('records team, API key and billing changes, the events a security review asks for', () => {
    run('POST', '/team/invite');
    run('DELETE', '/api-keys/key-1');
    run('POST', '/billing/checkout');
    expect(recorded.map((e) => e.eventType)).toEqual(['team_member_invited', 'api_key_revoked', 'billing_changed']);
  });

  it('does not record reads', () => {
    run('GET', '/leads');
    expect(recorded).toHaveLength(0);
  });

  it.each([400, 401, 403, 404, 500])('does not record a change that failed with %s', (status) => {
    run('POST', '/leads', { status });
    expect(recorded).toHaveLength(0);
  });

  it('does not record API keys, internal service calls or requests with no signed-in workspace', () => {
    run('POST', '/leads', { source: 'tenant_api_key' });
    run('POST', '/leads', { source: 'internal_service' });
    run('POST', '/public/fit-check', { source: null });
    expect(recorded).toHaveLength(0);
  });

  it.each(['/support/ticket', '/dashboard-assistant/chat', '/search', '/alerts/read', '/team/check-permission', '/team/sync-auth', '/compliance/gdpr-export'])(
    'leaves out %s (noise, or already recorded by its own route)',
    (path) => {
      run('POST', path);
      expect(recorded).toHaveLength(0);
    },
  );

  it('always passes the request on', () => {
    expect(run('POST', '/leads')).toBe(true);
    expect(run('GET', '/leads')).toBe(true);
  });
});
