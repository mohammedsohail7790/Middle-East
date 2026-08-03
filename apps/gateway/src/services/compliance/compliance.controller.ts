import express from 'express';
import { asyncHandler } from '../../middleware/index.js';
import { requireTenant } from '../../middleware/require-tenant.js';
import { getTenantId, type CallIqAuthenticatedRequest } from '../auth/tenant-context.js';
import {
  getRetentionSummary,
  requestGdprExport,
  requestSecureDelete,
  redactPii,
} from './compliance.service.js';
import { resolveUserRole, requirePermission } from '../enterprise/rbac.service.js';
import { voiceDb } from '../voice/tenant-scope.js';

export function createComplianceRouter(): express.Router {
  const router = express.Router();
  router.use(requireTenant);

  router.get(
    '/retention',
    asyncHandler(async (req, res) => {
      const tenantId = getTenantId(req);
      res.json({ success: true, data: await getRetentionSummary(tenantId) });
    })
  );

  router.get(
    '/audit-events',
    asyncHandler(async (req, res) => {
      const r = req as CallIqAuthenticatedRequest;
      const tenantId = getTenantId(req);
      const role = await resolveUserRole(tenantId, r.tenant?.userId);
      if (!requirePermission(role, 'audit:read').ok) {
        return res.json({ success: true, data: [] });
      }
      const limit = Math.min(100, parseInt(String(req.query.limit || '50'), 10) || 50);
      try {
        const result = await voiceDb.query(
          `SELECT id, event_type, actor_id, resource_type, resource_id, payload, created_at
           FROM public.enterprise_audit_events
           WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2`,
          [tenantId, limit]
        );
        res.json({ success: true, data: result.rows });
      } catch {
        res.json({ success: true, data: [] });
      }
    })
  );

  router.post(
    '/gdpr-export',
    asyncHandler(async (req, res) => {
      const r = req as CallIqAuthenticatedRequest;
      const tenantId = getTenantId(req);
      const role = await resolveUserRole(tenantId, r.tenant?.userId);
      if (!requirePermission(role, 'audit:read').ok) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
      }
      res.json({
        success: true,
        data: await requestGdprExport(tenantId, r.tenant?.userId),
      });
    })
  );

  router.post(
    '/redact',
    asyncHandler(async (req, res) => {
      const text = String(req.body?.text || '');
      res.json({ success: true, data: { redacted: redactPii(text) } });
    })
  );

  router.post(
    '/secure-delete',
    asyncHandler(async (req, res) => {
      const r = req as CallIqAuthenticatedRequest;
      const tenantId = getTenantId(req);
      const { resourceType, resourceId } = req.body || {};
      res.json({
        success: true,
        data: await requestSecureDelete(
          tenantId,
          resourceType,
          resourceId,
          r.tenant?.userId
        ),
      });
    })
  );

  router.get(
    '/hipaa/status',
    asyncHandler(async (req, res) => {
      const tenantId = getTenantId(req);
      const { getHipaaStatus } = await import('./hipaa.service.js');
      res.json({ success: true, data: await getHipaaStatus(tenantId) });
    })
  );

  router.post(
    '/hipaa/sign-baa',
    asyncHandler(async (req, res) => {
      const tenantId = getTenantId(req);
      const { signBaa } = await import('./hipaa.service.js');
      const signedBy = String(req.body?.signedBy || req.body?.signedByEmail || 'Authorized signer');
      const signedByEmail = String(req.body?.signedByEmail || '');
      const signedByTitle = req.body?.signedByTitle ? String(req.body.signedByTitle) : undefined;
      const tenantName = req.body?.tenantName ? String(req.body.tenantName) : undefined;
      if (!signedByEmail) {
        return res.status(400).json({ success: false, error: 'signedByEmail is required' });
      }
      const data = await signBaa({
        tenantId,
        signedBy,
        signedByEmail,
        signedByTitle,
        tenantName,
        ipAddress: String(req.headers['x-forwarded-for'] || req.ip || ''),
      });
      res.json({ success: true, data });
    })
  );

  /**
   * GET /compliance/hipaa/baa-download
   * Returns a fresh 7-day signed download URL for the tenant's most recent signed BAA PDF.
   */
  router.get(
    '/hipaa/baa-download',
    asyncHandler(async (req, res) => {
      const tenantId = getTenantId(req);
      const row = await (await import('../voice/tenant-scope.js')).voiceDb.query(
        `SELECT document_url, signed_by, signed_by_email, signed_at, version
         FROM public.baa_agreements
         WHERE tenant_id = $1 ORDER BY signed_at DESC LIMIT 1`,
        [tenantId]
      );
      if (!row.rows.length) {
        return res.status(404).json({ success: false, error: 'No signed BAA found for this workspace' });
      }
      const record = row.rows[0] as {
        document_url: string;
        signed_by: string;
        signed_by_email: string;
        signed_at: string;
        version: string;
      };
      const rawUrl: string = record.document_url;
      if (!rawUrl?.startsWith('storage://')) {
        // Legacy baa:// pseudo-URL — document was never stored as a real file
        return res.status(410).json({
          success: false,
          error: 'BAA document was created before PDF generation was available. Please re-sign the BAA to generate a downloadable document.',
        });
      }
      const storagePath = rawUrl.replace('storage://', '');
      const { refreshBaaSignedUrl } = await import('./baa-pdf.service.js');
      const signedUrl = await refreshBaaSignedUrl(storagePath);
      res.json({
        success: true,
        data: {
          signedUrl,
          signedBy: record.signed_by,
          signedByEmail: record.signed_by_email,
          signedAt: record.signed_at,
          version: record.version,
          expiresIn: '7 days',
        },
      });
    })
  );

  router.post(
    '/hipaa/enable',
    asyncHandler(async (req, res) => {
      const tenantId = getTenantId(req);
      const { enableHipaaMode } = await import('./hipaa.service.js');
      await enableHipaaMode(tenantId);
      res.json({ success: true, message: 'HIPAA mode enabled' });
    })
  );

  router.post(
    '/hipaa/disable',
    asyncHandler(async (req, res) => {
      const tenantId = getTenantId(req);
      const { disableHipaaMode } = await import('./hipaa.service.js');
      await disableHipaaMode(tenantId);
      res.json({ success: true, message: 'HIPAA mode disabled' });
    })
  );

  return router;
}
