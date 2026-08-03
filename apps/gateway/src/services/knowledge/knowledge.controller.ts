import { validate } from '../../middleware/validation.js';
import {
  knowledgeFileIdParamSchema,
  knowledgeIngestTextSchema,
  knowledgeIngestUrlSchema,
  knowledgeTemplatesBodySchema,
  knowledgeUploadSchema,
} from '../../security/validation-schemas.js';
import {
  getKnowledgeTemplates,
  saveKnowledgeTemplates,
  syncKnowledgeTemplatesFromCurrentState,
  type KnowledgeTemplatesPayload,
} from './knowledge-templates.service.js';
import { requireVoiceApiAccess } from '../voice/security.js';
import { knowledgeService, KnowledgeCategory } from './knowledge.service.js';
import { knowledgeIngestionService } from './knowledge-ingestion.service.js';
import { knowledgeCache } from './knowledge.cache.js';
import { getKnowledgeTenantId } from './knowledge-tenant.js';
import { logger } from '../logger.js';
import { publishDashboardPushType } from '../dashboard/dashboard-events.js';
import {
  extractKnowledgeText,
  type KnowledgeUploadEncoding,
} from './knowledge-file-parser.js';
import express from 'express';

const VALID_CATEGORIES: KnowledgeCategory[] = [
  'hvac',
  'plumbing',
  'electrical',
  'general',
  'medical',
  'legal',
  'real_estate',
];

function normalizeCategory(category: unknown): KnowledgeCategory {
  const c = String(category || 'general').toLowerCase();
  return VALID_CATEGORIES.includes(c as KnowledgeCategory)
    ? (c as KnowledgeCategory)
    : 'general';
}

export function createKnowledgeRouter(): express.Router {
  const router = express.Router();

  router.use(requireVoiceApiAccess);

  /** Structured business templates (office hours, services, pricing). */
  router.get('/templates', async (req, res) => {
    try {
      const tenantId = getKnowledgeTenantId(req);
      if (!tenantId) {
        return res.status(400).json({ success: false, error: 'Tenant required' });
      }
      const data = await getKnowledgeTemplates(tenantId);
      res.json({ success: true, data });
    } catch (error) {
      logger.error('Failed to load knowledge templates', { error: String(error) });
      res.status(500).json({ success: false, error: 'Failed to load templates' });
    }
  });

  router.put('/templates', validate(knowledgeTemplatesBodySchema), async (req, res) => {
    try {
      const tenantId = getKnowledgeTenantId(req);
      if (!tenantId) {
        return res.status(400).json({ success: false, error: 'Tenant required' });
      }
      const body = req.body as KnowledgeTemplatesPayload;
      await saveKnowledgeTemplates(tenantId, body);
      const data = await getKnowledgeTemplates(tenantId);
      res.json({ success: true, data });
    } catch (error) {
      logger.error('Failed to save knowledge templates', { error: String(error) });
      const msg = error instanceof Error ? error.message : 'Failed to save templates';
      res.status(500).json({ success: false, error: msg });
    }
  });

  /** Rebuild template RAG chunks from business_hours + ai-config + pricing metadata. */
  router.post('/templates/sync', async (req, res) => {
    try {
      const tenantId = getKnowledgeTenantId(req);
      if (!tenantId) {
        return res.status(400).json({ success: false, error: 'Tenant required' });
      }
      const hoursNote =
        typeof req.body?.hoursNote === 'string' ? req.body.hoursNote.trim() : undefined;
      await syncKnowledgeTemplatesFromCurrentState(tenantId, { hoursNote });
      const data = await getKnowledgeTemplates(tenantId);
      res.json({ success: true, data });
    } catch (error) {
      logger.error('Failed to sync knowledge templates', { error: String(error) });
      const msg = error instanceof Error ? error.message : 'Failed to sync templates';
      res.status(500).json({ success: false, error: msg });
    }
  });

  router.get('/', async (req, res) => {
    try {
      const tenantId = getKnowledgeTenantId(req);
      if (!tenantId) {
        return res.status(400).json({ success: false, error: 'Tenant required' });
      }

      const knowledge = await knowledgeService.listKnowledge(tenantId);
      res.json({ success: true, data: knowledge });
    } catch (error) {
      logger.error('Failed to list knowledge', { error: String(error) });
      res.status(500).json({ success: false, error: 'Failed to load knowledge' });
    }
  });

  router.post('/', validate(knowledgeIngestTextSchema), async (req, res) => {
    try {
      const tenantId = getKnowledgeTenantId(req);
      if (!tenantId) {
        return res.status(400).json({ success: false, error: 'Tenant required' });
      }

      const { text, category } = req.body;
      if (!text || typeof text !== 'string') {
        return res.status(400).json({ success: false, error: 'Invalid text payload' });
      }

      const validCategory = normalizeCategory(category);
      await knowledgeService.ingestText(text, validCategory, tenantId);
      await knowledgeCache.invalidate(tenantId, validCategory);
      publishDashboardPushType(tenantId, 'knowledge.updated', [], { category: validCategory });
      res.json({ success: true });
    } catch (error) {
      logger.error('Failed to ingest knowledge', { error: String(error) });
      const msg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: msg || 'Failed to ingest knowledge' });
    }
  });

  router.post('/ingest-url', validate(knowledgeIngestUrlSchema), async (req, res) => {
    try {
      const tenantId = getKnowledgeTenantId(req);
      if (!tenantId) {
        return res.status(400).json({ success: false, error: 'Tenant required' });
      }

      const { url, category } = req.body;
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ success: false, error: 'URL required' });
      }

      const validCategory = normalizeCategory(category);
      const fileId = await knowledgeIngestionService.ingestWebsite(
        url,
        tenantId,
        validCategory
      );
      await knowledgeCache.invalidate(tenantId);
      publishDashboardPushType(tenantId, 'knowledge.updated', [], { url });

      res.json({ success: true, data: { fileId, status: 'processing' } });
    } catch (error) {
      logger.error('Failed to ingest website', { error: String(error) });
      const msg = error instanceof Error ? error.message : String(error);
      const status =
        /invalid url|url required|not allowed|only http/i.test(msg) ? 400 : 500;
      res.status(status).json({
        success: false,
        error: msg || 'Failed to import website',
      });
    }
  });

  router.post('/upload', validate(knowledgeUploadSchema), async (req, res) => {
    try {
      const tenantId = getKnowledgeTenantId(req);
      if (!tenantId) {
        return res.status(400).json({ success: false, error: 'Tenant required' });
      }

      const { fileName, content, fileType, category, encoding } = req.body;
      if (!fileName || typeof fileName !== 'string') {
        return res.status(400).json({ success: false, error: 'fileName required' });
      }
      if (!content || typeof content !== 'string') {
        return res.status(400).json({ success: false, error: 'content required' });
      }

      const uploadEncoding: KnowledgeUploadEncoding =
        encoding === 'base64' ? 'base64' : 'utf8';

      const ext = fileName.split('.').pop()?.toLowerCase() || 'txt';
      let normalizedType = String(fileType || ext).toLowerCase();
      if (normalizedType === 'md') normalizedType = 'txt';
      const validTypes = ['pdf', 'docx', 'txt', 'csv', 'text'];
      if (!validTypes.includes(normalizedType)) {
        normalizedType = 'txt';
      }

      let plainText: string;
      try {
        plainText = await extractKnowledgeText(
          fileName,
          normalizedType,
          content,
          uploadEncoding
        );
      } catch (parseErr) {
        const msg = parseErr instanceof Error ? parseErr.message : 'Could not read file';
        return res.status(400).json({ success: false, error: msg });
      }

      if (!plainText.trim()) {
        return res.status(400).json({ success: false, error: 'File is empty' });
      }

      const maxChars = Number(process.env.KNOWLEDGE_UPLOAD_MAX_CHARS || 500_000);
      if (plainText.length > maxChars) {
        return res.status(400).json({
          success: false,
          error: `File too large (max ${maxChars} characters). Split into smaller files.`,
        });
      }

      const validCategory = normalizeCategory(category);
      const ingestType =
        normalizedType === 'pdf' || normalizedType === 'docx'
          ? normalizedType
          : (normalizedType as 'txt' | 'csv' | 'text');

      try {
        const fileId = await knowledgeIngestionService.ingestFile(
          tenantId,
          fileName,
          ingestType,
          plainText,
          validCategory
        );
        await knowledgeCache.invalidate(tenantId);
        publishDashboardPushType(tenantId, 'knowledge.updated', [], { fileName, fileId });
        return res.json({ success: true, data: { fileId, status: 'processing' } });
      } catch (fileErr) {
        logger.warn('Knowledge file pipeline failed, using direct ingest', {
          error: String(fileErr),
        });
        await knowledgeService.ingestText(plainText, validCategory, tenantId);
        await knowledgeCache.invalidate(tenantId, validCategory);
        publishDashboardPushType(tenantId, 'knowledge.updated', [], { fileName });
        return res.json({ success: true, data: { status: 'ingested' } });
      }
    } catch (error) {
      logger.error('Failed to upload knowledge file', { error: String(error) });
      const msg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: msg || 'Failed to upload file' });
    }
  });

  router.get('/files', async (req, res) => {
    try {
      const tenantId = getKnowledgeTenantId(req);
      if (!tenantId) {
        return res.status(400).json({ success: false, error: 'Tenant required' });
      }

      const files = await knowledgeIngestionService.listFiles(tenantId);
      res.json({ success: true, data: files });
    } catch (error) {
      logger.error('Failed to list knowledge files', { error: String(error) });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  router.get('/files/:id', validate(knowledgeFileIdParamSchema), async (req, res) => {
    try {
      const tenantId = getKnowledgeTenantId(req);
      if (!tenantId) {
        return res.status(400).json({ success: false, error: 'Tenant required' });
      }

      const file = await knowledgeIngestionService.getFileStatus(req.params.id);
      if (!file || file.tenantId !== tenantId) {
        return res.status(404).json({ success: false, error: 'File not found' });
      }

      res.json({ success: true, data: file });
    } catch (error) {
      logger.error('Failed to get file status', { error: String(error) });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  router.post('/files/:id/reprocess', validate(knowledgeFileIdParamSchema), async (req, res) => {
    try {
      const tenantId = getKnowledgeTenantId(req);
      if (!tenantId) {
        return res.status(400).json({ success: false, error: 'Tenant required' });
      }

      const result = await knowledgeIngestionService.reprocessFile(req.params.id, tenantId);
      if (!result) return res.status(404).json({ success: false, error: 'File not found' });

      await knowledgeCache.invalidate(tenantId);
      publishDashboardPushType(tenantId, 'knowledge.updated', [], { fileId: req.params.id, reprocess: true });
      res.json({ success: true });
    } catch (error) {
      logger.error('Failed to reprocess file', { error: String(error) });
      res.status(500).json({ success: false, error: 'Failed to reprocess file' });
    }
  });

  router.delete('/:id', async (req, res) => {
    try {
      const tenantId = getKnowledgeTenantId(req);
      if (!tenantId) {
        return res.status(400).json({ success: false, error: 'Tenant required' });
      }

      const deleted = await knowledgeService.deleteKnowledge(req.params.id, tenantId);
      if (deleted) {
        await knowledgeCache.invalidate(tenantId);
        publishDashboardPushType(tenantId, 'knowledge.updated', [], { id: req.params.id, deleted: true });
      }
      res.json({ success: deleted });
    } catch (error) {
      logger.error('Failed to delete knowledge', { error: String(error) });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  router.delete('/files/:id', async (req, res) => {
    try {
      const tenantId = getKnowledgeTenantId(req);
      if (!tenantId) {
        return res.status(400).json({ success: false, error: 'Tenant required' });
      }

      const deleted = await knowledgeIngestionService.deleteFile(req.params.id, tenantId);
      if (deleted) {
        await knowledgeCache.invalidate(tenantId);
        publishDashboardPushType(tenantId, 'knowledge.updated', [], { fileId: req.params.id, deleted: true });
      }
      res.json({ success: deleted });
    } catch (error) {
      logger.error('Failed to delete knowledge file', { error: String(error) });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  router.get('/cache/stats', async (_req, res) => {
    try {
      const stats = await knowledgeCache.getStats();
      res.json({ success: true, data: stats });
    } catch (error) {
      logger.error('Failed to get cache stats', { error: String(error) });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  return router;
}
