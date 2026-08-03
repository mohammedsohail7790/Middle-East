/**
 * Business Hours Controller
 * API endpoints for business hours configuration
 */

import { businessHoursService } from './business-hours.service.js';
import { asyncHandler } from '../../middleware/index.js';
import { resolveTenantId } from '../../middleware/resolve-tenant-id.js';
import { requireVoiceApiAccess } from '../voice/security.js';
import { publishDashboardPushType } from '../dashboard/dashboard-events.js';
import { logger } from '../logger.js';
import { Router } from 'express';

function tenantFromRequest(req: any, res: any): string | null {
  try {
    return resolveTenantId(req);
  } catch {
    res.status(400).json({ success: false, error: 'Tenant context missing' });
    return null;
  }
}

export function createBusinessHoursRouter(): Router {
  const router = Router();
  router.use(requireVoiceApiAccess);

  router.get(
    '/',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = tenantFromRequest(req, res);
      if (!tenantId) return;

      let hours = await businessHoursService.getBusinessHours(tenantId);
      if (hours.length === 0) {
        try {
          await businessHoursService.initializeDefaultHours(tenantId);
          hours = await businessHoursService.getBusinessHours(tenantId);
        } catch (initErr) {
          logger.warn('[BusinessHours] Could not initialize default hours', {
            tenantId,
            error: String(initErr),
          });
        }
      }

      res.json({
        success: true,
        data: hours,
      });
    })
  );

  router.put(
    '/:dayOfWeek',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = tenantFromRequest(req, res);
      if (!tenantId) return;
      const { dayOfWeek } = req.params;
      const { startTime, endTime, isOpen, timezone } = req.body;

      const day = parseInt(dayOfWeek);
      if (isNaN(day) || day < 0 || day > 6) {
        return res.status(400).json({ error: 'Invalid day of week (0-6)' });
      }

      const hours = await businessHoursService.updateBusinessHours(
        tenantId,
        day,
        startTime,
        endTime,
        isOpen,
        timezone
      );

      logger.info('[BusinessHours] Hours updated', { tenantId, dayOfWeek: day });
      publishDashboardPushType(tenantId, 'config.updated');
      try {
        const { invalidateVoiceTenantCache } = await import('../voice/voice-config-cache.js');
        await invalidateVoiceTenantCache(tenantId);
      } catch {
        /* non-fatal */
      }

      res.json({
        success: true,
        data: hours,
      });
    })
  );

  router.get(
    '/status',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = tenantFromRequest(req, res);
      if (!tenantId) return;

      const isOpen = await businessHoursService.isCurrentlyOpen(tenantId);
      const nextAvailable = await businessHoursService.getNextAvailableTime(tenantId);

      res.json({
        success: true,
        data: {
          isOpen,
          nextAvailable,
        },
      });
    })
  );

  router.get(
    '/holidays',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = tenantFromRequest(req, res);
      if (!tenantId) return;

      const holidays = await businessHoursService.getHolidays(tenantId);

      res.json({
        success: true,
        data: holidays,
        count: holidays.length,
      });
    })
  );

  router.post(
    '/holidays',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = tenantFromRequest(req, res);
      if (!tenantId) return;
      const { name, date, isRecurring } = req.body;

      if (!name || !date) {
        return res.status(400).json({ error: 'Missing required fields: name, date' });
      }

      const holiday = await businessHoursService.addHoliday(
        tenantId,
        name,
        new Date(date),
        isRecurring || false
      );

      logger.info('[BusinessHours] Holiday added', { tenantId, name });
      publishDashboardPushType(tenantId, 'config.updated');

      res.json({
        success: true,
        data: holiday,
      });
    })
  );

  router.delete(
    '/holidays/:holidayId',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = tenantFromRequest(req, res);
      if (!tenantId) return;
      const { holidayId } = req.params;

      await businessHoursService.deleteHoliday(tenantId, holidayId);

      logger.info('[BusinessHours] Holiday deleted', { tenantId, holidayId });
      publishDashboardPushType(tenantId, 'config.updated');

      res.json({
        success: true,
        message: 'Holiday deleted',
      });
    })
  );

  router.post(
    '/initialize',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = tenantFromRequest(req, res);
      if (!tenantId) return;

      await businessHoursService.initializeDefaultHours(tenantId);

      logger.info('[BusinessHours] Default hours initialized', { tenantId });
      publishDashboardPushType(tenantId, 'config.updated');

      res.json({
        success: true,
        message: 'Default hours initialized',
      });
    })
  );

  return router;
}

