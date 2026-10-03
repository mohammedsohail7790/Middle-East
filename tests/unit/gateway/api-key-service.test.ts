import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'crypto';

vi.mock('../../../apps/gateway/src/services/db/pool.js', () => ({ pool: { query: vi.fn() } }));

import { pool } from '../../../apps/gateway/src/services/db/pool.js';
import { TenantApiKeyService } from '../../../apps/gateway/src/services/api-keys/apiKey.service.js';

const query = pool.query as unknown as ReturnType<typeof vi.fn>;
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
const service = new TenantApiKeyService();

beforeEach(() => query.mockReset());

describe('TenantApiKeyService — secret handling', () => {
  it('stores only the hash, never the raw key, and binds scopes as a real array for the TEXT[] column', async () => {
    query.mockResolvedValueOnce({
      rows: [{ id: 'k1', tenant_id: 't1', name: 'klaros', key_prefix: 'sk_calliq_abcd...', scopes: ['leads.write'], expires_at: null, created_at: new Date() }],
    });

    const created = await service.createKey('t1', 'klaros', ['leads.write', 'workforce.read']);

    const params = query.mock.calls[0][1] as any[];
    expect(created.key).toMatch(/^sk_calliq_[0-9a-f]{64}$/);
    expect(params).not.toContain(created.key); // raw key never sent to the database
    expect(params).toContain(sha256(created.key)); // only its hash
    expect(JSON.stringify(params)).not.toContain(created.key);

    expect(Array.isArray(params[4])).toBe(true); // JSON.stringify'd text is not a valid text[] literal
    expect(params[4]).toEqual(['leads.write', 'workforce.read']);
    expect(String(params[3])).not.toBe(created.key); // the displayed prefix is truncated
  });

  it('listing never exposes the key or its hash', async () => {
    query.mockResolvedValueOnce({
      rows: [{ id: 'k1', tenant_id: 't1', name: 'klaros', key_prefix: 'sk_calliq_abcd...', scopes: ['read'], last_used_at: null, revoked_at: null, expires_at: null, created_at: new Date(), key_hash: 'deadbeef' }],
    });
    const keys = await service.listKeys('t1');
    const serialized = JSON.stringify(keys);
    expect(serialized).not.toContain('deadbeef');
    expect(keys[0]).not.toHaveProperty('key');
    expect(keys[0]).not.toHaveProperty('keyHash');
    expect(keys[0]).not.toHaveProperty('key_hash');
  });

  it('validates by hash and returns the tenant from the database row', async () => {
    const raw = 'sk_calliq_' + 'a'.repeat(64);
    query.mockResolvedValueOnce({ rows: [{ id: 'k1', tenant_id: 'tenant-from-row', scopes: ['leads.read'], revoked_at: null, expires_at: null }] });
    query.mockResolvedValueOnce({ rows: [] }); // last_used_at update

    expect(await service.validateKey(raw)).toEqual({ tenantId: 'tenant-from-row', scopes: ['leads.read'] });
    expect(query.mock.calls[0][1]).toEqual([sha256(raw)]);
    expect(JSON.stringify(query.mock.calls)).not.toContain(raw);
  });

  it.each([
    ['unknown key', []],
    ['revoked key', [{ id: 'k', tenant_id: 't', scopes: ['read'], revoked_at: new Date(), expires_at: null }]],
    ['expired key', [{ id: 'k', tenant_id: 't', scopes: ['read'], revoked_at: null, expires_at: new Date(Date.now() - 1000) }]],
  ])('rejects an %s', async (_name, dbRows) => {
    query.mockResolvedValueOnce({ rows: dbRows });
    expect(await service.validateKey('sk_calliq_' + 'b'.repeat(64))).toBeNull();
  });

  it('revoke and delete are scoped by tenant so one tenant cannot affect another tenant\'s key', async () => {
    query.mockResolvedValue({ rows: [] });
    await service.revokeKey('tenant-a', 'key-1');
    await service.deleteKey('tenant-a', 'key-1');
    for (const call of query.mock.calls) {
      expect(call[0]).toMatch(/tenant_id = \$2/);
      expect(call[1]).toEqual(['key-1', 'tenant-a']);
    }
  });
});
