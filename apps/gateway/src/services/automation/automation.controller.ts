/**
 * Automation Controller — Plan-Gated
 *
 * Automation rules (emailSmsSummaries feature) — available on all plans per current plan matrix.
 * Gated through billingService.canUseFeature('emailSmsSummaries') for future-proofing.
 */

import { automationService } from './automation.service.js';
import { asyncHandler } from '../../middleware/index.js';
import { logger } from '../logger.js';
import { billingService } from '../billing/billing.service.js';
import { Router } from 'express';
import { requireVoiceApiAccess } from '../voice/security.js';
import {
  normalizeAutomationTrigger,
  normalizeAutomationAction,
  toDashboardRule,
} from './automation.dto.js';

async function requireAutomation(
  tenantId: string,
  res: Response,
  options: { write?: boolean } = {}
): Promise<boolean> {
  const { assertOperationalAccess } = await import('../billing/account-access.service.js');
  const operational = await assertOperationalAccess(tenantId, 'automations');
  if (!operational.allowed) {
    res.status(403).json({ success: false, error: operational.reason || 'Automations paused' });
    return false;
  }

  if (!options.write) {
    return true;
  }

  const sub = await billingService.getActiveSubscription(tenantId);
  if (!sub || sub.status === 'trialing' || sub.plan !== 'essential') {
    return true;
  }
  const allowed = await billingService.canUseFeature(tenantId, 'emailSmsSummaries');
  if (!allowed) {
    res.status(403).json({
      success: false,
      error: 'Automation rules require Professional plan or higher',
    });
    return false;
  }
  return true;
}

export function createAutomationRouter(): Router {
  const router = Router();
  router.use(requireVoiceApiAccess);

  /**
   * GET /api/v1/automation/rules
   */
  router.get(
    '/rules',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = req.headers['x-tenant-id'] as string;
      if (!tenantId) return res.status(400).json({ error: 'Missing x-tenant-id header' });
      if (!await requireAutomation(tenantId, res, { write: false })) return;

      const rules = await automationService.getRules(tenantId);
      res.json({
        success: true,
        data: rules.map((r) =>
          toDashboardRule((r as unknown as Record<string, unknown>) ?? {})
        ),
        count: rules.length,
      });
    })
  );

  /**
   * POST /api/v1/automation/rules
   */
  router.post(
    '/rules',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = req.headers['x-tenant-id'] as string;
      if (!tenantId) return res.status(400).json({ error: 'Missing x-tenant-id header' });
      if (!await requireAutomation(tenantId, res, { write: true })) return;

      const { name, trigger, action, template, delay } = req.body;
      if (!name || !trigger || !action) {
        return res.status(400).json({ error: 'Missing required fields: name, trigger, action' });
      }

      const canonicalTrigger = normalizeAutomationTrigger(trigger);
      const canonicalAction = normalizeAutomationAction(action);
      const messageTemplate =
        typeof template === 'string' && template.trim()
          ? template.trim()
          : 'Thanks for contacting us. We will follow up shortly.';
      const rule = await automationService.createRule(
        tenantId,
        name,
        canonicalTrigger as any,
        canonicalAction as any,
        messageTemplate,
        delay
      );
      logger.info('[Automation] Rule created', { tenantId, ruleId: rule.id });
      res.json({ success: true, data: toDashboardRule(rule as unknown as Record<string, unknown>) });
    })
  );

  /**
   * PATCH /api/v1/automation/rules/:ruleId/toggle
   */
  router.patch(
    '/rules/:ruleId/toggle',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = req.headers['x-tenant-id'] as string;
      if (!tenantId) return res.status(400).json({ error: 'Missing x-tenant-id header' });
      if (!await requireAutomation(tenantId, res, { write: true })) return;

      const { ruleId } = req.params;
      const { enabled } = req.body;
      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'Missing required field: enabled (boolean)' });
      }

      await automationService.toggleRule(tenantId, ruleId, enabled);
      logger.info('[Automation] Rule toggled', { tenantId, ruleId, enabled });
      res.json({ success: true, message: `Rule ${enabled ? 'enabled' : 'disabled'}` });
    })
  );

  /**
   * POST /api/v1/automation/test/call-followup
   */
  router.post(
    '/test/call-followup',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = req.headers['x-tenant-id'] as string;
      if (!tenantId) return res.status(400).json({ error: 'Missing x-tenant-id header' });
      if (!await requireAutomation(tenantId, res, { write: true })) return;

      const { callId, phoneNumber } = req.body;
      if (!callId || !phoneNumber) {
        return res.status(400).json({ error: 'Missing required fields: callId, phoneNumber' });
      }

      await automationService.sendCallFollowUp(tenantId, callId, phoneNumber);
      res.json({ success: true, message: 'Call follow-up sent' });
    })
  );

  /**
   * POST /api/v1/automation/test/appointment-reminder
   */
  router.post(
    '/test/appointment-reminder',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = req.headers['x-tenant-id'] as string;
      if (!tenantId) return res.status(400).json({ error: 'Missing x-tenant-id header' });
      if (!await requireAutomation(tenantId, res, { write: true })) return;

      const { appointmentId, hours } = req.body;
      if (!appointmentId) {
        return res.status(400).json({ error: 'Missing required field: appointmentId' });
      }

      await automationService.sendAppointmentReminder(tenantId, appointmentId, hours || 24);
      res.json({ success: true, message: 'Appointment reminder sent' });
    })
  );

  /**
   * POST /api/v1/automation/test/lead-notification
   */
  router.post(
    '/test/lead-notification',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = req.headers['x-tenant-id'] as string;
      if (!tenantId) return res.status(400).json({ error: 'Missing x-tenant-id header' });
      if (!await requireAutomation(tenantId, res, { write: true })) return;

      const { leadId } = req.body;
      if (!leadId) {
        return res.status(400).json({ error: 'Missing required field: leadId' });
      }

      await automationService.sendNewLeadNotification(tenantId, leadId);
      res.json({ success: true, message: 'Lead notification sent' });
    })
  );

  return router;
}

