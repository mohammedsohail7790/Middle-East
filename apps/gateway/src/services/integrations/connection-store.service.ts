import { voiceDb } from '../voice/tenant-scope.js';
import { logger } from '../logger.js';
import { encryptCredentials, decryptCredentials } from './credential-encryption.js';

export type ConnectionStatus = 'disconnected' | 'connected' | 'error' | 'coming_soon';

export interface IntegrationConnectionRow {
    id: string;
    tenant_id: string;
    integration_id: string;
    auth_type: string;
    status: ConnectionStatus;
    config: Record<string, unknown>;
    last_sync_at: string | null;
    last_test_at: string | null;
    last_error: string | null;
    connected_at: string | null;
}

const ROW_COLUMNS = `id, tenant_id, integration_id, auth_type, status, config,
    last_sync_at, last_test_at, last_error, connected_at`;

/** CRUD + encryption helper over public.integration_connections */
export const connectionStore = {
    async getConnection(tenantId: string, integrationId: string): Promise<IntegrationConnectionRow | null> {
        const result = await voiceDb.query(
            `select ${ROW_COLUMNS} from public.integration_connections
             where tenant_id = $1 and integration_id = $2 limit 1`,
            [tenantId, integrationId]
        );
        return result.rows[0] || null;
    },

    async listConnections(tenantId: string): Promise<IntegrationConnectionRow[]> {
        const result = await voiceDb.query(
            `select ${ROW_COLUMNS} from public.integration_connections where tenant_id = $1`,
            [tenantId]
        );
        return result.rows;
    },

    async getDecryptedCredentials<T = Record<string, unknown>>(
        tenantId: string,
        integrationId: string
    ): Promise<T | null> {
        const result = await voiceDb.query(
            `select credentials_encrypted from public.integration_connections
             where tenant_id = $1 and integration_id = $2 limit 1`,
            [tenantId, integrationId]
        );
        const encrypted = result.rows[0]?.credentials_encrypted;
        if (!encrypted) return null;
        try {
            return decryptCredentials<T>(encrypted);
        } catch (error) {
            logger.error('Failed to decrypt integration credentials', { tenantId, integrationId, error: String(error) });
            return null;
        }
    },

    /** Encrypts and stores credentials, setting status (defaults to 'connected'). */
    async upsertConnection(
        tenantId: string,
        integrationId: string,
        authType: string,
        credentials: Record<string, unknown>,
        opts: { status?: ConnectionStatus; config?: Record<string, unknown> } = {}
    ): Promise<void> {
        const status = opts.status ?? 'connected';
        const encrypted = encryptCredentials(credentials);
        const config = JSON.stringify(opts.config ?? {});

        await voiceDb.query(
            `insert into public.integration_connections
                (tenant_id, integration_id, auth_type, status, credentials_encrypted, config, connected_at, last_error)
             values ($1, $2, $3, $4, $5, $6::jsonb, now(), null)
             on conflict (tenant_id, integration_id) do update set
                auth_type = excluded.auth_type,
                status = excluded.status,
                credentials_encrypted = excluded.credentials_encrypted,
                config = excluded.config,
                connected_at = now(),
                last_error = null,
                updated_at = now()`,
            [tenantId, integrationId, authType, status, encrypted, config]
        );
    },

    async clearConnection(tenantId: string, integrationId: string): Promise<void> {
        await voiceDb.query(
            `update public.integration_connections
             set status = 'disconnected', credentials_encrypted = null, last_error = null, updated_at = now()
             where tenant_id = $1 and integration_id = $2`,
            [tenantId, integrationId]
        );
    },

    async markTested(tenantId: string, integrationId: string, success: boolean, error?: string): Promise<void> {
        await voiceDb.query(
            `update public.integration_connections
             set last_test_at = now(), status = $3, last_error = $4, updated_at = now()
             where tenant_id = $1 and integration_id = $2`,
            [tenantId, integrationId, success ? 'connected' : 'error', success ? null : error || null]
        );
    },

    async markSynced(tenantId: string, integrationId: string, success: boolean, error?: string): Promise<void> {
        await voiceDb.query(
            `update public.integration_connections
             set last_sync_at = now(), last_error = $3, updated_at = now()
             where tenant_id = $1 and integration_id = $2`,
            [tenantId, integrationId, success ? null : error || null]
        );
    },

    async appendLog(
        tenantId: string,
        integrationId: string,
        action: string,
        level: 'info' | 'warn' | 'error',
        message?: string,
        metadata: Record<string, unknown> = {}
    ): Promise<void> {
        try {
            const connection = await connectionStore.getConnection(tenantId, integrationId);
            await voiceDb.query(
                `insert into public.integration_logs (tenant_id, connection_id, integration_id, action, level, message, metadata)
                 values ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
                [tenantId, connection?.id || null, integrationId, action, level, message || null, JSON.stringify(metadata)]
            );
        } catch (error) {
            logger.error('Failed to write integration log', { tenantId, integrationId, action, error: String(error) });
        }
    },

    async createSyncJob(
        tenantId: string,
        connectionId: string,
        integrationId: string,
        jobType: 'sync' | 'test_lead' | 'test_appointment' | 'verify'
    ): Promise<string> {
        const result = await voiceDb.query(
            `insert into public.integration_sync_jobs (tenant_id, connection_id, integration_id, job_type, status, started_at)
             values ($1, $2, $3, $4, 'running', now())
             returning id`,
            [tenantId, connectionId, integrationId, jobType]
        );
        return result.rows[0].id;
    },

    async finishSyncJob(
        jobId: string,
        success: boolean,
        result?: Record<string, unknown>,
        error?: string
    ): Promise<void> {
        await voiceDb.query(
            `update public.integration_sync_jobs
             set status = $2, result = $3::jsonb, error = $4, finished_at = now()
             where id = $1`,
            [jobId, success ? 'success' : 'failed', JSON.stringify(result ?? {}), error || null]
        );
    },
};
