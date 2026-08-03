import { getSupabaseAdmin } from '../auth/supabase-admin.js';
import { getDashboardBaseUrl } from '../integrations/oauth-redirect.js';
import { publishDashboardPushType } from '../dashboard/dashboard-events.js';
import { logger } from '../logger.js';
import { voiceDb } from '../voice/tenant-scope.js';
import type { TeamMember } from './team.service.js';
import { teamService } from './team.service.js';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Send Supabase invite email (uses "Invite user" template) and ensure team_members row exists.
 */
export async function inviteTeamMember(
  tenantId: string,
  email: string,
  name: string,
  role: TeamMember['role']
): Promise<{ member: TeamMember; inviteSent: boolean; message: string }> {
  const normalizedEmail = normalizeEmail(email);
  const redirectTo = `${getDashboardBaseUrl()}/auth/callback?next=${encodeURIComponent('/dashboard')}`;

  const existing = await voiceDb.query(
    `SELECT id FROM public.team_members
     WHERE tenant_id = $1 AND lower(trim(email)) = $2
     LIMIT 1`,
    [tenantId, normalizedEmail]
  );

  let member: TeamMember;
  if (existing.rows.length > 0) {
    const updated = await teamService.updateTeamMember(tenantId, String(existing.rows[0].id), {
      name,
      role,
      status: 'active',
    });
    member = updated;
  } else {
    member = await teamService.addTeamMember(
      tenantId,
      `invite:${normalizedEmail}`,
      normalizedEmail,
      name,
      role
    );
  }

  const supabase = getSupabaseAdmin();
  let inviteSent = false;
  let message = 'Team member added.';

  try {
    const { error } = await supabase.auth.admin.inviteUserByEmail(normalizedEmail, {
      redirectTo,
      data: {
        tenant_id: tenantId,
        full_name: name,
        team_role: role,
        invited_to_call_iq: true,
      },
    });

    if (error) {
      const msg = error.message || String(error);
      if (/already|registered|exists/i.test(msg)) {
        message =
          'This email already has a Call IQ account — they can sign in and will be linked to your workspace.';
        logger.info('[Team] Invite skipped — user already exists', {
          tenantId,
          email: normalizedEmail,
        });
      } else {
        throw error;
      }
    } else {
      inviteSent = true;
      message = 'Invitation email sent from Call IQ.';
    }
  } catch (err) {
    logger.error('[Team] Supabase invite failed', { tenantId, email: normalizedEmail, error: String(err) });
    throw new Error(
      'Could not send invitation email. In Supabase, enable Invite user template + custom SMTP (sender: Call IQ).'
    );
  }

  publishDashboardPushType(tenantId, 'team.updated', ['settings']);
  return { member, inviteSent, message };
}

/**
 * After invite accept, magic link, or email change — link auth user to team_members + tenant metadata.
 */
export async function linkTeamMemberFromAuth(
  userId: string,
  email?: string,
  tenantIdHint?: string
): Promise<string | null> {
  if (!userId) return null;

  const emailNorm = email ? normalizeEmail(email) : undefined;
  let tenantId: string | undefined;

  // Pending invite by email wins over JWT metadata (existing user invited to another workspace)
  if (emailNorm) {
    const byEmail = await voiceDb.query(
      `SELECT tenant_id FROM public.team_members
       WHERE lower(trim(email)) = $1
       ORDER BY CASE WHEN user_id::text LIKE 'invite:%' THEN 0 ELSE 1 END, created_at DESC
       LIMIT 1`,
      [emailNorm]
    );
    tenantId = (byEmail.rows[0] as { tenant_id?: string } | undefined)?.tenant_id;
  }

  if (!tenantId) {
    tenantId = tenantIdHint?.trim() || undefined;
  }

  if (!tenantId) {
    const byUser = await voiceDb.query(
      `SELECT tenant_id FROM public.team_members
       WHERE user_id = $1 AND is_active = true
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );
    tenantId = (byUser.rows[0] as { tenant_id?: string } | undefined)?.tenant_id;
  }

  if (!tenantId) return null;

  if (emailNorm) {
    await voiceDb.query(
      `UPDATE public.team_members
       SET user_id = $1,
           email = $2,
           is_active = true,
           updated_at = NOW()
       WHERE tenant_id = $3
         AND (
           user_id = $1
           OR lower(trim(email)) = $2
           OR user_id::text LIKE 'invite:%'
         )`,
      [userId, emailNorm, tenantId]
    );
  } else {
    await voiceDb.query(
      `UPDATE public.team_members
       SET user_id = $1, is_active = true, updated_at = NOW()
       WHERE tenant_id = $2 AND (user_id = $1 OR user_id::text LIKE 'invite:%')`,
      [userId, tenantId]
    );
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase.auth.admin.getUserById(userId);
    const meta = (data.user?.user_metadata || {}) as Record<string, unknown>;
    if (meta.tenant_id !== tenantId) {
      await supabase.auth.admin.updateUserById(userId, {
        user_metadata: { ...meta, tenant_id: tenantId },
      });
    }
  } catch (err) {
    logger.warn('[Team] Could not sync tenant_id to user metadata', { userId, error: String(err) });
  }

  publishDashboardPushType(tenantId, 'team.updated', ['settings']);
  return tenantId;
}

/** Keep team_members.email in sync after Supabase email change confirmation. */
export async function syncTeamMemberEmail(userId: string, newEmail: string): Promise<void> {
  const emailNorm = normalizeEmail(newEmail);
  const result = await voiceDb.query(
    `UPDATE public.team_members
     SET email = $2, updated_at = NOW()
     WHERE user_id = $1
     RETURNING tenant_id`,
    [userId, emailNorm]
  );
  const tenantId = (result.rows[0] as { tenant_id?: string } | undefined)?.tenant_id;
  if (tenantId) {
    publishDashboardPushType(String(tenantId), 'team.updated', ['settings']);
  }
}
