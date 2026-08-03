/**
 * Tenant API Keys Service
 * Manages API keys for developer access to tenant data.
 */

import { createHash, randomBytes } from 'crypto';
import { pool } from '../db/pool.js';

export interface ApiKey {
  id: string;
  tenantId: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}

export interface CreatedApiKey {
  id: string;
  tenantId: string;
  name: string;
  key: string;  // Full key (only shown once)
  keyPrefix: string;
  scopes: string[];
  expiresAt: Date | null;
  createdAt: Date;
}

export class TenantApiKeyService {
  /**
   * Generate a new API key for a tenant.
   */
  async createKey(tenantId: string, name: string, scopes: string[] = ['read'], expiresAt?: Date | null): Promise<CreatedApiKey> {
    const rawKey = `sk_calliq_${randomBytes(32).toString('hex')}`;
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.slice(0, 16) + '...';

    const result = await pool.query(
      `INSERT INTO public.tenant_api_keys (tenant_id, name, key_hash, key_prefix, scopes, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, tenant_id, name, key_prefix, scopes, expires_at, created_at`,
      [tenantId, name, keyHash, keyPrefix, JSON.stringify(scopes), expiresAt || null]
    );

    const row = result.rows[0];
    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      key: rawKey,
      keyPrefix: row.key_prefix,
      scopes: row.scopes,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    };
  }

  /**
   * Validate an API key and return the tenant ID if valid.
   */
  async validateKey(rawKey: string): Promise<{ tenantId: string; scopes: string[] } | null> {
    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    const result = await pool.query(
      `SELECT id, tenant_id, scopes, revoked_at, expires_at 
       FROM public.tenant_api_keys 
       WHERE key_hash = $1`,
      [keyHash]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    if (row.revoked_at) return null;
    if (row.expires_at && new Date(row.expires_at) < new Date()) return null;

    // Update last_used_at
    await pool.query(
      `UPDATE public.tenant_api_keys SET last_used_at = NOW() WHERE id = $1`,
      [row.id]
    );

    return {
      tenantId: row.tenant_id,
      scopes: row.scopes,
    };
  }

  /**
   * List active API keys for a tenant.
   */
  async listKeys(tenantId: string): Promise<ApiKey[]> {
    const result = await pool.query(
      `SELECT id, tenant_id, name, key_prefix, scopes, last_used_at, revoked_at, expires_at, created_at
       FROM public.tenant_api_keys
       WHERE tenant_id = $1
       ORDER BY created_at DESC`,
      [tenantId]
    );

    return result.rows.map((row: any) => ({
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      keyPrefix: row.key_prefix,
      scopes: row.scopes,
      lastUsedAt: row.last_used_at,
      revokedAt: row.revoked_at,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    }));
  }

  /**
   * Revoke an API key.
   */
  async revokeKey(tenantId: string, keyId: string): Promise<void> {
    await pool.query(
      `UPDATE public.tenant_api_keys SET revoked_at = NOW() WHERE id = $1 AND tenant_id = $2 AND revoked_at IS NULL`,
      [keyId, tenantId]
    );
  }

  /**
   * Delete an API key permanently.
   */
  async deleteKey(tenantId: string, keyId: string): Promise<void> {
    await pool.query(
      `DELETE FROM public.tenant_api_keys WHERE id = $1 AND tenant_id = $2`,
      [keyId, tenantId]
    );
  }
}

export const tenantApiKeyService = new TenantApiKeyService();

