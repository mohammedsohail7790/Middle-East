/**
 * Leads Service
 * Handles lead management, scoring, and pipeline
 */

import { voiceDb } from '../voice/tenant-scope.js';
import { getLeadSelectList } from './leads-schema.js';

let cachedLeadSelect: string | null = null;
async function leadSelect(): Promise<string> {
  if (!cachedLeadSelect) cachedLeadSelect = await getLeadSelectList();
  return cachedLeadSelect;
}

function toDbStatus(status: Lead['status']): string {
  return status === 'appointment_set' ? 'qualified' : status;
}

function parseCustomFields(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  try {
    return JSON.parse(String(raw)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export interface Lead {
  id: string;
  tenantId: string;
  phoneNumber: string;
  email?: string;
  name?: string;
  source: string;
  status: 'new' | 'contacted' | 'qualified' | 'appointment_set' | 'won' | 'lost';
  score: number;
  assignedTo?: string;
  notes?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface LeadActivity {
  id: string;
  leadId: string;
  type: 'call' | 'sms' | 'email' | 'note' | 'status_change';
  description: string;
  metadata?: Record<string, any>;
  createdAt: Date;
}

export interface LeadStats {
  total: number;
  new: number;
  contacted: number;
  qualified: number;
  appointmentSet: number;
  won: number;
  lost: number;
  conversionRate: number;
  averageScore: number;
}

export interface LeadRoutingRule {
  id: string;
  tenantId: string;
  name: string;
  type: 'round_robin' | 'skill_based' | 'load_balanced';
  enabled: boolean;
  conditions?: Record<string, any>;
  teamMembers: string[];
  createdAt: Date;
}

export class LeadsService {
  // Track last assigned team member for round-robin
  private lastAssignedIndex: Map<string, number> = new Map();

  /**
   * Calculate lead score based on various factors
   */
  private calculateLeadScore(lead: Partial<Lead>): number {
    let score = 0;

    // Base score
    score += 10;

    // Has email
    if (lead.email) score += 15;

    // Has name
    if (lead.name) score += 10;

    // Source quality
    if (lead.source === 'inbound_call') score += 25;
    else if (lead.source === 'website') score += 20;
    else if (lead.source === 'referral') score += 30;
    else if (lead.source === 'sms') score += 15;

    // Status progression
    if (lead.status === 'contacted') score += 10;
    else if (lead.status === 'qualified') score += 20;
    else if (lead.status === 'appointment_set') score += 30;

    // Cap at 100
    return Math.min(score, 100);
  }

  /**
   * Create lead
   */
  async createLead(
    tenantId: string,
    phoneNumber: string,
    source: string,
    data?: {
      email?: string;
      name?: string;
      notes?: string;
      metadata?: Record<string, any>;
      callId?: string;
      service?: string;
      preferred_time?: string;
    }
  ): Promise<Lead> {
    try {
      const customFields = { ...(data?.metadata ?? {}) };
      if (data?.email) customFields.email = data.email;

      const existingResult = await voiceDb.query(
        'SELECT id FROM public.leads WHERE tenant_id = $1 AND phone = $2',
        [tenantId, phoneNumber]
      );

      if (existingResult.rows.length > 0) {
        const leadId = existingResult.rows[0].id as string;
        if (
          data?.callId ||
          data?.name ||
          data?.notes ||
          data?.preferred_time ||
          Object.keys(customFields).length
        ) {
          await voiceDb.query(
            `UPDATE public.leads
             SET call_id = COALESCE($1, call_id),
                 name = COALESCE($2, name),
                 notes = COALESCE($3, notes),
                 custom_fields = COALESCE(custom_fields, '{}'::jsonb) || $4::jsonb,
                 service = COALESCE($5, service),
                 preferred_time = COALESCE($6, preferred_time)
             WHERE id = $7 AND tenant_id = $8`,
            [
              data.callId ?? null,
              data.name ?? null,
              data.notes ?? null,
              JSON.stringify(customFields),
              data.service ?? data.metadata?.service ?? null,
              data.preferred_time ?? null,
              leadId,
              tenantId,
            ]
          );
          const { publishDashboardPushType } = await import('../dashboard/dashboard-events.js');
          publishDashboardPushType(tenantId, 'lead.updated', [], { leadId });
          void import('../../events/event-publisher.js')
            .then(async ({ publishPlatformEvent }) => {
              const { PlatformEventTypes } = await import('../../events/event-types.js');
              publishPlatformEvent(
                PlatformEventTypes.LEAD_UPDATED,
                { leadId, phone: phoneNumber, name: data?.name, callId: data?.callId },
                { tenantId }
              );
            })
            .catch(() => {});
        }
        return await this.getLead(tenantId, leadId);
      }

      const score = this.calculateLeadScore({
        phoneNumber,
        source,
        status: 'new',
        ...data,
      });

      const result = await voiceDb.query(
        `INSERT INTO public.leads
         (tenant_id, phone, name, source, status, score, notes, custom_fields, service, call_id, preferred_time)
         VALUES ($1, $2, $3, $4, 'new', $5, $6, $7::jsonb, $8, $9, $10)
         RETURNING ${await leadSelect()}`,
        [
          tenantId,
          phoneNumber,
          data?.name,
          source,
          score,
          data?.notes,
          JSON.stringify(customFields),
          data?.service ?? data?.metadata?.service ?? null,
          data?.callId ?? null,
          data?.preferred_time ?? null,
        ]
      );

      const lead = this.mapToLead(result.rows[0]);

      // Log activity
      await this.addActivity(lead.id, 'note', 'Lead created', { source });

      console.log(`[Leads] Lead created: ${lead.id}`);

      const { publishDashboardPushType } = await import('../dashboard/dashboard-events.js');
      publishDashboardPushType(tenantId, 'lead.created', [], { leadId: lead.id });

      void import('../../events/event-publisher.js')
        .then(async ({ publishPlatformEvent }) => {
          const { PlatformEventTypes } = await import('../../events/event-types.js');
          publishPlatformEvent(
            PlatformEventTypes.LEAD_CREATED,
            {
              leadId: lead.id,
              phone: phoneNumber,
              name: data?.name,
              callId: data?.callId,
            },
            { tenantId }
          );
        })
        .catch(() => {});

      void import('../slack/slack.service.js').then(({ slackService }) => {
        slackService
          .sendNewLeadNotification(tenantId, {
            name: lead.name,
            phone: lead.phoneNumber,
            source: lead.source,
            score: lead.score,
          })
          .catch(() => {});
      });

      if (!source.endsWith('_inbound')) {
        void import('../integrations/integration.service.js').then(({ integrationService }) => {
          integrationService
            .sendRealtime(tenantId, {
              callId: data?.callId || lead.id,
              type: 'lead',
              lead: {
                name: lead.name,
                phone: lead.phoneNumber,
                service: data?.service ?? (lead.metadata?.service as string | undefined),
                preferred_time: data?.preferred_time,
                notes: lead.notes,
              },
            })
            .catch(() => {});
        });
      }

      return lead;
    } catch (error) {
      console.error('[Leads] Error creating lead:', error);
      throw error;
    }
  }

  /**
   * Get lead by ID
   */
  async getLead(tenantId: string, leadId: string): Promise<Lead> {
    try {
      const result = await voiceDb.query(
        `SELECT ${await leadSelect()} FROM public.leads WHERE id = $1 AND tenant_id = $2`,
        [leadId, tenantId]
      );

      if (result.rows.length === 0) {
        throw new Error('Lead not found');
      }

      return this.mapToLead(result.rows[0]);
    } catch (error) {
      console.error('[Leads] Error getting lead:', error);
      throw error;
    }
  }

  /**
   * Get all leads for tenant
   */
  async getLeads(
    tenantId: string,
    filters?: {
      status?: string;
      assignedTo?: string;
      minScore?: number;
      search?: string;
    },
    options?: { limit?: number; offset?: number }
  ): Promise<{ items: Lead[]; total: number; limit: number; offset: number }> {
    try {
      const limit = Math.min(Math.max(options?.limit ?? 100, 1), 500);
      const offset = Math.max(options?.offset ?? 0, 0);
      const cols = await leadSelect();
      let where = 'WHERE tenant_id = $1';
      const params: any[] = [tenantId];
      let paramIndex = 2;

      if (filters?.status) {
        where += ` AND status = $${paramIndex}`;
        params.push(filters.status);
        paramIndex++;
      }

      if (filters?.assignedTo) {
        where += ` AND assigned_to = $${paramIndex}`;
        params.push(filters.assignedTo);
        paramIndex++;
      }

      if (filters?.minScore) {
        where += ` AND score >= $${paramIndex}`;
        params.push(filters.minScore);
        paramIndex++;
      }

      if (filters?.search) {
        where += ` AND (name ILIKE $${paramIndex} OR phone ILIKE $${paramIndex} OR service ILIKE $${paramIndex})`;
        params.push(`%${filters.search}%`);
        paramIndex++;
      }

      const countResult = await voiceDb.query(
        `SELECT COUNT(*)::int AS total FROM public.leads ${where}`,
        params
      );
      const total = countResult.rows[0]?.total ?? 0;

      const listParams = [...params, limit, offset];
      const query = `SELECT ${cols} FROM public.leads ${where} ORDER BY score DESC, created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;

      const result = await voiceDb.query(query, listParams);

      return {
        items: result.rows.map(this.mapToLead),
        total,
        limit,
        offset,
      };
    } catch (error) {
      console.error('[Leads] Error getting leads:', error);
      throw error;
    }
  }

  /**
   * Update lead status
   */
  async updateLeadStatus(
    tenantId: string,
    leadId: string,
    status: Lead['status']
  ): Promise<Lead> {
    try {
      // Get current lead
      const lead = await this.getLead(tenantId, leadId);

      // Recalculate score with new status
      const newScore = this.calculateLeadScore({ ...lead, status });

      // Update lead
      const result = await voiceDb.query(
        `UPDATE public.leads
         SET status = $1, score = $2
         WHERE id = $3 AND tenant_id = $4
         RETURNING ${await leadSelect()}`,
        [toDbStatus(status), newScore, leadId, tenantId]
      );

      const updatedLead = this.mapToLead(result.rows[0]);

      // Log activity
      await this.addActivity(
        leadId,
        'status_change',
        `Status changed from ${lead.status} to ${status}`
      );

      console.log(`[Leads] Lead status updated: ${leadId} -> ${status}`);

      const { publishDashboardPushType } = await import('../dashboard/dashboard-events.js');
      publishDashboardPushType(tenantId, 'lead.updated', [], { leadId, status });

      return updatedLead;
    } catch (error) {
      console.error('[Leads] Error updating lead status:', error);
      throw error;
    }
  }

  /**
   * Assign lead to team member
   */
  async assignLead(
    tenantId: string,
    leadId: string,
    assignedTo: string
  ): Promise<Lead> {
    try {
      const result = await voiceDb.query(
        `UPDATE public.leads SET assigned_to = $1
         WHERE id = $2 AND tenant_id = $3
         RETURNING ${await leadSelect()}`,
        [assignedTo, leadId, tenantId]
      );

      const lead = this.mapToLead(result.rows[0]);

      // Log activity
      await this.addActivity(leadId, 'note', `Lead assigned to ${assignedTo}`);

      console.log(`[Leads] Lead assigned: ${leadId} -> ${assignedTo}`);

      return lead;
    } catch (error) {
      console.error('[Leads] Error assigning lead:', error);
      throw error;
    }
  }

  /**
   * Update lead details
   */
  async updateLead(
    tenantId: string,
    leadId: string,
    updates: {
      email?: string;
      name?: string;
      notes?: string;
      source?: string;
      phoneNumber?: string;
      metadata?: Record<string, any>;
    }
  ): Promise<Lead> {
    try {
      const lead = await this.getLead(tenantId, leadId);

      // Recalculate score
      const newScore = this.calculateLeadScore({
        ...lead,
        ...updates,
        phoneNumber: updates.phoneNumber ?? lead.phoneNumber,
      });

      const mergedFields = {
        ...parseCustomFields(lead.metadata),
        ...(updates.metadata ?? {}),
      };
      if (updates.email) mergedFields.email = updates.email;

      const result = await voiceDb.query(
        `UPDATE public.leads
         SET name = COALESCE($1, name),
             notes = COALESCE($2, notes),
             phone = COALESCE($3, phone),
             source = COALESCE($4, source),
             custom_fields = COALESCE(custom_fields, '{}'::jsonb) || $5::jsonb,
             score = $6
         WHERE id = $7 AND tenant_id = $8
         RETURNING ${await leadSelect()}`,
        [
          updates.name,
          updates.notes,
          updates.phoneNumber,
          updates.source,
          JSON.stringify(mergedFields),
          newScore,
          leadId,
          tenantId,
        ]
      );

      console.log(`[Leads] Lead updated: ${leadId}`);

      const { publishDashboardPushType } = await import('../dashboard/dashboard-events.js');
      publishDashboardPushType(tenantId, 'lead.updated', [], { leadId });

      return this.mapToLead(result.rows[0]);
    } catch (error) {
      console.error('[Leads] Error updating lead:', error);
      throw error;
    }
  }

  /**
   * Add activity to lead
   */
  async addActivity(
    leadId: string,
    type: LeadActivity['type'],
    description: string,
    metadata?: Record<string, any>
  ): Promise<LeadActivity> {
    try {
      const result = await voiceDb.query(
        `INSERT INTO public.lead_activities (lead_id, type, description, metadata)
         VALUES ($1, $2, $3, $4)
         RETURNING id, lead_id, type, description, metadata, created_at`,
        [leadId, type, description, metadata ? JSON.stringify(metadata) : null]
      );

      return this.mapToActivity(result.rows[0]);
    } catch (error) {
      console.error('[Leads] Error adding activity:', error);
      throw error;
    }
  }

  /**
   * Get lead activities
   */
  async getActivities(leadId: string, limit: number = 50): Promise<LeadActivity[]> {
    try {
      const result = await voiceDb.query(
        `SELECT id, lead_id, type, description, metadata, created_at
         FROM public.lead_activities
         WHERE lead_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [leadId, limit]
      );

      return result.rows.map(this.mapToActivity);
    } catch (error) {
      console.error('[Leads] Error getting activities:', error);
      throw error;
    }
  }

  /**
   * Get lead statistics
   */
  async getStats(tenantId: string): Promise<LeadStats> {
    try {
      const result = await voiceDb.query(
        `SELECT 
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE status = 'new') as new,
           COUNT(*) FILTER (WHERE status = 'contacted') as contacted,
           COUNT(*) FILTER (WHERE status = 'qualified') as qualified,
           COUNT(*) FILTER (WHERE status = 'appointment_set') as appointment_set,
           COUNT(*) FILTER (WHERE status = 'won') as won,
           COUNT(*) FILTER (WHERE status = 'lost') as lost,
           AVG(score) as average_score
         FROM public.leads
         WHERE tenant_id = $1`,
        [tenantId]
      );

      const row = result.rows[0];
      const total = parseInt(row.total);
      const won = parseInt(row.won);

      return {
        total,
        new: parseInt(row.new),
        contacted: parseInt(row.contacted),
        qualified: parseInt(row.qualified),
        appointmentSet: parseInt(row.appointment_set),
        won,
        lost: parseInt(row.lost),
        conversionRate: total > 0 ? (won / total) * 100 : 0,
        averageScore: parseFloat(row.average_score) || 0,
      };
    } catch (error) {
      console.error('[Leads] Error getting stats:', error);
      throw error;
    }
  }

  /**
   * Delete lead
   */
  async deleteLead(tenantId: string, leadId: string): Promise<void> {
    try {
      await voiceDb.query(
        'DELETE FROM public.leads WHERE id = $1 AND tenant_id = $2',
        [leadId, tenantId]
      );

      const { publishDashboardPushType } = await import('../dashboard/dashboard-events.js');
      publishDashboardPushType(tenantId, 'lead.updated', [], { leadId, deleted: true });

      console.log(`[Leads] Lead deleted: ${leadId}`);
    } catch (error) {
      console.error('[Leads] Error deleting lead:', error);
      throw error;
    }
  }

  /**
   * Get routing rules for tenant
   */
  async getRoutingRules(tenantId: string): Promise<LeadRoutingRule[]> {
    try {
      const result = await voiceDb.query(
        `SELECT id, tenant_id, name, type, enabled, conditions, team_members, created_at
         FROM public.lead_routing_rules
         WHERE tenant_id = $1
         ORDER BY created_at DESC`,
        [tenantId]
      );

      return result.rows.map((row: any) => ({
        id: row.id,
        tenantId: row.tenant_id,
        name: row.name,
        type: row.type,
        enabled: row.enabled,
        conditions: row.conditions,
        teamMembers: row.team_members,
        createdAt: row.created_at,
      }));
    } catch (error) {
      console.error('[Leads] Error getting routing rules:', error);
      throw error;
    }
  }

  /**
   * Create routing rule
   */
  async createRoutingRule(
    tenantId: string,
    name: string,
    type: LeadRoutingRule['type'],
    teamMembers: string[],
    conditions?: Record<string, any>
  ): Promise<LeadRoutingRule> {
    try {
      const result = await voiceDb.query(
        `INSERT INTO public.lead_routing_rules 
         (tenant_id, name, type, team_members, conditions, enabled)
         VALUES ($1, $2, $3, $4, $5, true)
         RETURNING id, tenant_id, name, type, enabled, conditions, team_members, created_at`,
        [
          tenantId,
          name,
          type,
          teamMembers,
          conditions ? JSON.stringify(conditions) : null,
        ]
      );

      console.log(`[Leads] Routing rule created: ${result.rows[0].id}`);

      return {
        id: result.rows[0].id,
        tenantId: result.rows[0].tenant_id,
        name: result.rows[0].name,
        type: result.rows[0].type,
        enabled: result.rows[0].enabled,
        conditions: result.rows[0].conditions,
        teamMembers: result.rows[0].team_members,
        createdAt: result.rows[0].created_at,
      };
    } catch (error) {
      console.error('[Leads] Error creating routing rule:', error);
      throw error;
    }
  }

  /**
   * Route lead to team member based on rules
   */
  async routeLead(tenantId: string, leadId: string): Promise<Lead> {
    try {
      // Get active routing rules
      const rules = await this.getRoutingRules(tenantId);
      const activeRule = rules.find((r) => r.enabled);

      if (!activeRule || activeRule.teamMembers.length === 0) {
        throw new Error('No active routing rule or team members available');
      }

      let assignedTo: string;

      switch (activeRule.type) {
        case 'round_robin':
          assignedTo = this.roundRobinAssignment(tenantId, activeRule.teamMembers);
          break;

        case 'skill_based':
          // For now, use first available team member
          // In production, this would check skills/availability
          assignedTo = activeRule.teamMembers[0];
          break;

        case 'load_balanced':
          assignedTo = await this.loadBalancedAssignment(
            tenantId,
            activeRule.teamMembers
          );
          break;

        default:
          assignedTo = activeRule.teamMembers[0];
      }

      // Assign the lead
      return await this.assignLead(tenantId, leadId, assignedTo);
    } catch (error) {
      console.error('[Leads] Error routing lead:', error);
      throw error;
    }
  }

  /**
   * Round-robin assignment
   */
  private roundRobinAssignment(tenantId: string, teamMembers: string[]): string {
    const lastIndex = this.lastAssignedIndex.get(tenantId) || 0;
    const nextIndex = (lastIndex + 1) % teamMembers.length;
    this.lastAssignedIndex.set(tenantId, nextIndex);
    return teamMembers[nextIndex];
  }

  /**
   * Load-balanced assignment (assign to team member with fewest leads)
   */
  private async loadBalancedAssignment(
    tenantId: string,
    teamMembers: string[]
  ): Promise<string> {
    try {
      // Count leads per team member
      const result = await voiceDb.query(
        `SELECT assigned_to, COUNT(*) as lead_count
         FROM public.leads
         WHERE tenant_id = $1 
           AND assigned_to = ANY($2)
           AND status NOT IN ('won', 'lost')
         GROUP BY assigned_to`,
        [tenantId, teamMembers]
      );

      // Create map of team member -> lead count
      const loadMap = new Map<string, number>();
      teamMembers.forEach((member) => loadMap.set(member, 0));
      result.rows.forEach((row: any) => {
        loadMap.set(row.assigned_to, parseInt(row.lead_count));
      });

      // Find team member with lowest load
      let minLoad = Infinity;
      let assignedTo = teamMembers[0];

      for (const [member, load] of loadMap.entries()) {
        if (load < minLoad) {
          minLoad = load;
          assignedTo = member;
        }
      }

      return assignedTo;
    } catch (error) {
      console.error('[Leads] Error in load-balanced assignment:', error);
      // Fallback to first team member
      return teamMembers[0];
    }
  }

  /**
   * Map database row to Lead
   */
  private mapToLead(row: any): Lead {
    const customFields = parseCustomFields(row.custom_fields ?? row.metadata);
    let status = row.status as Lead['status'];
    if (
      status === 'qualified' &&
      (customFields.appointmentBooked === true || customFields.appointmentBooked === 'true')
    ) {
      status = 'appointment_set';
    }
    return {
      id: row.id,
      tenantId: row.tenant_id,
      phoneNumber: row.phone_number ?? row.phone,
      email: (customFields.email as string) ?? undefined,
      name: row.name,
      source: row.source ?? 'inbound_call',
      status,
      score: row.score ?? 0,
      assignedTo: row.assigned_to,
      notes: row.notes,
      metadata: customFields,
      createdAt: row.created_at,
      updatedAt: row.created_at,
    };
  }

  /**
   * Map database row to LeadActivity
   */
  private mapToActivity(row: any): LeadActivity {
    return {
      id: row.id,
      leadId: row.lead_id,
      type: row.type,
      description: row.description,
      metadata: row.metadata,
      createdAt: row.created_at,
    };
  }
}

export const leadsService = new LeadsService();

