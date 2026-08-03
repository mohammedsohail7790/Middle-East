/**
 * Slack Controller
 * API endpoints for Slack integration
 */

import { slackService } from './slack.service.js';
import { asyncHandler } from '../../middleware/index.js';
import { Router } from 'express';

export function createSlackRouter(): Router {
  const router = Router();

  /**
   * GET /api/v1/slack/connection
   * Get Slack connection for tenant
   */
  router.get(
    '/connection',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = req.headers['x-tenant-id'] as string;

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          error: 'Missing tenant ID',
        });
      }

      const connection = await slackService.getConnection(tenantId);

      res.json({
        success: true,
        data: connection,
      });
    })
  );

  /**
   * POST /api/v1/slack/webhook
   * Save Slack webhook URL
   */
  router.post(
    '/webhook',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = req.headers['x-tenant-id'] as string;
      const { webhookUrl, channel } = req.body;

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          error: 'Missing tenant ID',
        });
      }

      if (!webhookUrl || !channel) {
        return res.status(400).json({
          success: false,
          error: 'Missing webhook URL or channel',
        });
      }

      const connection = await slackService.saveWebhook(
        tenantId,
        webhookUrl,
        channel
      );

      res.json({
        success: true,
        data: connection,
      });
    })
  );

  /**
   * POST /api/v1/slack/test
   * Test Slack connection
   */
  router.post(
    '/test',
    asyncHandler(async (req: any, res: any) => {
      const { webhookUrl } = req.body;

      if (!webhookUrl) {
        return res.status(400).json({
          success: false,
          error: 'Missing webhook URL',
        });
      }

      const success = await slackService.testConnection(webhookUrl);

      res.json({
        success,
        message: success
          ? 'Slack connection test successful'
          : 'Slack connection test failed',
      });
    })
  );

  /**
   * PATCH /api/v1/slack/toggle
   * Toggle Slack notifications
   */
  router.patch(
    '/toggle',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = req.headers['x-tenant-id'] as string;
      const { enabled } = req.body;

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          error: 'Missing tenant ID',
        });
      }

      if (typeof enabled !== 'boolean') {
        return res.status(400).json({
          success: false,
          error: 'Missing or invalid enabled flag',
        });
      }

      await slackService.toggleNotifications(tenantId, enabled);

      res.json({
        success: true,
        message: `Slack notifications ${enabled ? 'enabled' : 'disabled'}`,
      });
    })
  );

  /**
   * DELETE /api/v1/slack/connection
   * Disconnect Slack
   */
  router.delete(
    '/connection',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = req.headers['x-tenant-id'] as string;

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          error: 'Missing tenant ID',
        });
      }

      await slackService.disconnect(tenantId);

      res.json({
        success: true,
        message: 'Slack disconnected successfully',
      });
    })
  );

  /**
   * POST /api/v1/slack/notify
   * Send manual notification (for testing)
   */
  router.post(
    '/notify',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = req.headers['x-tenant-id'] as string;
      const { type, data } = req.body;

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          error: 'Missing tenant ID',
        });
      }

      if (!type || !data) {
        return res.status(400).json({
          success: false,
          error: 'Missing notification type or data',
        });
      }

      // Send notification based on type
      switch (type) {
        case 'new_lead':
          await slackService.sendNewLeadNotification(tenantId, data);
          break;
        case 'new_call':
          await slackService.sendNewCallNotification(tenantId, data);
          break;
        case 'appointment_booked':
          await slackService.sendAppointmentBookedNotification(tenantId, data);
          break;
        case 'missed_call':
          await slackService.sendMissedCallNotification(tenantId, data);
          break;
        default:
          return res.status(400).json({
            success: false,
            error: 'Invalid notification type',
          });
      }

      res.json({
        success: true,
        message: 'Notification sent successfully',
      });
    })
  );

  return router;
}

