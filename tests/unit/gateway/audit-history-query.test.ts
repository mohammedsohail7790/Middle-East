/**
 * Audit history: filters, paging and CSV export for the events a client's security team asks for.
 * Every query is scoped to one client, filters are bound as parameters (never pasted into SQL), and the CSV
 * neutralises cells a spreadsheet would run as a formula.
 */
import { describe, it, expect } from 'vitest';
import {
  parseAuditFilters,
  buildAuditQuery,
  auditRowsToCsv,
  AUDIT_PAGE_MAX,
  AUDIT_EXPORT_MAX,
} from '../../../apps/gateway/src/services/compliance/audit-history-query.js';

describe('parseAuditFilters', () => {
  it('defaults to the first page of 50', () => {
    expect(parseAuditFilters({})).toMatchObject({ limit: 50, offset: 0 });
  });

  it('caps the page size and rejects negative or junk values', () => {
    expect(parseAuditFilters({ limit: '100000' }).limit).toBe(AUDIT_PAGE_MAX);
    expect(parseAuditFilters({ limit: '-5' }).limit).toBe(50);
    expect(parseAuditFilters({ offset: '-3' }).offset).toBe(0);
    expect(parseAuditFilters({ offset: 'abc' }).offset).toBe(0);
  });

  it('keeps valid dates and drops invalid ones', () => {
    const f = parseAuditFilters({ from: '2026-11-01', to: 'not-a-date' });
    expect(f.from?.toISOString().startsWith('2026-11-01')).toBe(true);
    expect(f.to).toBeUndefined();
  });

  it('makes the end date inclusive of the whole day', () => {
    const f = parseAuditFilters({ to: '2026-11-21' });
    expect(f.to?.toISOString()).toBe('2026-11-22T00:00:00.000Z');
  });

  it('trims and bounds the text filters', () => {
    const f = parseAuditFilters({ type: '  team.member_invited ', actor: 'x'.repeat(500) });
    expect(f.type).toBe('team.member_invited');
    expect(f.actor?.length).toBe(200);
  });
});

describe('buildAuditQuery', () => {
  it('always filters by client first', () => {
    const q = buildAuditQuery('tenant-1', parseAuditFilters({}));
    expect(q.where).toMatch(/tenant_id = \$1/);
    expect(q.params[0]).toBe('tenant-1');
  });

  it('binds filters as parameters, never into the SQL text', () => {
    const q = buildAuditQuery('t', parseAuditFilters({ type: "x'; drop table y;--", actor: '%a%' }));
    expect(q.where).not.toContain('drop table');
    expect(q.where).not.toContain('%a%');
    expect(q.params).toContain("x'; drop table y;--");
  });

  it('escapes like wildcards in the person filter so it matches literally', () => {
    const q = buildAuditQuery('t', parseAuditFilters({ actor: '50%_off' }));
    expect(q.params.some((p) => p === '%50\\%\\_off%')).toBe(true);
  });

  it('adds date bounds', () => {
    const q = buildAuditQuery('t', parseAuditFilters({ from: '2026-11-01', to: '2026-11-30' }));
    expect(q.where).toMatch(/created_at >= \$/);
    expect(q.where).toMatch(/created_at < \$/);
  });
});

describe('auditRowsToCsv', () => {
  const row = {
    id: 'e1',
    created_at: new Date('2026-11-21T10:00:00Z'),
    event_type: 'api_key.created',
    actor_email: 'owner@example.com',
    actor_id: 'u1',
    resource_type: 'api_keys',
    resource_id: 'k1',
    ip_address: '203.0.113.9',
  };

  it('starts with a header row and writes one line per event', () => {
    const csv = auditRowsToCsv([row]);
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toBe('time,event,person,person_id,record_type,record_id,ip_address');
    expect(lines[1]).toBe('2026-11-21T10:00:00.000Z,api_key.created,owner@example.com,u1,api_keys,k1,203.0.113.9');
  });

  it('quotes commas, quotes and line breaks', () => {
    const csv = auditRowsToCsv([{ ...row, actor_email: 'a,"b"\nc' }]);
    expect(csv).toContain('"a,""b""\nc"');
  });

  it('neutralises spreadsheet formulas', () => {
    const csv = auditRowsToCsv([{ ...row, actor_email: '=HYPERLINK("http://evil")', resource_id: '+1', event_type: '@x' }]);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain(",'+1,");
    expect(csv).toContain(",'@x,");
  });

  it('leaves out request contents entirely', () => {
    const csv = auditRowsToCsv([{ ...row, payload: { secret: 'sk_live_123' } } as any]);
    expect(csv).not.toContain('sk_live_123');
  });

  it('has a fixed export ceiling', () => {
    expect(AUDIT_EXPORT_MAX).toBe(50000);
  });
});

describe('buildAuditQuery extra conditions', () => {
  it('exposes the optional conditions separately so callers write the client filter in the SQL themselves', () => {
    expect(buildAuditQuery('t', parseAuditFilters({})).and).toBe('');
    const q = buildAuditQuery('t', parseAuditFilters({ type: 'x', from: '2026-11-01' }));
    expect(q.and).toMatch(/^ AND created_at >= \$2 AND event_type = \$3$/);
    expect(q.where).toBe(`tenant_id = $1${q.and}`);
  });
});
