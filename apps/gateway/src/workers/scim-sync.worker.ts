import { logger } from '../services/logger.js';
import { voiceDb } from '../services/voice/tenant-scope.js';
import { upsertScimUser } from '../services/enterprise-auth/scim.service.js';

let timer: ReturnType<typeof setInterval> | null = null;

/** Periodic SCIM directory reconciliation — inbound tenants only. */
export async function runScimSyncCycle(): Promise<{ synced: number }> {
  let synced = 0;
  try {
    const r = await voiceDb.query(
      `SELECT tenant_id, external_id, email, active, role
       FROM public.scim_directory_users WHERE active = true LIMIT 500`
    );
    for (const row of r.rows) {
      await upsertScimUser(row.tenant_id, {
        externalId: row.external_id,
        email: row.email,
        active: row.active,
        role: row.role || 'operator',
      });
      synced++;
    }
  } catch (err) {
    logger.debug('SCIM_SYNC_SKIP', { error: String(err) });
  }
  return { synced };
}

export function startScimSyncWorker(): void {
  if ((process.env.CALLIQ_SCIM_SYNC || 'false').toLowerCase() !== 'true') return;
  const intervalMs = Number(process.env.CALLIQ_SCIM_SYNC_INTERVAL_MS || 3_600_000);
  void runScimSyncCycle();
  timer = setInterval(() => void runScimSyncCycle(), intervalMs);
  timer.unref?.();
  logger.info('SCIM_SYNC_WORKER_STARTED', { intervalMs });
}
