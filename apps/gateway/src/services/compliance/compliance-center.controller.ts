/**
 * Compliance Center Controller
 * REST API for per-tenant compliance settings.
 *
 * Routes (all under /api/v1/compliance/center):
 *   GET  /                  — get current settings
 *   PUT  /                  — save settings (partial patch)
 *   GET  /industry-profiles — list all profiles with their defaults
 *   POST /apply-profile     — reset to an industry profile's defaults
 */

import express from 'express';
import { asyncHandler } from '../../middleware/index.js';
import { requireTenant } from '../../middleware/require-tenant.js';
import { getTenantId, type CallIqAuthenticatedRequest } from '../auth/tenant-context.js';
import { complianceCenterService, type IndustryProfile } from './compliance-center.service.js';
import { resolveUserRole, requirePermission } from '../enterprise/rbac.service.js';

// Healthcare and Legal are not launch verticals (HIPAA/BAA and privilege
// obligations need dedicated evaluation) — only these two are selectable.
const VALID_PROFILES = new Set<IndustryProfile>(['real_estate', 'general']);

export function createComplianceCenterRouter(): express.Router {
  const router = express.Router();
  router.use(requireTenant);

  // ── GET /compliance/center ──────────────────────────────────────────────────
  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const tenantId = getTenantId(req);
      const settings = await complianceCenterService.getSettings(tenantId);
      const profiles = complianceCenterService.getIndustryProfiles();
      res.json({ success: true, data: { settings, profiles } });
    })
  );

  // ── PUT /compliance/center ──────────────────────────────────────────────────
  router.put(
    '/',
    asyncHandler(async (req, res) => {
      const r = req as CallIqAuthenticatedRequest;
      const tenantId = getTenantId(req);

      // Require governance:write permission
      const role = await resolveUserRole(tenantId, r.tenant?.userId);
      const perm = requirePermission(role, 'governance:write');
      if (!perm.ok) {
        return res.status(403).json({ success: false, error: perm.reason ?? 'Forbidden' });
      }

      const body = req.body as Record<string, unknown>;
      const patch: Record<string, unknown> = {};

      if (typeof body.aiDisclosureEnabled === 'boolean')
        patch.aiDisclosureEnabled = body.aiDisclosureEnabled;
      if (typeof body.aiDisclosureMessage === 'string')
        patch.aiDisclosureMessage = body.aiDisclosureMessage.trim().slice(0, 500);

      if (typeof body.recordingEnabled === 'boolean')
        patch.recordingEnabled = body.recordingEnabled;

      if (typeof body.recordingAnnouncementEnabled === 'boolean')
        patch.recordingAnnouncementEnabled = body.recordingAnnouncementEnabled;
      if (typeof body.recordingAnnouncementMessage === 'string')
        patch.recordingAnnouncementMessage = body.recordingAnnouncementMessage.trim().slice(0, 500);

      if (typeof body.consentRequired === 'boolean')
        patch.consentRequired = body.consentRequired;
      if (typeof body.consentMessage === 'string')
        patch.consentMessage = body.consentMessage.trim().slice(0, 500);

      if (typeof body.consentOffersRecordingChoice === 'boolean')
        patch.consentOffersRecordingChoice = body.consentOffersRecordingChoice;
      if (typeof body.consentRecordingChoiceMessage === 'string')
        patch.consentRecordingChoiceMessage = body.consentRecordingChoiceMessage.trim().slice(0, 500);

      if (body.dataRetentionDays === null) {
        patch.dataRetentionDays = null;
      } else if (typeof body.dataRetentionDays === 'number' && body.dataRetentionDays > 0) {
        patch.dataRetentionDays = Math.floor(body.dataRetentionDays);
      }

      if (
        typeof body.industryProfile === 'string' &&
        VALID_PROFILES.has(body.industryProfile as IndustryProfile)
      ) {
        patch.industryProfile = body.industryProfile as IndustryProfile;
      }

      const settings = await complianceCenterService.upsertSettings(
        tenantId,
        patch,
        r.tenant?.userId
      );

      const { publishDashboardPushType } = await import('../dashboard/dashboard-events.js');
      publishDashboardPushType(tenantId, 'config.updated');

      res.json({ success: true, data: settings });
    })
  );

  // ── GET /compliance/center/industry-profiles ────────────────────────────────
  router.get(
    '/industry-profiles',
    asyncHandler(async (_req, res) => {
      res.json({
        success: true,
        data: complianceCenterService.getIndustryProfiles(),
      });
    })
  );

  // ── POST /compliance/center/apply-profile ───────────────────────────────────
  router.post(
    '/apply-profile',
    asyncHandler(async (req, res) => {
      const r = req as CallIqAuthenticatedRequest;
      const tenantId = getTenantId(req);

      const role = await resolveUserRole(tenantId, r.tenant?.userId);
      const perm = requirePermission(role, 'governance:write');
      if (!perm.ok) {
        return res.status(403).json({ success: false, error: perm.reason ?? 'Forbidden' });
      }

      const profile = req.body?.profile as string;
      if (!profile || !VALID_PROFILES.has(profile as IndustryProfile)) {
        return res.status(400).json({
          success: false,
          error: `Invalid profile. Must be one of: ${[...VALID_PROFILES].join(', ')}`,
        });
      }

      const settings = await complianceCenterService.applyIndustryProfile(
        tenantId,
        profile as IndustryProfile,
        r.tenant?.userId
      );

      const { publishDashboardPushType } = await import('../dashboard/dashboard-events.js');
      publishDashboardPushType(tenantId, 'config.updated');

      res.json({ success: true, data: settings });
    })
  );

  return router;
}
