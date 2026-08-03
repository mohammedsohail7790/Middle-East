/**
 * Leads Controller
 * API endpoints for lead management
 */

import { leadsService } from './leads.service.js';
import { asyncHandler } from '../../middleware/index.js';
import { validate } from '../../middleware/validation.js';
import {
  leadsListQuerySchema,
  leadCreateBodySchema,
  leadUpdateBodySchema,
  leadStatusBodySchema,
  leadAssignBodySchema,
  leadActivityBodySchema,
  leadIdParamSchema,
} from '../../security/validation-schemas.js';
import { requireVoiceApiAccess } from '../voice/security.js';
import { logger } from '../logger.js';
import { Router } from 'express';

export function createLeadsRouter(): Router {
  const router = Router();
  router.use(requireVoiceApiAccess);

  /**
   * GET /api/v1/leads
   * Get all leads with optional filters
   */
  router.get(
    '/',
    validate(leadsListQuerySchema),
    asyncHandler(async (req: any, res: any) => {
      const tenantId = req.headers['x-tenant-id'] as string;

      if (!tenantId) {
        return res.status(400).json({ error: 'Missing x-tenant-id header' });
      }

      const filters = {
        status: req.query.status as string,
        assignedTo: req.query.assignedTo as string,
        minScore: req.query.minScore ? parseInt(req.query.minScore as string) : undefined,
        search: req.query.search as string,
      };

      const limit = Math.min(
        Math.max(parseInt(String(req.query.limit || '100'), 10) || 100, 1),
        500
      );
      const offset = Math.max(parseInt(String(req.query.offset || '0'), 10) || 0, 0);

      const page = await leadsService.getLeads(tenantId, filters, { limit, offset });

      res.json({
        success: true,
        data: page.items,
        total: page.total,
        count: page.items.length,
        limit: page.limit,
        offset: page.offset,
      });
    })
  );

  /**
   * GET /api/v1/leads/stats
   * Get lead statistics
   */
  router.get(
    '/stats',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = req.headers['x-tenant-id'] as string;

      if (!tenantId) {
        return res.status(400).json({ error: 'Missing x-tenant-id header' });
      }

      const stats = await leadsService.getStats(tenantId);

      res.json({
        success: true,
        data: stats,
      });
    })
  );

  /**
   * GET /api/v1/leads/:leadId
   * Get specific lead
   */
  router.get(
    '/:leadId',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = req.headers['x-tenant-id'] as string;
      const { leadId } = req.params;

      if (!tenantId) {
        return res.status(400).json({ error: 'Missing x-tenant-id header' });
      }

      const lead = await leadsService.getLead(tenantId, leadId);

      res.json({
        success: true,
        data: lead,
      });
    })
  );

  /**
   * POST /api/v1/leads
   * Create new lead
   */
  router.post(
    '/',
    validate(leadCreateBodySchema),
    asyncHandler(async (req: any, res: any) => {
      const tenantId = req.headers['x-tenant-id'] as string;
      const { phoneNumber, source, email, name, notes, metadata } = req.body;

      if (!tenantId) {
        return res.status(400).json({ error: 'Missing x-tenant-id header' });
      }

      if (!phoneNumber || !source) {
        return res.status(400).json({ error: 'Missing required fields: phoneNumber, source' });
      }

      const lead = await leadsService.createLead(tenantId, phoneNumber, source, {
        email,
        name,
        notes,
        metadata,
      });

      logger.info('[Leads] Lead created', { tenantId, leadId: lead.id });

      res.json({
        success: true,
        data: lead,
      });
    })
  );

  /**
   * PUT /api/v1/leads/:leadId
   * Update lead details
   */
  router.put(
    '/:leadId',
    validate({ ...leadIdParamSchema, ...leadUpdateBodySchema }),
    asyncHandler(async (req: any, res: any) => {
      const tenantId = req.headers['x-tenant-id'] as string;
      const { leadId } = req.params;
      const { email, name, notes, metadata, source, phoneNumber, phone } = req.body;

      if (!tenantId) {
        return res.status(400).json({ error: 'Missing x-tenant-id header' });
      }

      const lead = await leadsService.updateLead(tenantId, leadId, {
        email,
        name,
        notes,
        metadata,
        source,
        phoneNumber: phoneNumber ?? phone,
      });

      logger.info('[Leads] Lead updated', { tenantId, leadId });

      res.json({
        success: true,
        data: lead,
      });
    })
  );

  /**
   * PATCH /api/v1/leads/:leadId/status
   * Update lead status
   */
  router.patch(
    '/:leadId/status',
    validate({ ...leadIdParamSchema, ...leadStatusBodySchema }),
    asyncHandler(async (req: any, res: any) => {
      const tenantId = req.headers['x-tenant-id'] as string;
      const { leadId } = req.params;
      const { status } = req.body;

      if (!tenantId) {
        return res.status(400).json({ error: 'Missing x-tenant-id header' });
      }

      if (!status) {
        return res.status(400).json({ error: 'Missing required field: status' });
      }

      const lead = await leadsService.updateLeadStatus(tenantId, leadId, status);

      logger.info('[Leads] Lead status updated', { tenantId, leadId, status });

      res.json({
        success: true,
        data: lead,
      });
    })
  );

  /**
   * PATCH /api/v1/leads/:leadId/assign
   * Assign lead to team member
   */
  router.patch(
    '/:leadId/assign',
    validate({ ...leadIdParamSchema, ...leadAssignBodySchema }),
    asyncHandler(async (req: any, res: any) => {
      const tenantId = req.headers['x-tenant-id'] as string;
      const { leadId } = req.params;
      const { assignedTo } = req.body;

      if (!tenantId) {
        return res.status(400).json({ error: 'Missing x-tenant-id header' });
      }

      if (!assignedTo) {
        return res.status(400).json({ error: 'Missing required field: assignedTo' });
      }

      const lead = await leadsService.assignLead(tenantId, leadId, assignedTo);

      logger.info('[Leads] Lead assigned', { tenantId, leadId, assignedTo });

      res.json({
        success: true,
        data: lead,
      });
    })
  );

  /**
   * GET /api/v1/leads/:leadId/activities
   * Get lead activities
   */
  router.get(
    '/:leadId/activities',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = req.headers['x-tenant-id'] as string;
      const { leadId } = req.params;
      const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 50, 1), 100);

      if (!tenantId) {
        return res.status(400).json({ error: 'Missing x-tenant-id header' });
      }

      // Verify lead belongs to tenant
      await leadsService.getLead(tenantId, leadId);

      const activities = await leadsService.getActivities(leadId, limit);

      res.json({
        success: true,
        data: activities,
        count: activities.length,
      });
    })
  );

  /**
   * POST /api/v1/leads/:leadId/activities
   * Add activity to lead
   */
  router.post(
    '/:leadId/activities',
    validate({ ...leadIdParamSchema, ...leadActivityBodySchema }),
    asyncHandler(async (req: any, res: any) => {
      const tenantId = req.headers['x-tenant-id'] as string;
      const { leadId } = req.params;
      const { type, description, metadata } = req.body;

      if (!tenantId) {
        return res.status(400).json({ error: 'Missing x-tenant-id header' });
      }

      if (!type || !description) {
        return res.status(400).json({ error: 'Missing required fields: type, description' });
      }

      // Verify lead belongs to tenant
      await leadsService.getLead(tenantId, leadId);

      const activity = await leadsService.addActivity(leadId, type, description, metadata);

      logger.info('[Leads] Activity added', { tenantId, leadId, type });

      res.json({
        success: true,
        data: activity,
      });
    })
  );

  /**
   * DELETE /api/v1/leads/:leadId
   * Delete lead
   */
  router.delete(
    '/:leadId',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = req.headers['x-tenant-id'] as string;
      const { leadId } = req.params;

      if (!tenantId) {
        return res.status(400).json({ error: 'Missing x-tenant-id header' });
      }

      await leadsService.deleteLead(tenantId, leadId);

      logger.info('[Leads] Lead deleted', { tenantId, leadId });

      res.json({
        success: true,
        message: 'Lead deleted',
      });
    })
  );

  /**
   * GET /api/v1/leads/routing-rules
   * Get routing rules
   */
  router.get(
    '/routing-rules',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = req.headers['x-tenant-id'] as string;

      if (!tenantId) {
        return res.status(400).json({ error: 'Missing x-tenant-id header' });
      }

      const rules = await leadsService.getRoutingRules(tenantId);

      res.json({
        success: true,
        data: rules,
      });
    })
  );

  /**
   * POST /api/v1/leads/routing-rules
   * Create routing rule
   */
  router.post(
    '/routing-rules',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = req.headers['x-tenant-id'] as string;
      const { name, type, teamMembers, conditions } = req.body;

      if (!tenantId) {
        return res.status(400).json({ error: 'Missing x-tenant-id header' });
      }

      if (!name || !type || !teamMembers) {
        return res.status(400).json({
          error: 'Missing required fields: name, type, teamMembers',
        });
      }

      const rule = await leadsService.createRoutingRule(
        tenantId,
        name,
        type,
        teamMembers,
        conditions
      );

      logger.info('[Leads] Routing rule created', { tenantId, ruleId: rule.id });

      res.json({
        success: true,
        data: rule,
      });
    })
  );

  /**
   * PATCH /api/v1/leads/:leadId/route
   * Route lead to team member
   */
  router.patch(
    '/:leadId/route',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = req.headers['x-tenant-id'] as string;
      const { leadId } = req.params;

      if (!tenantId) {
        return res.status(400).json({ error: 'Missing x-tenant-id header' });
      }

      const lead = await leadsService.routeLead(tenantId, leadId);

      logger.info('[Leads] Lead routed', {
        tenantId,
        leadId,
        assignedTo: lead.assignedTo,
      });

      res.json({
        success: true,
        data: lead,
      });
    })
  );

  return router;
}

