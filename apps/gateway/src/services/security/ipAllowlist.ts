import type { Request, Response, NextFunction } from 'express';
import { pool } from '../db/pool.js';
import type { CallIqAuthenticatedRequest } from '../auth/tenant-context.js';

/**
 * IP Allowlist Middleware
 * Restricts dashboard access to specific IP addresses per tenant.
 */

/**
 * Check if an IP address is in a CIDR range.
 */
function ipInCidr(ip: string, cidr: string): boolean {
  if (!cidr.includes('/')) return ip === cidr;

  const [range, bits] = cidr.split('/');
  const mask = ~(2 ** (32 - parseInt(bits, 10)) - 1);

  const ipNum = ipToNumber(ip);
  const rangeNum = ipToNumber(range);

  return (ipNum & mask) === (rangeNum & mask);
}

function ipToNumber(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

/**
 * Middleware: Check IP allowlist for a tenant.
 * Usage: app.use('/api/v1', ipAllowlistMiddleware);
 */
export async function ipAllowlistMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authReq = req as CallIqAuthenticatedRequest;
  const tenantId =
    authReq.tenant?.id ||
    authReq.resolvedTenantId ||
    (req.headers['x-tenant-id'] as string | undefined);
  if (!tenantId) return next();

  try {
    const result = await pool.query(
      `SELECT ip_address FROM public.ip_allowlist WHERE tenant_id = $1 AND enabled = true`,
      [tenantId]
    );

    // No rules configured → allow all
    if (result.rows.length === 0) return next();

    const clientIp = req.ip || req.connection.remoteAddress || '';
    const normalizedIp = clientIp.replace(/^::ffff:/, ''); // Strip IPv6 prefix

    const allowed = result.rows.some((row: any) => ipInCidr(normalizedIp, row.ip_address));

    if (!allowed) {
      res.status(403).json({
        success: false,
        error: 'Access denied: Your IP address is not allowed for this tenant',
      });
      return;
    }

    next();
  } catch (error) {
    const { logger } = await import('../logger.js');
    logger.error('IP_ALLOWLIST_DB_ERROR', { tenantId, error: String(error) });
    const failOpenRequested = process.env.ALLOWLIST_FAIL_OPEN === 'true';
    const isProduction = process.env.NODE_ENV === 'production';
    if (failOpenRequested && isProduction) {
      // Fail-open is unsafe in production: a DB outage must not silently disable
      // IP restrictions. Ignore the flag and fail closed.
      logger.warn('IP_ALLOWLIST_FAIL_OPEN_IGNORED_IN_PRODUCTION', { tenantId });
    } else if (failOpenRequested) {
      logger.warn('IP_ALLOWLIST_FAIL_OPEN_OVERRIDE', { tenantId });
      return next();
    }
    res.status(503).json({
      success: false,
      error: 'Access control check temporarily unavailable.',
    });
  }
}

/**
 * Service: Manage IP allowlist entries.
 */
export class IPAllowlistService {
  async list(tenantId: string): Promise<Array<{ id: string; ipAddress: string; description: string | null; enabled: boolean; createdAt: Date }>> {
    const result = await pool.query(
      `SELECT id, ip_address, description, enabled, created_at FROM public.ip_allowlist WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId]
    );
    return result.rows.map((row: any) => ({
      id: row.id, ipAddress: row.ip_address, description: row.description, enabled: row.enabled, createdAt: row.created_at,
    }));
  }

  async add(tenantId: string, ipAddress: string, description?: string): Promise<any> {
    const result = await pool.query(
      `INSERT INTO public.ip_allowlist (tenant_id, ip_address, description) VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, ip_address) DO UPDATE SET description = $3
       RETURNING id, ip_address, description, enabled, created_at`,
      [tenantId, ipAddress, description || null]
    );
    return result.rows[0];
  }

  async remove(tenantId: string, entryId: string): Promise<void> {
    await pool.query(`DELETE FROM public.ip_allowlist WHERE id = $1 AND tenant_id = $2`, [entryId, tenantId]);
  }

  async toggle(tenantId: string, entryId: string, enabled: boolean): Promise<any> {
    const result = await pool.query(
      `UPDATE public.ip_allowlist SET enabled = $1 WHERE id = $2 AND tenant_id = $3
       RETURNING id, ip_address, description, enabled, created_at`,
      [enabled, entryId, tenantId]
    );
    return result.rows[0];
  }
}

export const ipAllowlistService = new IPAllowlistService();

