import { pool } from '../db/pool.js';

/** Shared gateway Postgres pool (alias for tenant-scoped queries). */
export const voiceDb = pool;

export function getTenantScopedQuery(
    tenantId: string,
    baseQuery: string,
    params: unknown[] = [],
    tenantColumn = 'tenant_id'
): { text: string; values: unknown[] } {
    const tenantParamPosition = params.length + 1;
    const whereRegex = /\bwhere\b/i;
    const suffix = whereRegex.test(baseQuery)
        ? ` and ${tenantColumn} = $${tenantParamPosition}`
        : ` where ${tenantColumn} = $${tenantParamPosition}`;

    return {
        text: `${baseQuery}${suffix}`,
        values: [...params, tenantId],
    };
}

export async function queryTenantRows<T = Record<string, unknown>>(
    tenantId: string,
    baseQuery: string,
    params: unknown[] = [],
    tenantColumn = 'tenant_id'
): Promise<T[]> {
    const scoped = getTenantScopedQuery(tenantId, baseQuery, params, tenantColumn);
    const result = await voiceDb.query(scoped.text, scoped.values);
    return result.rows as T[];
}
