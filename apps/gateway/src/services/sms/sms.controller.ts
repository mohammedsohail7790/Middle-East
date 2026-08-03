/**
 * SMS Controller
 * API endpoints for SMS functionality
 */

import { smsService } from './sms.service.js';
import { asyncHandler } from '../../middleware/index.js';
import { validate } from '../../middleware/validation.js';
import {
  smsConversationsQuerySchema,
  smsPhoneParamSchema,
  smsSendBodySchema,
  smsSendTemplateBodySchema,
  smsTemplateBodySchema,
} from '../../security/validation-schemas.js';
import { voiceAuthUnlessPublic } from '../../middleware/voice-auth-unless-public.js';
import { logger } from '../logger.js';
import { Router } from 'express';

export function createSmsRouter(): Router {
  const router = Router();
  router.use(voiceAuthUnlessPublic);

  /**
   * GET /api/v1/sms/conversations
   * Get all SMS conversations for tenant
   */
  router.get(
    '/conversations',
    validate(smsConversationsQuerySchema),
    asyncHandler(async (req: any, res: any) => {
      const tenantId = req.headers['x-tenant-id'] as string;
      
      if (!tenantId) {
        return res.status(400).json({ error: 'Missing x-tenant-id header' });
      }

      const limit = parseInt(req.query.limit as string) || 50;
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const conversations = await smsService.getConversations(tenantId, limit, search);

      res.json({
        success: true,
        data: conversations,
        count: conversations.length,
      });
    })
  );

  /**
   * GET /api/v1/sms/conversations/:phoneNumber
   * Get specific conversation with messages
   */
  router.get(
    '/conversations/:phoneNumber',
    validate(smsPhoneParamSchema),
    asyncHandler(async (req: any, res: any) => {
      const tenantId = req.headers['x-tenant-id'] as string;
      const { phoneNumber } = req.params;

      if (!tenantId) {
        return res.status(400).json({ error: 'Missing x-tenant-id header' });
      }

      const conversation = await smsService.getConversation(tenantId, phoneNumber);

      if (!conversation) {
        return res.json({
          success: true,
          data: {
            phoneNumber,
            messages: [],
          },
        });
      }

      res.json({
        success: true,
        data: conversation,
      });
    })
  );

  /**
   * POST /api/v1/sms/send
   * Send SMS message
   */
  router.post(
    '/send',
    validate(smsSendBodySchema),
    asyncHandler(async (req: any, res: any) => {
      const tenantId = req.headers['x-tenant-id'] as string;
      const { to, message, from } = req.body;

      if (!tenantId) {
        return res.status(400).json({ error: 'Missing x-tenant-id header' });
      }

      if (!to || !message) {
        return res.status(400).json({ error: 'Missing required fields: to, message' });
      }

      const smsMessage = await smsService.sendSms(tenantId, to, message, from);

      logger.info('[SMS] Message sent', { tenantId, to, messageId: smsMessage.id });

      res.json({
        success: true,
        data: smsMessage,
      });
    })
  );

  /**
   * POST /api/v1/sms/webhook
   * Twilio webhook for incoming SMS
   */
  router.post(
    '/webhook',
    asyncHandler(async (req: any, res: any) => {
      const { From, Body, MessageSid, To } = req.body;

      // Resolve tenant from the "To" phone number using multi-number lookup
      let tenantId = req.query.tenantId as string || req.headers['x-tenant-id'] as string;

      if (!tenantId && To) {
        const normalizedTo = String(To).replace(/[^\d+]/g, '');
        const { voiceDb } = await import('../voice/tenant-scope.js');
        const result = await voiceDb.query(
          `SELECT tenant_id FROM public.get_tenant_by_phone_number($1)`,
          [normalizedTo]
        );
        if (result.rows.length > 0) {
          tenantId = result.rows[0].tenant_id;
        }
      }

      if (!tenantId) {
        logger.warn('[SMS] Webhook received without tenant ID', { from: From, to: To });
        return res.status(400).send('Missing tenant ID');
      }

      await smsService.receiveSms(tenantId, From, Body, MessageSid);

      // Respond with TwiML (empty response)
      res.type('text/xml');
      res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    })
  );

  /**
   * POST /api/v1/sms/conversations/:phoneNumber/read
   * Mark conversation as read
   */
  router.post(
    '/conversations/:phoneNumber/read',
    validate(smsPhoneParamSchema),
    asyncHandler(async (req: any, res: any) => {
      const tenantId = req.headers['x-tenant-id'] as string;
      const { phoneNumber } = req.params;

      if (!tenantId) {
        return res.status(400).json({ error: 'Missing x-tenant-id header' });
      }

      await smsService.markAsRead(tenantId, phoneNumber);

      res.json({
        success: true,
        message: 'Conversation marked as read',
      });
    })
  );

  /**
   * GET /api/v1/sms/templates
   * Get SMS templates
   */
  router.get(
    '/templates',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = req.headers['x-tenant-id'] as string;

      if (!tenantId) {
        return res.status(400).json({ error: 'Missing x-tenant-id header' });
      }

      const templates = await smsService.getTemplates(tenantId);

      res.json({
        success: true,
        data: templates,
        count: templates.length,
      });
    })
  );

  /**
   * POST /api/v1/sms/templates
   * Create SMS template
   */
  router.post(
    '/templates',
    validate(smsTemplateBodySchema),
    asyncHandler(async (req: any, res: any) => {
      const tenantId = req.headers['x-tenant-id'] as string;
      const { name, content, trigger } = req.body;

      if (!tenantId) {
        return res.status(400).json({ error: 'Missing x-tenant-id header' });
      }

      if (!name || !content || !trigger) {
        return res.status(400).json({ error: 'Missing required fields: name, content, trigger' });
      }

      const template = await smsService.createTemplate(tenantId, name, content, trigger);

      logger.info('[SMS] Template created', { tenantId, templateId: template.id });

      res.json({
        success: true,
        data: template,
      });
    })
  );

  /**
   * POST /api/v1/sms/send-template
   * Send SMS from template
   */
  router.post(
    '/send-template',
    validate(smsSendTemplateBodySchema),
    asyncHandler(async (req: any, res: any) => {
      const tenantId = req.headers['x-tenant-id'] as string;
      const { to, templateId, variables } = req.body;

      if (!tenantId) {
        return res.status(400).json({ error: 'Missing x-tenant-id header' });
      }

      if (!to || !templateId) {
        return res.status(400).json({ error: 'Missing required fields: to, templateId' });
      }

      const message = await smsService.sendFromTemplate(tenantId, to, templateId, variables);

      logger.info('[SMS] Template message sent', { tenantId, to, templateId });

      res.json({
        success: true,
        data: message,
      });
    })
  );

  return router;
}

