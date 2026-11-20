import express from 'express';
import { asyncHandler } from '../middleware/index.js';
import { requireTenant } from '../middleware/require-tenant.js';
import { getTenantId } from '../services/auth/tenant-context.js';
import { buildTenantDiagnosticsPack } from './support-diagnostics.service.js';
import { evaluateAnomalies } from '../observability/anomaly-detection/anomaly-detector.js';
import { tuneAlerts, correlateAlerts } from '../observability/alerts/alert-tuning.service.js';
import { adviseScaling } from '../observability/scaling/scaling-advisor.js';
import { evaluateBackpressure } from '../infrastructure/backpressure.js';
import { scoreScaleConfidence } from '../validation/scale-confidence.service.js';
import { checkTicketAllowed, sendSupportTicket, validateTicket } from './support-ticket.js';

/** When each workspace last sent a ticket (kept in memory, per gateway instance). */
const ticketHistory = new Map<string, number[]>();

export function createSupportRouter(): express.Router {
  const router = express.Router();
  router.use(requireTenant);

  // A client's message to the team. Emailed, not stored. 3 an hour per workspace.
  router.post(
    '/ticket',
    asyncHandler(async (req, res) => {
      const tenantId = getTenantId(req);
      const checked = validateTicket(req.body);
      if (!checked.ok || !checked.ticket) return void res.status(400).json({ success: false, error: checked.error ?? 'Invalid ticket.' });
      const now = Date.now();
      const history = (ticketHistory.get(tenantId) ?? []).filter((t) => now - t < 60 * 60 * 1000);
      const allowed = checkTicketAllowed(history, now);
      if (!allowed.allowed) return void res.status(429).json({ success: false, error: allowed.message });
      let workspace: string | undefined;
      try {
        const { pool } = await import('../services/db/pool.js');
        const r = await pool.query('SELECT company_name FROM public.voice_tenants WHERE id = $1 LIMIT 1', [tenantId]);
        workspace = r.rows[0]?.company_name ?? undefined;
      } catch {
        // The workspace name is only a convenience for the team; the ticket still goes out without it.
      }
      const sent = await sendSupportTicket(checked.ticket, { workspace, tenantId });
      if (!sent) return void res.status(502).json({ success: false, error: 'We could not send your message. Please email us directly.' });
      history.push(now);
      ticketHistory.set(tenantId, history);
      res.json({ success: true, data: { received: true } });
    })
  );

  router.get(
    '/diagnostics',
    asyncHandler(async (req, res) => {
      const tenantId = getTenantId(req);
      res.json({ success: true, data: await buildTenantDiagnosticsPack(tenantId) });
    })
  );

  router.get(
    '/alerts-tuned',
    asyncHandler(async (req, res) => {
      const tenantId = getTenantId(req);
      const raw = await evaluateAnomalies(tenantId);
      const tuned = tuneAlerts(raw, tenantId);
      res.json({
        success: true,
        data: { alerts: tuned, correlated: correlateAlerts(tuned) },
      });
    })
  );

  router.get(
    '/scaling-advice',
    asyncHandler(async (_req, res) => {
      res.json({ success: true, data: await adviseScaling() });
    })
  );

  router.get(
    '/backpressure',
    asyncHandler(async (_req, res) => {
      res.json({ success: true, data: evaluateBackpressure() });
    })
  );

  router.get(
    '/scale-confidence',
    asyncHandler(async (_req, res) => {
      res.json({ success: true, data: await scoreScaleConfidence() });
    })
  );

  return router;
}
