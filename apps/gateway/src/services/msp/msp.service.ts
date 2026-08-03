import { pool } from '../db/pool.js';

/**
 * MSP / Reseller Service
 * Manages parent-child tenant relationships for agencies and MSPs.
 */

export interface MSPTenant {
  id: string;
  parentTenantId: string;
  childTenantId: string;
  relationshipType: string;
  markupPercentage: number;
  customBranding: Record<string, any>;
  notes: string | null;
  createdAt: Date;
}

export class MSPService {
  async addRelationship(parentTenantId: string, childTenantId: string, data: {
    relationshipType?: string; markupPercentage?: number; customBranding?: Record<string, any>; notes?: string;
  }): Promise<MSPTenant> {
    const result = await pool.query(
      `INSERT INTO public.msp_tenants (parent_tenant_id, child_tenant_id, relationship_type, markup_percentage, custom_branding, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, parent_tenant_id, child_tenant_id, relationship_type, markup_percentage, custom_branding, notes, created_at`,
      [
        parentTenantId, childTenantId, data.relationshipType || 'managed',
        data.markupPercentage || 0, JSON.stringify(data.customBranding || {}), data.notes || null,
      ]
    );
    return this.mapRow(result.rows[0]);
  }

  async getChildTenants(parentTenantId: string): Promise<MSPTenant[]> {
    const result = await pool.query(
      `SELECT id, parent_tenant_id, child_tenant_id, relationship_type, markup_percentage, custom_branding, notes, created_at
       FROM public.msp_tenants WHERE parent_tenant_id = $1 ORDER BY created_at DESC`,
      [parentTenantId]
    );
    return result.rows.map((row: any) => this.mapRow(row));
  }

  async getParentTenants(childTenantId: string): Promise<MSPTenant[]> {
    const result = await pool.query(
      `SELECT id, parent_tenant_id, child_tenant_id, relationship_type, markup_percentage, custom_branding, notes, created_at
       FROM public.msp_tenants WHERE child_tenant_id = $1`,
      [childTenantId]
    );
    return result.rows.map((row: any) => this.mapRow(row));
  }

  async updateRelationship(parentTenantId: string, mspId: string, data: Partial<{
    relationshipType: string; markupPercentage: number; customBranding: Record<string, any>; notes: string;
  }>): Promise<MSPTenant> {
    const fields: string[] = [];
    const values: any[] = [];
    let i = 1;
    if (data.relationshipType !== undefined) { fields.push(`relationship_type = $${i++}`); values.push(data.relationshipType); }
    if (data.markupPercentage !== undefined) { fields.push(`markup_percentage = $${i++}`); values.push(data.markupPercentage); }
    if (data.customBranding !== undefined) { fields.push(`custom_branding = $${i++}`); values.push(JSON.stringify(data.customBranding)); }
    if (data.notes !== undefined) { fields.push(`notes = $${i++}`); values.push(data.notes); }
    values.push(mspId, parentTenantId);

    const result = await pool.query(
      `UPDATE public.msp_tenants SET ${fields.join(', ')} WHERE id = $${i++} AND parent_tenant_id = $${i++}
       RETURNING id, parent_tenant_id, child_tenant_id, relationship_type, markup_percentage, custom_branding, notes, created_at`,
      values
    );
    if (result.rows.length === 0) throw new Error('MSP relationship not found');
    return this.mapRow(result.rows[0]);
  }

  async removeRelationship(parentTenantId: string, mspId: string): Promise<void> {
    await pool.query(`DELETE FROM public.msp_tenants WHERE id = $1 AND parent_tenant_id = $2`, [mspId, parentTenantId]);
  }

  async getDashboard(parentTenantId: string): Promise<any> {
    const result = await pool.query(`SELECT * FROM public.get_msp_dashboard($1)`, [parentTenantId]);
    return result.rows[0] || {};
  }

  private mapRow(row: any): MSPTenant {
    return {
      id: row.id, parentTenantId: row.parent_tenant_id, childTenantId: row.child_tenant_id,
      relationshipType: row.relationship_type, markupPercentage: Number(row.markup_percentage),
      customBranding: row.custom_branding || {}, notes: row.notes, createdAt: row.created_at,
    };
  }
}

export const mspService = new MSPService();

