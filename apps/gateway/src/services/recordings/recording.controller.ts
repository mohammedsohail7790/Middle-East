/**
 * Recording Controller
 * API endpoints for call recordings and transcripts
 * Call recordings require a Professional plan or higher.
 */

import { recordingService } from './recording.service.js';
import { requireProfessionalOrHigher } from '../../middleware/plan-gating.js';
import { requireVoiceApiAccess } from '../voice/security.js';
import { getTenantContext } from '../auth/tenant-context.js';
import { Router } from 'express';
import { clientErrorMessage } from '../../security/safe-error.js';

const router = Router();
router.use(requireVoiceApiAccess);

/** Verified tenant from the authenticated JWT/internal-key context, not the raw header. */
async function requireTenant(req: any, res: any): Promise<string | null> {
  const tenantId = getTenantContext(req)?.id;
  if (!tenantId) {
    res.status(400).json({ success: false, error: 'Tenant ID required' });
    return null;
  }
  return tenantId;
}

/**
 * GET /api/v1/recordings/:callId
 * Get recording details for a specific call (Enterprise only)
 */
router.get('/:callId', requireProfessionalOrHigher(), async (req: any, res: any) => {
  try {
    const tenantId = await requireTenant(req, res);
    if (!tenantId) return;

    const recording = await recordingService.getRecording(req.params.callId, tenantId);
    if (!recording) {
      return res.status(404).json({ success: false, error: 'Recording not found' });
    }
    res.json({ success: true, data: recording });
  } catch (error: any) {
    console.error('[Recording API] Error getting recording:', error);
    res.status(500).json({ success: false, error: clientErrorMessage(error, 'Failed to get recording') });
  }
});

/**
 * GET /api/v1/recordings
 * Get recent calls with recordings/transcripts (Enterprise only)
 */
router.get('/', requireProfessionalOrHigher(), async (req: any, res: any) => {
  try {
    const tenantId = await requireTenant(req, res);
    if (!tenantId) return;

    const recordings = await recordingService.getRecentCallsWithTranscripts(
      tenantId,
      Math.min(Math.max(parseInt(String(req.query.limit || '50'), 10) || 50, 1), 100)
    );
    res.json({ success: true, data: recordings });
  } catch (error: any) {
    console.error('[Recording API] Error getting recordings:', error);
    res.status(500).json({ success: false, error: clientErrorMessage(error, 'Failed to get recordings') });
  }
});

/**
 * POST /api/v1/recordings/search
 * Search transcripts (Enterprise only)
 */
router.post('/search', requireProfessionalOrHigher(), async (req: any, res: any) => {
  try {
    const tenantId = await requireTenant(req, res);
    if (!tenantId) return;

    if (!req.body.query) {
      return res.status(400).json({ success: false, error: 'Search query required' });
    }

    const results = await recordingService.searchTranscripts(
      tenantId,
      req.body.query,
      req.body.limit || 20
    );
    res.json({ success: true, data: results });
  } catch (error: any) {
    console.error('[Recording API] Error searching transcripts:', error);
    res.status(500).json({ success: false, error: clientErrorMessage(error, 'Failed to search transcripts') });
  }
});

/**
 * POST /api/v1/recordings/:callId/tags
 * Add tags to a call (Enterprise only)
 */
router.post('/:callId/tags', requireProfessionalOrHigher(), async (req: any, res: any) => {
  try {
    const tenantId = await requireTenant(req, res);
    if (!tenantId) return;

    const incoming: string[] = Array.isArray(req.body.tags)
      ? req.body.tags
      : typeof req.body.tag === 'string' && req.body.tag.trim()
        ? [req.body.tag.trim()]
        : [];

    if (!incoming.length) {
      return res.status(400).json({ success: false, error: 'Provide tag or tags array' });
    }

    await recordingService.addCallTags(req.params.callId, incoming, tenantId);
    res.json({ success: true, message: 'Tags added successfully' });
  } catch (error: any) {
    console.error('[Recording API] Error adding tags:', error);
    res.status(500).json({ success: false, error: clientErrorMessage(error, 'Failed to add tags') });
  }
});

/**
 * POST /api/v1/recordings/:callId/disposition
 * Set call disposition (Enterprise only)
 */
router.post('/:callId/disposition', requireProfessionalOrHigher(), async (req: any, res: any) => {
  try {
    const tenantId = await requireTenant(req, res);
    if (!tenantId) return;

    if (!req.body.disposition) {
      return res.status(400).json({ success: false, error: 'Disposition required' });
    }

    await recordingService.setCallDisposition(req.params.callId, req.body.disposition, req.body.notes, tenantId);
    res.json({ success: true, message: 'Disposition set successfully' });
  } catch (error: any) {
    console.error('[Recording API] Error setting disposition:', error);
    res.status(500).json({ success: false, error: clientErrorMessage(error, 'Failed to set disposition') });
  }
});

/**
 * DELETE /api/v1/recordings/:callId/tags/:tag
 */
router.delete('/:callId/tags/:tag', requireProfessionalOrHigher(), async (req: any, res: any) => {
  try {
    const tenantId = await requireTenant(req, res);
    if (!tenantId) return;

    await recordingService.removeCallTag(req.params.callId, decodeURIComponent(req.params.tag), tenantId);
    res.json({ success: true, message: 'Tag removed' });
  } catch (error: any) {
    console.error('[Recording API] Error removing tag:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to remove tag' });
  }
});

/**
 * DELETE /api/v1/recordings/:callId
 * Delete recording — GDPR compliance (Enterprise only)
 */
router.delete('/:callId', requireProfessionalOrHigher(), async (req: any, res: any) => {
  try {
    const tenantId = await requireTenant(req, res);
    if (!tenantId) return;

    await recordingService.deleteRecording(req.params.callId, tenantId);
    res.json({ success: true, message: 'Recording deleted successfully' });
  } catch (error: any) {
    console.error('[Recording API] Error deleting recording:', error);
    res.status(500).json({ success: false, error: clientErrorMessage(error, 'Failed to delete recording') });
  }
});

export function createRecordingRouter(): Router {
  return router;
}

