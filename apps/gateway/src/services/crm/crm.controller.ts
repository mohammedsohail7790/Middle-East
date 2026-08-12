/**
 * CRM Controller
 * API endpoints for the GCC skeleton CRM (pipeline, companies, contacts, deals).
 */

import { Router } from 'express';
import { crmService } from './crm.service.js';
import { asyncHandler } from '../../middleware/index.js';
import { validate } from '../../middleware/validation.js';
import { voiceAuthUnlessPublic } from '../../middleware/voice-auth-unless-public.js';
import {
  crmStageCreateBodySchema,
  crmStageUpdateBodySchema,
  crmCompanyCreateBodySchema,
  crmCompanyUpdateBodySchema,
  crmContactCreateBodySchema,
  crmContactUpdateBodySchema,
  crmDealCreateBodySchema,
  crmDealUpdateBodySchema,
  crmIdParamSchema,
} from '../../security/validation-schemas.js';

function tenantOf(req: any): string | null {
  return (req.headers['x-tenant-id'] as string) || null;
}

export function createCrmRouter(): Router {
  const router = Router();
  router.use(voiceAuthUnlessPublic);

  // ---- Pipeline stages ----

  router.get(
    '/stages',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = tenantOf(req);
      if (!tenantId) return res.status(400).json({ error: 'Missing x-tenant-id header' });
      const stages = await crmService.listStages(tenantId);
      res.json({ success: true, data: stages, count: stages.length });
    })
  );

  router.post(
    '/stages',
    validate(crmStageCreateBodySchema),
    asyncHandler(async (req: any, res: any) => {
      const tenantId = tenantOf(req);
      if (!tenantId) return res.status(400).json({ error: 'Missing x-tenant-id header' });
      const stage = await crmService.createStage(tenantId, req.body.name, req.body.position);
      res.json({ success: true, data: stage });
    })
  );

  router.patch(
    '/stages/:id',
    validate(crmStageUpdateBodySchema),
    asyncHandler(async (req: any, res: any) => {
      const tenantId = tenantOf(req);
      if (!tenantId) return res.status(400).json({ error: 'Missing x-tenant-id header' });
      const stage = await crmService.updateStage(tenantId, req.params.id, req.body);
      if (!stage) return res.status(404).json({ error: 'Stage not found' });
      res.json({ success: true, data: stage });
    })
  );

  router.delete(
    '/stages/:id',
    validate(crmIdParamSchema),
    asyncHandler(async (req: any, res: any) => {
      const tenantId = tenantOf(req);
      if (!tenantId) return res.status(400).json({ error: 'Missing x-tenant-id header' });
      const deleted = await crmService.deleteStage(tenantId, req.params.id);
      if (!deleted) return res.status(404).json({ error: 'Stage not found' });
      res.json({ success: true, message: 'Stage deleted' });
    })
  );

  // ---- Companies ----

  router.get(
    '/companies',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = tenantOf(req);
      if (!tenantId) return res.status(400).json({ error: 'Missing x-tenant-id header' });
      const companies = await crmService.listCompanies(tenantId);
      res.json({ success: true, data: companies, count: companies.length });
    })
  );

  router.post(
    '/companies',
    validate(crmCompanyCreateBodySchema),
    asyncHandler(async (req: any, res: any) => {
      const tenantId = tenantOf(req);
      if (!tenantId) return res.status(400).json({ error: 'Missing x-tenant-id header' });
      const company = await crmService.createCompany(tenantId, req.body);
      res.json({ success: true, data: company });
    })
  );

  router.patch(
    '/companies/:id',
    validate(crmCompanyUpdateBodySchema),
    asyncHandler(async (req: any, res: any) => {
      const tenantId = tenantOf(req);
      if (!tenantId) return res.status(400).json({ error: 'Missing x-tenant-id header' });
      const company = await crmService.updateCompany(tenantId, req.params.id, req.body);
      if (!company) return res.status(404).json({ error: 'Company not found' });
      res.json({ success: true, data: company });
    })
  );

  router.delete(
    '/companies/:id',
    validate(crmIdParamSchema),
    asyncHandler(async (req: any, res: any) => {
      const tenantId = tenantOf(req);
      if (!tenantId) return res.status(400).json({ error: 'Missing x-tenant-id header' });
      const deleted = await crmService.deleteCompany(tenantId, req.params.id);
      if (!deleted) return res.status(404).json({ error: 'Company not found' });
      res.json({ success: true, message: 'Company deleted' });
    })
  );

  // ---- Contacts ----

  router.get(
    '/contacts',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = tenantOf(req);
      if (!tenantId) return res.status(400).json({ error: 'Missing x-tenant-id header' });
      const contacts = await crmService.listContacts(tenantId);
      res.json({ success: true, data: contacts, count: contacts.length });
    })
  );

  router.post(
    '/contacts',
    validate(crmContactCreateBodySchema),
    asyncHandler(async (req: any, res: any) => {
      const tenantId = tenantOf(req);
      if (!tenantId) return res.status(400).json({ error: 'Missing x-tenant-id header' });
      const contact = await crmService.createContact(tenantId, req.body);
      res.json({ success: true, data: contact });
    })
  );

  router.patch(
    '/contacts/:id',
    validate(crmContactUpdateBodySchema),
    asyncHandler(async (req: any, res: any) => {
      const tenantId = tenantOf(req);
      if (!tenantId) return res.status(400).json({ error: 'Missing x-tenant-id header' });
      const contact = await crmService.updateContact(tenantId, req.params.id, req.body);
      if (!contact) return res.status(404).json({ error: 'Contact not found' });
      res.json({ success: true, data: contact });
    })
  );

  router.delete(
    '/contacts/:id',
    validate(crmIdParamSchema),
    asyncHandler(async (req: any, res: any) => {
      const tenantId = tenantOf(req);
      if (!tenantId) return res.status(400).json({ error: 'Missing x-tenant-id header' });
      const deleted = await crmService.deleteContact(tenantId, req.params.id);
      if (!deleted) return res.status(404).json({ error: 'Contact not found' });
      res.json({ success: true, message: 'Contact deleted' });
    })
  );

  // ---- Deals ----

  router.get(
    '/deals',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = tenantOf(req);
      if (!tenantId) return res.status(400).json({ error: 'Missing x-tenant-id header' });
      const deals = await crmService.listDeals(tenantId);
      res.json({ success: true, data: deals, count: deals.length });
    })
  );

  router.post(
    '/deals',
    validate(crmDealCreateBodySchema),
    asyncHandler(async (req: any, res: any) => {
      const tenantId = tenantOf(req);
      if (!tenantId) return res.status(400).json({ error: 'Missing x-tenant-id header' });
      const deal = await crmService.createDeal(tenantId, req.body);
      res.json({ success: true, data: deal });
    })
  );

  router.patch(
    '/deals/:id',
    validate(crmDealUpdateBodySchema),
    asyncHandler(async (req: any, res: any) => {
      const tenantId = tenantOf(req);
      if (!tenantId) return res.status(400).json({ error: 'Missing x-tenant-id header' });
      const deal = await crmService.updateDeal(tenantId, req.params.id, req.body);
      if (!deal) return res.status(404).json({ error: 'Deal not found' });
      res.json({ success: true, data: deal });
    })
  );

  router.delete(
    '/deals/:id',
    validate(crmIdParamSchema),
    asyncHandler(async (req: any, res: any) => {
      const tenantId = tenantOf(req);
      if (!tenantId) return res.status(400).json({ error: 'Missing x-tenant-id header' });
      const deleted = await crmService.deleteDeal(tenantId, req.params.id);
      if (!deleted) return res.status(404).json({ error: 'Deal not found' });
      res.json({ success: true, message: 'Deal deleted' });
    })
  );

  return router;
}
