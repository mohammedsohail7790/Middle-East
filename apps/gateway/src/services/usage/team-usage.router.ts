import { Router } from 'express';
import { logger } from '../logger.js';
import { recentTeamAlerts } from '../ops-alerts/team-alert.js';
import { aiRatePerMinute, loadUsage, PHONE_USD_PER_MINUTE } from './team-usage.service.js';

/** GET /api/v1/consultancy-admin/usage. Mounted under the team-only gate, so only confirmed team emails reach it. */
export function createTeamUsageRouter(deps: { db?: { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> } } = {}): Router {
  const router = Router();
  router.get('/', async (_req, res) => {
    try {
      const db = deps.db ?? (await import('../db/pool.js')).pool;
      const aiRate = aiRatePerMinute();
      const [d7, d30] = await Promise.all([loadUsage(db, 7, aiRate), loadUsage(db, 30, aiRate)]);
      res.json({
        success: true,
        data: { periods: [d7, d30], rates: { phoneUsdPerMinute: PHONE_USD_PER_MINUTE, aiUsdPerMinute: aiRate }, alerts: recentTeamAlerts() },
      });
    } catch (error) {
      logger.error('[TeamUsage] Could not load usage', { error: error instanceof Error ? error.message : String(error) });
      res.status(500).json({ success: false, error: 'Could not load usage' });
    }
  });
  return router;
}
