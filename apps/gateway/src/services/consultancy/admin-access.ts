import type { NextFunction, Request, Response } from 'express';
import { getTenantContext } from '../auth/tenant-context.js';

/**
 * Who may use the team-side consultancy screens (pipeline, proposals, projects, support). Everyone else gets 403, so by default nobody does.
 * The list is CONSULTANCY_ADMIN_EMAILS (comma separated), falling back to AUDIT_LEAD_EMAILS, the people who already review audits.
 */
export function consultancyAdminEmails(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.CONSULTANCY_ADMIN_EMAILS?.trim() || env.AUDIT_LEAD_EMAILS?.trim() || '';
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isConsultancyAdminEmail(email: string | null | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  const e = String(email ?? '').trim().toLowerCase();
  return !!e && consultancyAdminEmails(env).includes(e);
}

type EmailLookup = (userId: string) => Promise<string | null>;

/** Looks the signed-in user's email up from the login table; null when the user cannot be found. */
export const emailFromAuthUsers: EmailLookup = async (userId) => {
  const { pool } = await import('../db/pool.js');
  const r = await pool.query(`SELECT email, email_confirmed_at FROM auth.users WHERE id = $1 LIMIT 1`, [userId]);
  // An address nobody has proved they own does not count, so signing up as a team address gives no access.
  if (!r.rows[0]?.email_confirmed_at) return null;
  return r.rows[0].email ?? null;
};

/**
 * Express middleware: only a signed-in user (a real login, not an API key or internal call) whose email is on the list gets through.
 * Put it after requireTenant. The email is taken from the login table by user id, never from anything the browser sends.
 */
export function requireConsultancyAdmin(deps: { lookup?: EmailLookup; env?: NodeJS.ProcessEnv } = {}) {
  const lookup = deps.lookup ?? emailFromAuthUsers;
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ctx = getTenantContext(req);
      if (!ctx || ctx.source !== 'user_jwt' || !ctx.userId) {
        res.status(403).json({ success: false, error: 'Team access only' });
        return;
      }
      const email = await lookup(ctx.userId);
      if (!isConsultancyAdminEmail(email, deps.env)) {
        res.status(403).json({ success: false, error: 'Team access only' });
        return;
      }
      (req as Request & { consultancyAdminEmail?: string }).consultancyAdminEmail = String(email).toLowerCase();
      next();
    } catch {
      // Fail closed: if the lookup breaks, nobody gets in.
      res.status(403).json({ success: false, error: 'Team access only' });
    }
  };
}

/** The signed-in team member's email, set by requireConsultancyAdmin. */
export function adminEmail(req: Request): string {
  return (req as Request & { consultancyAdminEmail?: string }).consultancyAdminEmail ?? '';
}
