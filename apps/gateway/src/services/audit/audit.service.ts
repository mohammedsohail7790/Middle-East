/**
 * Audit Logs Service
 * Immutable log of all user actions for compliance and security.
 */

import { logger } from '../logger.js';
import { pool } from '../db/pool.js';

export interface AuditLogEntry {
  id: string;
  tenantId: string;
  userId: string | null;
  userEmail: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  oldValue: Record<string, any> | null;
  newValue: Record<string, any> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

export class AuditLogService {
  /**
   * Log an action. Called from middleware or service layer.
   */
  async log(args: {
    tenantId: string;
    userId?: string;
    userEmail?: string;
    action: string;
    resourceType?: string;
    resourceId?: string;
    oldValue?: Record<string, any>;
    newValue?: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO public.audit_logs 
         (tenant_id, user_id, user_email, action, resource_type, resource_id, old_value, new_value, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          args.tenantId,
          args.userId || null,
          args.userEmail || null,
          args.action,
          args.resourceType || null,
          args.resourceId || null,
          args.oldValue ? JSON.stringify(args.oldValue) : null,
          args.newValue ? JSON.stringify(args.newValue) : null,
          args.ipAddress || null,
          args.userAgent || null,
        ]
      );
    } catch (error) {
      // Never fail the main operation due to audit logging failure
      logger.error('Failed to write audit log', { error: String(error), action: args.action });
    }
  }

  /**
   * Get audit logs for a tenant with pagination.
   */
  async getLogs(tenantId: string, options: { limit?: number; offset?: number; action?: string; userId?: string }): Promise<AuditLogEntry[]> {
    const { limit = 50, offset = 0, action, userId } = options;
    let query = `
      SELECT id, tenant_id, user_id, user_email, action, resource_type, resource_id, 
             old_value, new_value, ip_address, user_agent, created_at
      FROM public.audit_logs
      WHERE tenant_id = $1
    `;
    const values: any[] = [tenantId];
    let paramIndex = 2;

    if (action) {
      query += ` AND action = $${paramIndex++}`;
      values.push(action);
    }
    if (userId) {
      query += ` AND user_id = $${paramIndex++}`;
      values.push(userId);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    values.push(limit, offset);

    const result = await pool.query(query, values);
    return result.rows.map(this.mapRow);
  }

  /**
   * Get audit log stats for a tenant.
   */
  async getStats(tenantId: string): Promise<{ totalLogs: number; actionsByType: { action: string; count: string }[] }> {
    const totalResult = await pool.query(
      `SELECT COUNT(*) FROM public.audit_logs WHERE tenant_id = $1`,
      [tenantId]
    );

    const actionsResult = await pool.query(
      `SELECT action, COUNT(*) as count 
       FROM public.audit_logs 
       WHERE tenant_id = $1 
       GROUP BY action 
       ORDER BY count DESC 
       LIMIT 20`,
      [tenantId]
    );

    return {
      totalLogs: parseInt(totalResult.rows[0].count, 10),
      actionsByType: actionsResult.rows,
    };
  }

  private mapRow(row: any): AuditLogEntry {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      userEmail: row.user_email,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      oldValue: row.old_value,
      newValue: row.new_value,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      createdAt: row.created_at,
    };
  }
}

export const auditLogService = new AuditLogService();

