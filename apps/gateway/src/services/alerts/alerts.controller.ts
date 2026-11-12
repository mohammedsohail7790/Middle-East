import { Router } from 'express';
import { asyncHandler } from '../../middleware/index.js';
import { getTenantId } from '../auth/tenant-context.js';
import { listAlerts, markAlertRead, markAllAlertsRead } from './alert-store.js';
import { alertEmailsEnabled } from './alert-service.js';

/**
 * GET  /alerts              the business's saved alerts (newest first) and how many are unread
 * POST /alerts/read-all     mark every alert read
 * POST /alerts/:id/read     mark one alert read
 * GET  /alerts/settings     { emailEnabled }
 * PUT  /alerts/settings     { emailEnabled: boolean } turns alert emails on or off for the business
 * Every query is scoped to the signed-in business; one business can never read or change another's alerts.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createAlertsRouter(deps?: { pool?: any }): Router {
  const router = Router();
  const db = async () => deps?.pool ?? (await import('../db/pool.js')).pool;
  const tenant = (req: any, res: any): string | null => {
    const id = getTenantId(req);
    if (!id) {
      res.status(400).json({ success: false, error: 'Tenant required' });
      return null;
    }
    return id;
  };

  router.get(
    '/settings',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = tenant(req, res);
      if (!tenantId) return;
      res.json({ success: true, data: { emailEnabled: await alertEmailsEnabled(await db(), tenantId) } });
    }),
  );

  router.put(
    '/settings',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = tenant(req, res);
      if (!tenantId) return;
      if (typeof req.body?.emailEnabled !== 'boolean') return void res.status(400).json({ success: false, error: 'emailEnabled must be true or false' });
      await (await db()).query(
        "UPDATE public.voice_tenants SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{alert_emails}', to_jsonb($2::text)) WHERE id = $1",
        [tenantId, String(req.body.emailEnabled)],
      );
      res.json({ success: true, data: { emailEnabled: req.body.emailEnabled } });
    }),
  );

  router.get(
    '/',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = tenant(req, res);
      if (!tenantId) return;
      const limit = Number.parseInt(String(req.query.limit ?? '30'), 10);
      const { alerts, unread } = await listAlerts(await db(), tenantId, Number.isFinite(limit) ? limit : 30);
      res.json({ success: true, data: { alerts, unread } });
    }),
  );

  router.post(
    '/read-all',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = tenant(req, res);
      if (!tenantId) return;
      res.json({ success: true, data: { marked: await markAllAlertsRead(await db(), tenantId) } });
    }),
  );

  router.post(
    '/:id/read',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = tenant(req, res);
      if (!tenantId) return;
      if (!UUID.test(String(req.params.id))) return void res.status(400).json({ success: false, error: 'Invalid alert id' });
      const ok = await markAlertRead(await db(), tenantId, String(req.params.id));
      if (!ok) return void res.status(404).json({ success: false, error: 'Alert not found' });
      res.json({ success: true });
    }),
  );

  return router;
}
