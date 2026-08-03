import { pool } from '../db/pool.js';

/**
 * IVR Flows & Multi-Agent Service
 * Manages IVR workflows and specialized AI agents.
 */

export interface IVRFlow {
  id: string;
  tenantId: string;
  name: string;
  active: boolean;
  greeting: string | null;
  steps: any[];
  createdAt: Date;
  updatedAt: Date;
}

export interface AIAgent {
  id: string;
  tenantId: string;
  name: string;
  role: string;
  systemPrompt: string;
  voiceId: string | null;
  tone: string;
  services: string[];
  maxDurationSeconds: number;
  transferOnTimeout: boolean;
  transferNumber: string | null;
  knowledgeCategory: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class IVRService {
  // ── IVR Flows ─────────────────────────────────────────────────────

  async createFlow(tenantId: string, data: { name: string; greeting?: string; steps: any[] }): Promise<IVRFlow> {
    const result = await pool.query(
      `INSERT INTO public.ivr_flows (tenant_id, name, greeting, steps)
       VALUES ($1, $2, $3, $4)
       RETURNING id, tenant_id, name, active, greeting, steps, created_at, updated_at`,
      [tenantId, data.name, data.greeting || null, JSON.stringify(data.steps)]
    );
    return this.mapFlow(result.rows[0]);
  }

  async listFlows(tenantId: string): Promise<IVRFlow[]> {
    const result = await pool.query(
      `SELECT id, tenant_id, name, active, greeting, steps, created_at, updated_at
       FROM public.ivr_flows WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId]
    );
    return result.rows.map((row: any) => this.mapFlow(row));
  }

  async updateFlow(tenantId: string, flowId: string, data: Partial<{ name: string; greeting: string; steps: any[]; active: boolean }>): Promise<IVRFlow> {
    const fields: string[] = [];
    const values: any[] = [];
    let i = 1;
    if (data.name !== undefined) { fields.push(`name = $${i++}`); values.push(data.name); }
    if (data.greeting !== undefined) { fields.push(`greeting = $${i++}`); values.push(data.greeting); }
    if (data.steps !== undefined) { fields.push(`steps = $${i++}`); values.push(JSON.stringify(data.steps)); }
    if (data.active !== undefined) { fields.push(`active = $${i++}`); values.push(data.active); }
    fields.push(`updated_at = NOW()`);
    values.push(flowId, tenantId);

    const result = await pool.query(
      `UPDATE public.ivr_flows SET ${fields.join(', ')} WHERE id = $${i++} AND tenant_id = $${i++}
       RETURNING id, tenant_id, name, active, greeting, steps, created_at, updated_at`,
      values
    );
    if (result.rows.length === 0) throw new Error('IVR flow not found');
    return this.mapFlow(result.rows[0]);
  }

  async deleteFlow(tenantId: string, flowId: string): Promise<void> {
    await pool.query(`DELETE FROM public.ivr_flows WHERE id = $1 AND tenant_id = $2`, [flowId, tenantId]);
  }

  // ── AI Agents ─────────────────────────────────────────────────────

  async createAgent(tenantId: string, data: {
    name: string; role: string; systemPrompt: string; voiceId?: string;
    tone?: string; services?: string[]; maxDurationSeconds?: number;
    transferOnTimeout?: boolean; transferNumber?: string; knowledgeCategory?: string;
  }): Promise<AIAgent> {
    const sub = await pool.query(
      `SELECT plan, status FROM public.subscriptions WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [tenantId]
    );
    const { getMaxAiAgents } = await import('../../config/plan-limits.js');
    const maxAgents = getMaxAiAgents(sub.rows[0]?.plan || 'essential', sub.rows[0]?.status);
    const count = await pool.query(
      `SELECT COUNT(*) FROM public.ai_agents WHERE tenant_id = $1 AND active = true`,
      [tenantId]
    );
    if (parseInt(count.rows[0].count, 10) >= maxAgents) {
      throw new Error(`Agent limit reached (${maxAgents}) for your plan`);
    }

    const result = await pool.query(
      `INSERT INTO public.ai_agents (tenant_id, name, role, system_prompt, voice_id, tone, services, max_duration_seconds, transfer_on_timeout, transfer_number, knowledge_category)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, tenant_id, name, role, system_prompt, voice_id, tone, services, max_duration_seconds, transfer_on_timeout, transfer_number, knowledge_category, active, created_at, updated_at`,
      [
        tenantId, data.name, data.role, data.systemPrompt, data.voiceId || null,
        data.tone || 'professional', JSON.stringify(data.services || []),
        data.maxDurationSeconds || 600, data.transferOnTimeout || false,
        data.transferNumber || null, data.knowledgeCategory || null,
      ]
    );
    return this.mapAgent(result.rows[0]);
  }

  async listAgents(tenantId: string): Promise<AIAgent[]> {
    const result = await pool.query(
      `SELECT id, tenant_id, name, role, system_prompt, voice_id, tone, services, max_duration_seconds, transfer_on_timeout, transfer_number, knowledge_category, active, created_at, updated_at
       FROM public.ai_agents WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId]
    );
    return result.rows.map((row: any) => this.mapAgent(row));
  }

  async updateAgent(tenantId: string, agentId: string, data: Partial<{
    name: string; role: string; systemPrompt: string; voiceId: string;
    tone: string; services: string[]; maxDurationSeconds: number;
    transferOnTimeout: boolean; transferNumber: string; knowledgeCategory: string; active: boolean;
  }>): Promise<AIAgent> {
    const fields: string[] = [];
    const values: any[] = [];
    let i = 1;
    if (data.name !== undefined) { fields.push(`name = $${i++}`); values.push(data.name); }
    if (data.role !== undefined) { fields.push(`role = $${i++}`); values.push(data.role); }
    if (data.systemPrompt !== undefined) { fields.push(`system_prompt = $${i++}`); values.push(data.systemPrompt); }
    if (data.voiceId !== undefined) { fields.push(`voice_id = $${i++}`); values.push(data.voiceId); }
    if (data.tone !== undefined) { fields.push(`tone = $${i++}`); values.push(data.tone); }
    if (data.services !== undefined) { fields.push(`services = $${i++}`); values.push(JSON.stringify(data.services)); }
    if (data.maxDurationSeconds !== undefined) { fields.push(`max_duration_seconds = $${i++}`); values.push(data.maxDurationSeconds); }
    if (data.transferOnTimeout !== undefined) { fields.push(`transfer_on_timeout = $${i++}`); values.push(data.transferOnTimeout); }
    if (data.transferNumber !== undefined) { fields.push(`transfer_number = $${i++}`); values.push(data.transferNumber); }
    if (data.knowledgeCategory !== undefined) { fields.push(`knowledge_category = $${i++}`); values.push(data.knowledgeCategory); }
    if (data.active !== undefined) { fields.push(`active = $${i++}`); values.push(data.active); }
    fields.push(`updated_at = NOW()`);
    values.push(agentId, tenantId);

    const result = await pool.query(
      `UPDATE public.ai_agents SET ${fields.join(', ')} WHERE id = $${i++} AND tenant_id = $${i++}
       RETURNING id, tenant_id, name, role, system_prompt, voice_id, tone, services, max_duration_seconds, transfer_on_timeout, transfer_number, knowledge_category, active, created_at, updated_at`,
      values
    );
    if (result.rows.length === 0) throw new Error('AI agent not found');
    return this.mapAgent(result.rows[0]);
  }

  async deleteAgent(tenantId: string, agentId: string): Promise<void> {
    await pool.query(`DELETE FROM public.ai_agents WHERE id = $1 AND tenant_id = $2`, [agentId, tenantId]);
  }

  private mapFlow(row: any): IVRFlow {
    return {
      id: row.id, tenantId: row.tenant_id, name: row.name, active: row.active,
      greeting: row.greeting, steps: row.steps || [], createdAt: row.created_at, updatedAt: row.updated_at,
    };
  }

  private mapAgent(row: any): AIAgent {
    return {
      id: row.id, tenantId: row.tenant_id, name: row.name, role: row.role,
      systemPrompt: row.system_prompt, voiceId: row.voice_id, tone: row.tone,
      services: row.services || [], maxDurationSeconds: row.max_duration_seconds,
      transferOnTimeout: row.transfer_on_timeout, transferNumber: row.transfer_number,
      knowledgeCategory: row.knowledge_category, active: row.active,
      createdAt: row.created_at, updatedAt: row.updated_at,
    };
  }
}

export const ivrService = new IVRService();

