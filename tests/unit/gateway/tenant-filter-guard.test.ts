/**
 * Tenant filter guard. The gateway talks to the database with one privileged connection that skips row-level security, so a query
 * on client data that forgets the client filter would be a leak between clients. This scans every SQL string in the gateway:
 *   - a NEW query on client data without tenant_id fails the test (add the filter, or review it and add it to the list with a reason);
 *   - an entry in the list that no longer matches any query fails too, so the list cannot go stale.
 * The list is in tenant-filter-allowlist.json. Entries marked "to review" have not been checked one by one yet.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { findUnfilteredStatements, tenantTablesFromSql } from '../../helpers/tenant-filter-scan';

const root = join(__dirname, '../../..');
const gatewaySrc = join(root, 'apps/gateway/src');
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return walk(p);
    return p.endsWith('.ts') && !p.endsWith('.test.ts') ? [p] : [];
  });

const migrations = join(root, 'supabase/migrations');
const sql = readdirSync(migrations).filter((f) => f.endsWith('.sql')).map((f) => readFileSync(join(migrations, f), 'utf8')).join('\n');
const tables = tenantTablesFromSql(sql);
const allowlist = JSON.parse(readFileSync(join(__dirname, 'tenant-filter-allowlist.json'), 'utf8')) as Record<string, { reason: string }>;

const found = new Map<string, { file: string; line: number; text: string }>();
for (const file of walk(gatewaySrc)) {
  const rel = relative(gatewaySrc, file);
  for (const s of findUnfilteredStatements(readFileSync(file, 'utf8'), tables)) {
    found.set(`${rel}::${s.key}`, { file: rel, line: s.line, text: s.text });
  }
}

describe('tenant filter guard', () => {
  it('knows the client-data tables', () => {
    expect(tables.size).toBeGreaterThan(50);
    expect(tables.has('campaigns')).toBe(true);
    expect(tables.has('whatsapp_conversations')).toBe(true);
  });

  it('finds no new query on client data without a tenant_id filter', () => {
    const fresh = [...found.entries()].filter(([key]) => !(key in allowlist));
    const message = fresh.map(([, v]) => `${v.file}:${v.line}  ${v.text}`).join('\n');
    expect(message, `New query on client data with no tenant_id filter. Add the filter, or review it and add it to tenant-filter-allowlist.json with a reason:\n${message}`).toBe('');
  });

  it('has no stale entries in the reviewed list', () => {
    const stale = Object.keys(allowlist).filter((key) => !found.has(key));
    expect(stale, `These reviewed queries no longer exist, remove them from tenant-filter-allowlist.json:\n${stale.join('\n')}`).toEqual([]);
  });

  it('gives every reviewed entry a reason', () => {
    for (const [key, v] of Object.entries(allowlist)) {
      expect(v.reason.length, key).toBeGreaterThan(10);
    }
  });
});
