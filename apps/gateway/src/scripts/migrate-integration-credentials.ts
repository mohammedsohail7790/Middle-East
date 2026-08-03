/**
 * One-time backfill: copies legacy plaintext API-key credentials (ServiceTitan,
 * Jobber, HouseCallPro, Freshsales, Insightly) from voice_tenants columns/metadata
 * into the encrypted integration_connections table.
 *
 * Usage:
 *   DRY_RUN=true npx tsx src/scripts/migrate-integration-credentials.ts
 *   npx tsx src/scripts/migrate-integration-credentials.ts
 *
 * Environment:
 *   INTEGRATION_CREDENTIALS_KEY  — 32-byte base64 (required)
 *   GATEWAY_DATABASE_URL / DATABASE_URL — postgres connection string
 *   DRY_RUN                      — set to "true" to skip writes (default: false)
 *
 * Idempotent: skips any tenant/integration pair that already has a row in
 * integration_connections. Legacy voice_tenants columns are left untouched.
 */
import { pool } from '../services/db/pool.js';
import { connectionStore } from '../services/integrations/connection-store.service.js';

const DRY_RUN = process.env.DRY_RUN?.toLowerCase() === 'true';

interface TenantRow {
    id: string;
    servicetitan_enabled: boolean | null;
    servicetitan_api_key: string | null;
    servicetitan_tenant_id: string | null;
    servicetitan_client_id: string | null;
    servicetitan_client_secret: string | null;
    servicetitan_app_key: string | null;
    jobber_enabled: boolean | null;
    jobber_api_token: string | null;
    jobber_account_id: string | null;
    housecallpro_enabled: boolean | null;
    housecallpro_api_key: string | null;
    housecallpro_company_id: string | null;
    metadata: Record<string, unknown> | string | null;
}

function parseMetadata(raw: TenantRow['metadata']): Record<string, unknown> {
    if (!raw) return {};
    if (typeof raw === 'string') {
        try {
            return JSON.parse(raw) as Record<string, unknown>;
        } catch {
            return {};
        }
    }
    return raw;
}

async function migrateOne(tenantId: string, integrationId: string, credentials: Record<string, unknown>): Promise<boolean> {
    const existing = await connectionStore.getConnection(tenantId, integrationId);
    if (existing) return false;
    if (DRY_RUN) return true;

    await connectionStore.upsertConnection(tenantId, integrationId, 'api_credentials', credentials, { status: 'connected' });
    return true;
}

async function migrateTenant(row: TenantRow): Promise<string[]> {
    const migrated: string[] = [];
    const meta = parseMetadata(row.metadata);

    if (row.servicetitan_enabled && row.servicetitan_api_key && row.servicetitan_tenant_id && row.servicetitan_app_key) {
        const migratedNow = await migrateOne(row.id, 'servicetitan', {
            apiKey: row.servicetitan_api_key,
            tenantId: row.servicetitan_tenant_id,
            clientId: row.servicetitan_client_id || '',
            clientSecret: row.servicetitan_client_secret || '',
            appKey: row.servicetitan_app_key,
            businessUnitId: meta.servicetitan_business_unit_id || undefined,
            defaultJobTypeId: meta.servicetitan_default_job_type_id || undefined,
        });
        if (migratedNow) migrated.push('servicetitan');
    }

    if (row.jobber_enabled && row.jobber_api_token) {
        const migratedNow = await migrateOne(row.id, 'jobber', {
            apiToken: row.jobber_api_token,
            accountId: row.jobber_account_id || '',
        });
        if (migratedNow) migrated.push('jobber');
    }

    if (row.housecallpro_enabled && row.housecallpro_api_key && row.housecallpro_company_id) {
        const migratedNow = await migrateOne(row.id, 'housecallpro', {
            apiKey: row.housecallpro_api_key,
            companyId: row.housecallpro_company_id,
        });
        if (migratedNow) migrated.push('housecallpro');
    }

    if (meta.freshsales_api_key && meta.freshsales_domain) {
        const migratedNow = await migrateOne(row.id, 'freshsales', {
            apiKey: String(meta.freshsales_api_key),
            domain: String(meta.freshsales_domain),
        });
        if (migratedNow) migrated.push('freshsales');
    }

    if (meta.insightly_api_key) {
        const migratedNow = await migrateOne(row.id, 'insightly', { apiKey: String(meta.insightly_api_key) });
        if (migratedNow) migrated.push('insightly');
    }

    return migrated;
}

async function main(): Promise<void> {
    const result = await pool.query(`
        select id, servicetitan_enabled, servicetitan_api_key, servicetitan_tenant_id,
               servicetitan_client_id, servicetitan_client_secret, servicetitan_app_key,
               jobber_enabled, jobber_api_token, jobber_account_id,
               housecallpro_enabled, housecallpro_api_key, housecallpro_company_id,
               metadata
        from public.voice_tenants
    `);

    let tenantsWithMigrations = 0;
    let totalConnections = 0;

    for (const row of result.rows as TenantRow[]) {
        const migrated = await migrateTenant(row);
        if (migrated.length > 0) {
            tenantsWithMigrations += 1;
            totalConnections += migrated.length;
            console.log(`${DRY_RUN ? '[dry-run] ' : ''}Tenant ${row.id}: migrated ${migrated.join(', ')}`);
        }
    }

    console.log(
        `\nDone. ${tenantsWithMigrations} tenant(s), ${totalConnections} connection(s) ${DRY_RUN ? 'would be' : 'were'} migrated.`
    );
    await pool.end();
}

main().catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
});
