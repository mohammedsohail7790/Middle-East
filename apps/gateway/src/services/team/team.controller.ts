/**
 * Team Controller
 * API endpoints for team management
 */

import { teamService } from './team.service.js';
import { inviteTeamMember, linkTeamMemberFromAuth, syncTeamMemberEmail } from './team-invite.service.js';
import { verifySupabaseAuthOnly } from '../auth/jwt-tenant-verifier.js';
import { asyncHandler } from '../../middleware/index.js';
import { validate } from '../../middleware/validation.js';
import {
  teamCheckPermissionBodySchema,
  teamCreateBodySchema,
  teamInviteBodySchema,
  teamMemberIdParamSchema,
  teamSyncAuthBodySchema,
  teamUpdateBodySchema,
} from '../../security/validation-schemas.js';
import { voiceAuthUnlessPublic } from '../../middleware/voice-auth-unless-public.js';
import { getTenantId, type CallIqAuthenticatedRequest } from '../auth/tenant-context.js';
import { resolveUserRole, requirePermission } from '../enterprise/rbac.service.js';
import { logger } from '../logger.js';
import { Router } from 'express';

export function createTeamRouter(): Router {
  const router = Router();

  /**
   * POST /api/v1/team/sync-auth
   * Link invited / email-confirmed users to team_members (no tenant required yet).
   */
  router.post(
    '/sync-auth',
    validate(teamSyncAuthBodySchema),
    asyncHandler(async (req: any, res: any) => {
      const authHeader = String(req.headers.authorization || '');
      if (!authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const verified = await verifySupabaseAuthOnly(authHeader.slice(7));
      if ('error' in verified) {
        return res.status(verified.status).json({ success: false, error: verified.error });
      }

      const tenantId = await linkTeamMemberFromAuth(
        verified.userId,
        verified.email,
        undefined
      );

      if (verified.email) {
        await syncTeamMemberEmail(verified.userId, verified.email);
      }

      res.json({
        success: true,
        data: { tenantId, userId: verified.userId },
      });
    })
  );

  router.use(voiceAuthUnlessPublic);

  /**
   * POST /api/v1/team/invite
   * Sends Supabase "Invite user" email + creates team_members row.
   */
  router.post(
    '/invite',
    validate(teamInviteBodySchema),
    asyncHandler(async (req: any, res: any) => {
      const r = req as CallIqAuthenticatedRequest;
      const tenantId = getTenantId(req);
      const { email, name, role } = req.body;

      if (!tenantId) {
        return res.status(400).json({ success: false, error: 'Missing x-tenant-id header' });
      }

      const userRole = await resolveUserRole(tenantId, r.tenant?.userId);
      const perm = requirePermission(userRole, 'governance:write');
      if (!perm.ok) {
        return res.status(403).json({ success: false, error: perm.reason ?? 'Forbidden' });
      }

      if (!email || !name || !role) {
        return res.status(400).json({ success: false, error: 'Missing required fields: email, name, role' });
      }

      const roleMap: Record<string, string> = { manager: 'admin' };
      const resolvedRole = (roleMap[role] || role) as 'owner' | 'admin' | 'agent' | 'viewer';
      if (!['owner', 'admin', 'agent', 'viewer'].includes(resolvedRole)) {
        return res.status(400).json({ success: false, error: 'Invalid role. Use admin, agent, or viewer.' });
      }

      const result = await inviteTeamMember(tenantId, email, name, resolvedRole);
      logger.info('[Team] Invite sent', { tenantId, email, inviteSent: result.inviteSent });

      res.json({
        success: true,
        data: {
          member: result.member,
          inviteSent: result.inviteSent,
          message: result.message,
        },
      });
    })
  );

  /**
   * GET /api/v1/team
   * Get all team members
   */
  router.get(
    '/',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantId(req);

      if (!tenantId) {
        return res.status(400).json({ error: 'Missing x-tenant-id header' });
      }

      const members = await teamService.getTeamMembers(tenantId);

      res.json({
        success: true,
        data: members,
        count: members.length,
      });
    })
  );

  /**
   * GET /api/v1/team/stats
   * Get team statistics
   */
  router.get(
    '/stats',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantId(req);

      if (!tenantId) {
        return res.status(400).json({ error: 'Missing x-tenant-id header' });
      }

      const stats = await teamService.getTeamStats(tenantId);

      res.json({
        success: true,
        data: stats,
      });
    })
  );

  /**
   * GET /api/v1/team/:memberId
   * Get specific team member
   */
  router.get(
    '/:memberId',
    validate(teamMemberIdParamSchema),
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantId(req);
      const { memberId } = req.params;

      if (!tenantId) {
        return res.status(400).json({ error: 'Missing x-tenant-id header' });
      }

      const member = await teamService.getTeamMember(tenantId, memberId);

      res.json({
        success: true,
        data: member,
      });
    })
  );

  /**
   * POST /api/v1/team
   * Add team member
   */
  router.post(
    '/',
    validate(teamCreateBodySchema),
    asyncHandler(async (req: any, res: any) => {
      const r = req as CallIqAuthenticatedRequest;
      const tenantId = getTenantId(req);
      const { userId, email, name, role } = req.body;

      if (!tenantId) {
        return res.status(400).json({ error: 'Missing x-tenant-id header' });
      }

      const userRole = await resolveUserRole(tenantId, r.tenant?.userId);
      const perm = requirePermission(userRole, 'governance:write');
      if (!perm.ok) {
        return res.status(403).json({ success: false, error: perm.reason ?? 'Forbidden' });
      }

      if (!email || !name || !role) {
        return res.status(400).json({ error: 'Missing required fields: email, name, role' });
      }

      const resolvedUserId =
        (typeof userId === 'string' && userId.trim()) ||
        `invite:${String(email).toLowerCase().trim()}`;
      const roleMap: Record<string, string> = { manager: 'admin' };
      const resolvedRole = (roleMap[role] || role) as 'owner' | 'admin' | 'agent' | 'viewer';
      if (!['owner', 'admin', 'agent', 'viewer'].includes(resolvedRole)) {
        return res.status(400).json({ error: 'Invalid role. Use admin, agent, or viewer.' });
      }

      const member = await teamService.addTeamMember(
        tenantId,
        resolvedUserId,
        email,
        name,
        resolvedRole
      );

      logger.info('[Team] Member added', { tenantId, memberId: member.id });

      res.json({
        success: true,
        data: member,
      });
    })
  );

  /**
   * PUT /api/v1/team/:memberId
   * Update team member
   */
  router.put(
    '/:memberId',
    validate({ ...teamMemberIdParamSchema, ...teamUpdateBodySchema }),
    asyncHandler(async (req: any, res: any) => {
      const r = req as CallIqAuthenticatedRequest;
      const tenantId = getTenantId(req);
      const { memberId } = req.params;
      const { name, role, status } = req.body;

      if (!tenantId) {
        return res.status(400).json({ error: 'Missing x-tenant-id header' });
      }

      const userRole = await resolveUserRole(tenantId, r.tenant?.userId);
      const perm = requirePermission(userRole, 'governance:write');
      if (!perm.ok) {
        return res.status(403).json({ success: false, error: perm.reason ?? 'Forbidden' });
      }

      const member = await teamService.updateTeamMember(tenantId, memberId, {
        name,
        role,
        status,
      });

      logger.info('[Team] Member updated', { tenantId, memberId });

      res.json({
        success: true,
        data: member,
      });
    })
  );

  /**
   * DELETE /api/v1/team/:memberId
   * Remove team member
   */
  router.delete(
    '/:memberId',
    validate(teamMemberIdParamSchema),
    asyncHandler(async (req: any, res: any) => {
      const r = req as CallIqAuthenticatedRequest;
      const tenantId = getTenantId(req);
      const { memberId } = req.params;

      if (!tenantId) {
        return res.status(400).json({ error: 'Missing x-tenant-id header' });
      }

      const userRole = await resolveUserRole(tenantId, r.tenant?.userId);
      const perm = requirePermission(userRole, 'governance:write');
      if (!perm.ok) {
        return res.status(403).json({ success: false, error: perm.reason ?? 'Forbidden' });
      }

      await teamService.removeTeamMember(tenantId, memberId);

      logger.info('[Team] Member removed', { tenantId, memberId });

      res.json({
        success: true,
        message: 'Team member removed',
      });
    })
  );

  /**
   * POST /api/v1/team/check-permission
   * Check if user has permission
   */
  router.post(
    '/check-permission',
    validate(teamCheckPermissionBodySchema),
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantId(req);
      const { userId, permission } = req.body;

      if (!tenantId) {
        return res.status(400).json({ error: 'Missing x-tenant-id header' });
      }

      if (!userId || !permission) {
        return res.status(400).json({ error: 'Missing required fields: userId, permission' });
      }

      const hasPermission = await teamService.hasPermission(tenantId, userId, permission);

      res.json({
        success: true,
        data: { hasPermission },
      });
    })
  );

  return router;
}

