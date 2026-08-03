/**
 * QA / Supervisor Service
 * Quality assurance evaluations and rubrics for call review.
 */

import { pool } from '../db/pool.js';

export interface QAEvaluation {
  id: string;
  callId: string;
  tenantId: string;
  sentiment: string;
  sentimentScore: number;
  frustrationLevel: number;
  callSuccess: boolean;
  leadQuality: string;
  summary: string | null;
  supervisorScore: number | null;
  supervisorNotes: string | null;
  supervisorId: string | null;
  flagged: boolean;
  flagReason: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
}

export interface QARubric {
  id: string;
  tenantId: string;
  name: string;
  criteria: Array<{ id: string; label: string; weight: number; description: string }>;
  active: boolean;
  createdAt: Date;
}

export class QAService {
  /**
   * Store or update AI post-call evaluation (sentiment, quality, summary).
   */
  async recordAiEvaluation(args: {
    callId: string;
    tenantId: string;
    sentiment: string;
    sentimentScore: number;
    frustrationLevel: number;
    callSuccess: boolean;
    leadQuality: string;
    summary: string;
  }): Promise<void> {
    await pool.query(
      `INSERT INTO public.call_evaluations (
         call_id, tenant_id, sentiment, sentiment_score, frustration_level,
         call_success, lead_quality, summary
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (call_id) DO UPDATE SET
         sentiment = EXCLUDED.sentiment,
         sentiment_score = EXCLUDED.sentiment_score,
         frustration_level = EXCLUDED.frustration_level,
         call_success = EXCLUDED.call_success,
         lead_quality = EXCLUDED.lead_quality,
         summary = EXCLUDED.summary`,
      [
        args.callId,
        args.tenantId,
        args.sentiment,
        args.sentimentScore,
        args.frustrationLevel,
        args.callSuccess,
        args.leadQuality,
        args.summary || null,
      ]
    );
  }

  /**
   * Submit a supervisor evaluation for a call.
   */
  async submitEvaluation(args: {
    callId: string;
    tenantId: string;
    supervisorId: string;
    score: number;
    notes?: string;
    flagged?: boolean;
    flagReason?: string;
  }): Promise<QAEvaluation> {
    const result = await pool.query(
      `INSERT INTO public.call_evaluations (call_id, tenant_id, supervisor_id, supervisor_score, supervisor_notes, flagged, flag_reason, reviewed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (call_id) DO UPDATE SET
         supervisor_id = $3,
         supervisor_score = $4,
         supervisor_notes = $5,
         flagged = $6,
         flag_reason = $7,
         reviewed_at = NOW()
       RETURNING id, call_id, tenant_id, sentiment, sentiment_score, frustration_level, call_success, lead_quality, summary, supervisor_score, supervisor_notes, supervisor_id, flagged, flag_reason, reviewed_at, created_at`,
      [args.callId, args.tenantId, args.supervisorId, args.score, args.notes || null, args.flagged || false, args.flagReason || null]
    );

    return this.mapRow(result.rows[0]);
  }

  /**
   * Get evaluations for a tenant with filters.
   */
  async getEvaluations(tenantId: string, options: { limit?: number; offset?: number; reviewed?: boolean; flagged?: boolean }): Promise<QAEvaluation[]> {
    const { limit = 50, offset = 0, reviewed, flagged } = options;
    let query = `
      SELECT id, call_id, tenant_id, sentiment, sentiment_score, frustration_level, call_success, lead_quality, summary, supervisor_score, supervisor_notes, supervisor_id, flagged, flag_reason, reviewed_at, created_at
      FROM public.call_evaluations
      WHERE tenant_id = $1
    `;
    const values: any[] = [tenantId];
    let i = 2;

    if (reviewed !== undefined) {
      query += ` AND reviewed_at IS ${reviewed ? 'NOT' : ''} NULL`;
    }
    if (flagged !== undefined) {
      query += ` AND flagged = $${i++}`;
      values.push(flagged);
    }

    query += ` ORDER BY reviewed_at DESC NULLS LAST, created_at DESC LIMIT $${i++} OFFSET $${i++}`;
    values.push(limit, offset);

    const result = await pool.query(query, values);
    return result.rows.map((row: any) => this.mapRow(row));
  }

  /**
   * Get QA stats for a tenant.
   */
  async getStats(tenantId: string): Promise<{
    totalEvaluated: number;
    avgSupervisorScore: number;
    flaggedCount: number;
    avgAIScore: number;
  }> {
    const result = await pool.query(
      `SELECT 
         COUNT(*) FILTER (WHERE reviewed_at IS NOT NULL) as total_evaluated,
         AVG(supervisor_score) FILTER (WHERE supervisor_score IS NOT NULL) as avg_supervisor_score,
         COUNT(*) FILTER (WHERE flagged = true) as flagged_count,
         AVG(sentiment_score) as avg_ai_score
       FROM public.call_evaluations
       WHERE tenant_id = $1`,
      [tenantId]
    );

    const row = result.rows[0];
    return {
      totalEvaluated: parseInt(row.total_evaluated || 0, 10),
      avgSupervisorScore: parseFloat(row.avg_supervisor_score || 0),
      flaggedCount: parseInt(row.flagged_count || 0, 10),
      avgAIScore: parseFloat(row.avg_ai_score || 0),
    };
  }

  // ── QA Rubrics ─────────────────────────────────────────────────────

  async createRubric(tenantId: string, data: { name: string; criteria: any[] }): Promise<QARubric> {
    const result = await pool.query(
      `INSERT INTO public.qa_rubrics (tenant_id, name, criteria)
       VALUES ($1, $2, $3)
       RETURNING id, tenant_id, name, criteria, active, created_at`,
      [tenantId, data.name, JSON.stringify(data.criteria)]
    );

    return this.mapRubric(result.rows[0]);
  }

  async listRubrics(tenantId: string): Promise<QARubric[]> {
    const result = await pool.query(
      `SELECT id, tenant_id, name, criteria, active, created_at
       FROM public.qa_rubrics
       WHERE tenant_id = $1
       ORDER BY created_at DESC`,
      [tenantId]
    );

    return result.rows.map((row: any) => this.mapRubric(row));
  }

  async updateRubric(tenantId: string, rubricId: string, data: { name?: string; criteria?: any[]; active?: boolean }): Promise<QARubric> {
    const fields: string[] = [];
    const values: any[] = [];
    let i = 1;

    if (data.name !== undefined) { fields.push(`name = $${i++}`); values.push(data.name); }
    if (data.criteria !== undefined) { fields.push(`criteria = $${i++}`); values.push(JSON.stringify(data.criteria)); }
    if (data.active !== undefined) { fields.push(`active = $${i++}`); values.push(data.active); }
    fields.push(`updated_at = NOW()`);
    values.push(rubricId, tenantId);

    const result = await pool.query(
      `UPDATE public.qa_rubrics SET ${fields.join(', ')} WHERE id = $${i++} AND tenant_id = $${i++}
       RETURNING id, tenant_id, name, criteria, active, created_at`,
      values
    );

    if (result.rows.length === 0) throw new Error('Rubric not found');
    return this.mapRubric(result.rows[0]);
  }

  async deleteRubric(tenantId: string, rubricId: string): Promise<void> {
    await pool.query(`DELETE FROM public.qa_rubrics WHERE id = $1 AND tenant_id = $2`, [rubricId, tenantId]);
  }

  private mapRow(row: any): QAEvaluation {
    return {
      id: row.id,
      callId: row.call_id,
      tenantId: row.tenant_id,
      sentiment: row.sentiment,
      sentimentScore: row.sentiment_score,
      frustrationLevel: row.frustration_level,
      callSuccess: row.call_success,
      leadQuality: row.lead_quality,
      summary: row.summary,
      supervisorScore: row.supervisor_score,
      supervisorNotes: row.supervisor_notes,
      supervisorId: row.supervisor_id,
      flagged: row.flagged,
      flagReason: row.flag_reason,
      reviewedAt: row.reviewed_at,
      createdAt: row.created_at,
    };
  }

  private mapRubric(row: any): QARubric {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      criteria: row.criteria || [],
      active: row.active,
      createdAt: row.created_at,
    };
  }
}

export const qaService = new QAService();

