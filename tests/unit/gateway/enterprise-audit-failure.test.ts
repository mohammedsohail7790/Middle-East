/** If an audit event cannot be saved, the change still goes through, but the failure is reported as a warning, not hidden. */
import { describe, it, expect, vi } from 'vitest';

const log = vi.hoisted(() => ({ warn: [] as unknown[][], debug: [] as unknown[][] }));
vi.mock('../../../apps/gateway/src/services/logger.js', () => ({
  logger: { warn: (...a: unknown[]) => log.warn.push(a), debug: (...a: unknown[]) => log.debug.push(a), info: () => {}, error: () => {} },
}));
vi.mock('../../../apps/gateway/src/services/voice/tenant-scope.js', () => ({
  voiceDb: { query: async () => { throw new Error('database unavailable'); } },
}));
vi.mock('../../../apps/gateway/src/services/observability/correlation-context.js', () => ({ getCorrelation: () => ({}) }));

import { recordEnterpriseAuditEvent } from '../../../apps/gateway/src/services/enterprise/enterprise-audit.service.js';

describe('recordEnterpriseAuditEvent when the database fails', () => {
  it('does not throw and reports a warning that names the event', async () => {
    await expect(recordEnterpriseAuditEvent({ tenantId: 't1', eventType: 'team_member_invited' })).resolves.toBeUndefined();
    expect(log.warn.length).toBe(1);
    expect(String(log.warn[0][0])).toBe('ENTERPRISE_AUDIT_WRITE_FAILED');
    expect(JSON.stringify(log.warn[0][1])).toContain('team_member_invited');
    expect(log.debug.length).toBe(0);
  });
});
