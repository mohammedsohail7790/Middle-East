import { logger } from '../logger.js';
import { connectionStore } from './connection-store.service.js';

/** Mirror OAuth success in connection_store so the catalog shows verified status. */
export async function recordOAuthConnectionTested(
  tenantId: string,
  provider: string,
  credentials: Record<string, unknown>,
  message: string,
  tested = true
): Promise<void> {
  try {
    await connectionStore.upsertConnection(tenantId, provider, 'oauth', credentials, {
      status: 'connected',
    });
    await connectionStore.markTested(tenantId, provider, tested, tested ? undefined : message);
    await connectionStore.appendLog(tenantId, provider, 'connect', tested ? 'info' : 'warn', message);
  } catch (err) {
    logger.warn('Failed to record OAuth connection in connection store', {
      tenantId,
      provider,
      error: String(err),
    });
  }
}
