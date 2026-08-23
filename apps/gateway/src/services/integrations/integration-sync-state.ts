import { voiceDb } from '../voice/tenant-scope.js';
import { logger } from '../logger.js';

export async function recordIntegrationSync(
  tenantId: string,
  provider: string,
  itemsSynced: number,
  error?: string
): Promise<void> {
  try {
    await voiceDb.query(
      `INSERT INTO public.integration_sync_state
         (tenant_id, provider, last_sync_at, last_success_at, last_error, items_synced, updated_at)
       VALUES ($1, $2, NOW(), CASE WHEN $4::text IS NULL THEN NOW() ELSE NULL END, $4, $3, NOW())
       ON CONFLICT (tenant_id, provider) DO UPDATE SET
         last_sync_at = NOW(),
         last_success_at = CASE WHEN EXCLUDED.last_error IS NULL THEN NOW() ELSE integration_sync_state.last_success_at END,
         last_error = EXCLUDED.last_error,
         items_synced = EXCLUDED.items_synced,
         updated_at = NOW()`,
      [tenantId, provider, itemsSynced, error ?? null]
    );
  } catch (err) {
    logger.warn('integration_sync_state write skipped', {
      tenantId,
      provider,
      error: String(err),
    });
  }
}

export async function loadIntegrationSyncTimes(
  tenantId: string
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const result = await voiceDb.query(
      `SELECT provider, last_sync_at, last_success_at
       FROM public.integration_sync_state
       WHERE tenant_id = $1`,
      [tenantId]
    );
    for (const row of result.rows) {
      const at = row.last_sync_at || row.last_success_at;
      if (at) map.set(String(row.provider), new Date(at).toISOString());
    }
  } catch {
    /* table optional until migration applied */
  }

  try {
    const cal = await voiceDb.query(
      `SELECT provider, last_sync_at
       FROM public.calendar_connections
       WHERE tenant_id = $1 AND last_sync_at IS NOT NULL`,
      [tenantId]
    );
    for (const row of cal.rows) {
      const key =
        row.provider === 'google'
          ? 'google-calendar'
          : String(row.provider);
      if (row.last_sync_at && !map.has(key)) {
        map.set(key, new Date(row.last_sync_at).toISOString());
      }
    }
  } catch {
    /* ignore */
  }

  return map;
}
