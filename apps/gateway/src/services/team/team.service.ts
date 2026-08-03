/**
 * Team Service
 * Handles team member management and permissions
 */

import { billingService } from '../billing/billing.service.js';
import { voiceDb } from '../voice/tenant-scope.js';

const pool = voiceDb;

const TEAM_MEMBER_SELECT = `id, tenant_id, user_id, email,
  COALESCE(NULLIF(TRIM(full_name), ''), split_part(email, '@', 1)) AS name, role, permissions,
  CASE WHEN is_active THEN 'active' ELSE 'inactive' END AS status,
  created_at, updated_at`;

export interface TeamMember {
  id: string;
  tenantId: string;
  userId: string;
  email: string;
  name: string;
  role: 'owner' | 'admin' | 'agent' | 'viewer';
  permissions: string[];
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}

const ROLE_PERMISSIONS = {
  owner: ['*'], // All permissions
  admin: [
    'leads:read',
    'leads:write',
    'calls:read',
    'calls:write',
    'sms:read',
    'sms:write',
    'analytics:read',
    'calendar:read',
    'calendar:write',
    'team:read',
    'settings:read',
    'settings:write',
  ],
  agent: [
    'leads:read',
    'leads:write',
    'calls:read',
    'sms:read',
    'sms:write',
    'calendar:read',
    'calendar:write',
  ],
  viewer: ['leads:read', 'calls:read', 'analytics:read'],
};

export class TeamService {
  /**
   * Get all team members for tenant
   */
  async getTeamMembers(tenantId: string): Promise<TeamMember[]> {
    try {
      const result = await pool.query(
        `SELECT ${TEAM_MEMBER_SELECT}
         FROM public.team_members
         WHERE tenant_id = $1
         ORDER BY created_at ASC`,
        [tenantId]
      );

      return result.rows.map(this.mapToTeamMember);
    } catch (error) {
      console.error('[Team] Error getting team members:', error);
      throw error;
    }
  }

  /**
   * Get team member by ID
   */
  async getTeamMember(tenantId: string, memberId: string): Promise<TeamMember> {
    try {
      const result = await pool.query(
        `SELECT ${TEAM_MEMBER_SELECT}
         FROM public.team_members
         WHERE id = $1 AND tenant_id = $2`,
        [memberId, tenantId]
      );

      if (result.rows.length === 0) {
        throw new Error('Team member not found');
      }

      return this.mapToTeamMember(result.rows[0]);
    } catch (error) {
      console.error('[Team] Error getting team member:', error);
      throw error;
    }
  }

  /**
   * Add team member
   */
  async addTeamMember(
    tenantId: string,
    userId: string,
    email: string,
    name: string,
    role: TeamMember['role']
  ): Promise<TeamMember> {
    try {
      const sub = await billingService.getActiveSubscription(tenantId);
      if (!sub || !['active', 'trialing'].includes(sub.status)) {
        throw new Error('No active subscription. Team members require an active plan or trial.');
      }

      // Get permissions for role
      const permissions = ROLE_PERMISSIONS[role] || [];

      const result = await pool.query(
        `INSERT INTO public.team_members (tenant_id, user_id, email, full_name, role, permissions, is_active)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, true)
         RETURNING ${TEAM_MEMBER_SELECT}`,
        [tenantId, userId || null, email, name, role, JSON.stringify(permissions)]
      );

      console.log(`[Team] Team member added: ${result.rows[0].id}`);

      return this.mapToTeamMember(result.rows[0]);
    } catch (error) {
      console.error('[Team] Error adding team member:', error);
      throw error;
    }
  }

  /**
   * Update team member
   */
  async updateTeamMember(
    tenantId: string,
    memberId: string,
    updates: {
      name?: string;
      role?: TeamMember['role'];
      status?: TeamMember['status'];
    }
  ): Promise<TeamMember> {
    try {
      // If role is being updated, update permissions too
      let permissions: string[] | undefined;
      if (updates.role) {
        permissions = ROLE_PERMISSIONS[updates.role] || [];
      }

      const isActive =
        updates.status === undefined
          ? null
          : updates.status === 'active';

      const result = await pool.query(
        `UPDATE public.team_members
         SET full_name = COALESCE($1, full_name),
             role = COALESCE($2, role),
             permissions = COALESCE($3::jsonb, permissions),
             is_active = COALESCE($4, is_active),
             updated_at = NOW()
         WHERE id = $5 AND tenant_id = $6
         RETURNING ${TEAM_MEMBER_SELECT}`,
        [
          updates.name,
          updates.role,
          permissions ? JSON.stringify(permissions) : null,
          isActive,
          memberId,
          tenantId,
        ]
      );

      console.log(`[Team] Team member updated: ${memberId}`);

      return this.mapToTeamMember(result.rows[0]);
    } catch (error) {
      console.error('[Team] Error updating team member:', error);
      throw error;
    }
  }

  /**
   * Remove team member
   */
  async removeTeamMember(tenantId: string, memberId: string): Promise<void> {
    try {
      await pool.query(
        'DELETE FROM public.team_members WHERE id = $1 AND tenant_id = $2',
        [memberId, tenantId]
      );

      console.log(`[Team] Team member removed: ${memberId}`);
    } catch (error) {
      console.error('[Team] Error removing team member:', error);
      throw error;
    }
  }

  /**
   * Check if user has permission
   */
  async hasPermission(
    tenantId: string,
    userId: string,
    permission: string
  ): Promise<boolean> {
    try {
      const result = await pool.query(
        `SELECT permissions, role FROM public.team_members
         WHERE tenant_id = $1 AND user_id = $2 AND is_active = true`,
        [tenantId, userId]
      );

      if (result.rows.length === 0) {
        return false;
      }

      const { permissions, role } = result.rows[0];

      // Owner has all permissions
      if (role === 'owner') {
        return true;
      }

      // Check if permission is in list
      return permissions.includes(permission) || permissions.includes('*');
    } catch (error) {
      console.error('[Team] Error checking permission:', error);
      return false;
    }
  }

  /**
   * Get team statistics
   */
  async getTeamStats(tenantId: string): Promise<{
    total: number;
    active: number;
    inactive: number;
    byRole: Record<string, number>;
  }> {
    try {
      const result = await pool.query(
        `SELECT 
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE is_active) as active,
           COUNT(*) FILTER (WHERE NOT is_active) as inactive,
           COUNT(*) FILTER (WHERE role = 'owner') as owners,
           COUNT(*) FILTER (WHERE role = 'admin') as admins,
           COUNT(*) FILTER (WHERE role = 'agent') as agents,
           COUNT(*) FILTER (WHERE role = 'viewer') as viewers
         FROM public.team_members
         WHERE tenant_id = $1`,
        [tenantId]
      );

      const row = result.rows[0];

      return {
        total: parseInt(row.total),
        active: parseInt(row.active),
        inactive: parseInt(row.inactive),
        byRole: {
          owner: parseInt(row.owners),
          admin: parseInt(row.admins),
          agent: parseInt(row.agents),
          viewer: parseInt(row.viewers),
        },
      };
    } catch (error) {
      console.error('[Team] Error getting team stats:', error);
      throw error;
    }
  }

  /**
   * Map database row to TeamMember
   */
  private mapToTeamMember(row: any): TeamMember {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      email: row.email,
      name: row.name,
      role: row.role,
      permissions: Array.isArray(row.permissions) ? row.permissions : JSON.parse(row.permissions || '[]'),
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const teamService = new TeamService();

