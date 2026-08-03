import { getSupabaseAdmin } from './supabase-admin.js';
import { voiceDb } from '../voice/tenant-scope.js';
import { logger } from '../logger.js';

export interface VerifiedUserTenant {
  userId: string;
  tenantId: string;
  email?: string;
}

/** Authenticated user — tenant optional (onboarding before workspace exists). */
export interface VerifiedSupabaseUser {
  userId: string;
  email?: string;
  tenantId?: string;
}

/** Resolve tenant when JWT metadata was never synced after onboarding. */
async function resolveTenantIdForUser(userId: string): Promise<string | undefined> {
  try {
    const owned = await voiceDb.query(
      `SELECT id FROM public.voice_tenants
       WHERE owner_user_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );
    const ownedId = (owned.rows[0] as { id?: string } | undefined)?.id;
    if (ownedId) return String(ownedId);

    const member = await voiceDb.query(
      `SELECT tenant_id FROM public.org_members
       WHERE user_id = $1 AND status = 'active'
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );
    const memberTenant = (member.rows[0] as { tenant_id?: string } | undefined)?.tenant_id;
    if (memberTenant) return String(memberTenant);

    const team = await voiceDb.query(
      `SELECT tenant_id FROM public.team_members
       WHERE user_id = $1 AND is_active = true
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );
    const teamTenant = (team.rows[0] as { tenant_id?: string } | undefined)?.tenant_id;
    if (teamTenant) return String(teamTenant);
  } catch (err) {
    logger.debug('TENANT_DB_LOOKUP_SKIP', { userId, error: String(err) });
  }
  return undefined;
}

/**
 * Verify Supabase JWT without requiring a tenant (e.g. POST /tenants during onboarding).
 */
export async function verifySupabaseAuthOnly(
  bearer: string
): Promise<VerifiedSupabaseUser | { error: string; status: number }> {
  if (!bearer?.trim()) {
    return { error: 'Unauthorized', status: 401 };
  }

  try {
    const supabase = getSupabaseAdmin();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(bearer);

    if (!error && user) {
      let tenantId =
        (user.user_metadata?.tenant_id as string | undefined) ||
        (user.app_metadata?.tenant_id as string | undefined);

      if (!tenantId) {
        tenantId = await resolveTenantIdForUser(user.id);
      }

      return {
        userId: user.id,
        email: user.email ?? undefined,
        tenantId: tenantId ? String(tenantId) : undefined,
      };
    }
  } catch (supabaseErr) {
    const hint = supabaseErr instanceof Error ? supabaseErr.message : String(supabaseErr);
    if (hint.includes('SUPABASE_URL') || hint.includes('SERVICE_ROLE')) {
      return {
        error:
          'Server auth misconfigured — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the gateway',
        status: 500,
      };
    }
    // Supabase reachable but returned an error — do NOT fall through to local JWT.
    // Local JWT fallback would bypass Supabase revocation and session management.
    return { error: 'Invalid or expired session — sign in again', status: 401 };
  }

  return { error: 'Invalid or expired session — sign in again', status: 401 };
}

/**
 * Resolve tenant from Supabase user JWT only (never from client headers).
 */
export async function verifyUserBearerToken(
  bearer: string
): Promise<VerifiedUserTenant | { error: string; status: number }> {
  if (!bearer?.trim()) {
    return { error: 'Unauthorized', status: 401 };
  }

  try {
    const supabase = getSupabaseAdmin();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(bearer);

    if (!error && user) {
      let tenantId =
        (user.user_metadata?.tenant_id as string | undefined) ||
        (user.app_metadata?.tenant_id as string | undefined);

      if (!tenantId) {
        tenantId = await resolveTenantIdForUser(user.id);
      }

      if (!tenantId) {
        return {
          error: 'Tenant not configured — complete onboarding or contact support',
          status: 403,
        };
      }

      return {
        userId: user.id,
        tenantId: String(tenantId),
        email: user.email ?? undefined,
      };
    }
  } catch (supabaseErr) {
    const hint = supabaseErr instanceof Error ? supabaseErr.message : String(supabaseErr);
    if (hint.includes('SUPABASE_URL') || hint.includes('SERVICE_ROLE')) {
      return {
        error:
          'Server auth misconfigured — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the gateway',
        status: 500,
      };
    }
    // Supabase reachable but returned an error — do NOT fall through to local JWT.
    return { error: 'Invalid or expired session — sign in again', status: 401 };
  }

  return { error: 'Invalid or expired session — sign in again', status: 401 };
}
