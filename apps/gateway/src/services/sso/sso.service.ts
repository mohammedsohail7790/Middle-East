import { pool } from '../db/pool.js';
import {
  encryptCredentials,
  decryptCredentials,
} from '../integrations/credential-encryption.js';

/**
 * SSO / SAML Service
 * Manages enterprise single sign-on configurations.
 * client_secret is encrypted at rest using AES-256-GCM (same key as integration credentials).
 */

export interface SSOConfig {
  id: string;
  tenantId: string;
  provider: string;
  enabled: boolean;
  entityId: string | null;
  ssoUrl: string | null;
  certificate: string | null;
  clientId: string | null;
  clientSecret: string | null;
  domain: string | null;
  attributeMapping: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
}

/** Encrypt client_secret for storage. Returns null if input is null/undefined. */
function encryptSecret(secret: string | null | undefined): string | null {
  if (!secret) return null;
  return encryptCredentials({ secret });
}

/** Decrypt a stored client_secret. Returns null if input is null/undefined. */
function decryptSecret(encrypted: string | null | undefined): string | null {
  if (!encrypted) return null;
  try {
    const data = decryptCredentials<{ secret: string }>(encrypted);
    return data.secret ?? null;
  } catch {
    // If decryption fails the value may be a legacy plaintext secret — return as-is.
    return encrypted;
  }
}

export class SSOService {
  async getConfig(tenantId: string): Promise<SSOConfig | null> {
    const result = await pool.query(
      `SELECT id, tenant_id, provider, enabled, entity_id, sso_url, certificate, client_id, client_secret, domain, attribute_mapping, created_at, updated_at
       FROM public.sso_configs
       WHERE tenant_id = $1`,
      [tenantId]
    );

    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async upsertConfig(tenantId: string, data: Partial<SSOConfig>): Promise<SSOConfig> {
    const fields = ['tenant_id'];
    const values: any[] = [tenantId];
    const placeholders = ['$1'];
    let i = 2;

    const updates: string[] = [];

    if (data.provider !== undefined) {
      fields.push('provider');
      values.push(data.provider);
      placeholders.push(`$${i}`);
      updates.push(`provider = EXCLUDED.provider`);
      i++;
    }
    if (data.enabled !== undefined) {
      fields.push('enabled');
      values.push(data.enabled);
      placeholders.push(`$${i}`);
      updates.push(`enabled = EXCLUDED.enabled`);
      i++;
    }
    if (data.entityId !== undefined) {
      fields.push('entity_id');
      values.push(data.entityId);
      placeholders.push(`$${i}`);
      updates.push(`entity_id = EXCLUDED.entity_id`);
      i++;
    }
    if (data.ssoUrl !== undefined) {
      fields.push('sso_url');
      values.push(data.ssoUrl);
      placeholders.push(`$${i}`);
      updates.push(`sso_url = EXCLUDED.sso_url`);
      i++;
    }
    if (data.certificate !== undefined) {
      fields.push('certificate');
      values.push(data.certificate);
      placeholders.push(`$${i}`);
      updates.push(`certificate = EXCLUDED.certificate`);
      i++;
    }
    if (data.clientId !== undefined) {
      fields.push('client_id');
      values.push(data.clientId);
      placeholders.push(`$${i}`);
      updates.push(`client_id = EXCLUDED.client_id`);
      i++;
    }
    if (data.clientSecret !== undefined) {
      fields.push('client_secret');
      values.push(encryptSecret(data.clientSecret));
      placeholders.push(`$${i}`);
      updates.push(`client_secret = EXCLUDED.client_secret`);
      i++;
    }
    if (data.domain !== undefined) {
      fields.push('domain');
      values.push(data.domain);
      placeholders.push(`$${i}`);
      updates.push(`domain = EXCLUDED.domain`);
      i++;
    }
    if (data.attributeMapping !== undefined) {
      fields.push('attribute_mapping');
      values.push(JSON.stringify(data.attributeMapping));
      placeholders.push(`$${i}`);
      updates.push(`attribute_mapping = EXCLUDED.attribute_mapping`);
      i++;
    }

    updates.push(`updated_at = NOW()`);

    const result = await pool.query(
      `INSERT INTO public.sso_configs (${fields.join(', ')})
       VALUES (${placeholders.join(', ')})
       ON CONFLICT (tenant_id) DO UPDATE SET ${updates.join(', ')}
       RETURNING id, tenant_id, provider, enabled, entity_id, sso_url, certificate, client_id, client_secret, domain, attribute_mapping, created_at, updated_at`,
      values
    );

    return this.mapRow(result.rows[0]);
  }

  async disable(tenantId: string): Promise<void> {
    await pool.query(`UPDATE public.sso_configs SET enabled = false, updated_at = NOW() WHERE tenant_id = $1`, [tenantId]);
  }

  async delete(tenantId: string): Promise<void> {
    await pool.query(`DELETE FROM public.sso_configs WHERE tenant_id = $1`, [tenantId]);
  }

  /**
   * Verify if a user's email domain matches the tenant's SSO domain.
   */
  async isDomainAllowed(tenantId: string, email: string): Promise<boolean> {
    const config = await this.getConfig(tenantId);
    if (!config || !config.enabled || !config.domain) return true; // No domain restriction
    return email.endsWith('@' + config.domain);
  }

  private mapRow(row: any): SSOConfig {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      provider: row.provider,
      enabled: row.enabled,
      entityId: row.entity_id,
      ssoUrl: row.sso_url,
      certificate: row.certificate,
      clientId: row.client_id,
      // Decrypt on read — callers receive the plaintext secret in memory only
      clientSecret: decryptSecret(row.client_secret),
      domain: row.domain,
      attributeMapping: row.attribute_mapping || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const ssoService = new SSOService();

