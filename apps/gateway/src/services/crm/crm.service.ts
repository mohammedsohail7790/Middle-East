/**
 * CRM Service
 * Tenant-scoped CRUD for the Phase 1 GCC skeleton CRM tables:
 * pipeline stages, companies, contacts, deals. Additive backend for the
 * dashboard CRM skeleton pages. No business logic beyond CRUD yet.
 */

import { voiceDb } from '../voice/tenant-scope.js';

export interface CrmPipelineStage {
  id: string;
  tenantId: string;
  name: string;
  position: number;
  createdAt: Date;
}

export interface CrmCompany {
  id: string;
  tenantId: string;
  name: string;
  website: string | null;
  industry: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CrmContact {
  id: string;
  tenantId: string;
  companyId: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CrmDeal {
  id: string;
  tenantId: string;
  stageId: string | null;
  contactId: string | null;
  companyId: string | null;
  title: string;
  value: number;
  currency: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const STAGE_COLUMNS = 'id, tenant_id, name, position, created_at';
const COMPANY_COLUMNS = 'id, tenant_id, name, website, industry, notes, created_at, updated_at';
const CONTACT_COLUMNS = 'id, tenant_id, company_id, name, phone, email, notes, created_at, updated_at';
const DEAL_COLUMNS = 'id, tenant_id, stage_id, contact_id, company_id, title, value, currency, notes, created_at, updated_at';

export class CrmService {
  // ---- Pipeline stages ----

  async listStages(tenantId: string): Promise<CrmPipelineStage[]> {
    const result = await voiceDb.query(
      `SELECT ${STAGE_COLUMNS} FROM public.crm_pipeline_stages
       WHERE tenant_id = $1 ORDER BY position ASC, created_at ASC`,
      [tenantId]
    );
    return result.rows.map((row: any) => this.mapStage(row));
  }

  async createStage(tenantId: string, name: string, position?: number): Promise<CrmPipelineStage> {
    const result = await voiceDb.query(
      `INSERT INTO public.crm_pipeline_stages (tenant_id, name, position)
       VALUES ($1, $2, $3)
       RETURNING ${STAGE_COLUMNS}`,
      [tenantId, name, position ?? 0]
    );
    return this.mapStage(result.rows[0]);
  }

  async updateStage(
    tenantId: string,
    stageId: string,
    fields: { name?: string; position?: number }
  ): Promise<CrmPipelineStage | null> {
    const updates: string[] = [];
    const values: unknown[] = [tenantId, stageId];
    if (fields.name !== undefined) {
      values.push(fields.name);
      updates.push(`name = $${values.length}`);
    }
    if (fields.position !== undefined) {
      values.push(fields.position);
      updates.push(`position = $${values.length}`);
    }
    if (updates.length === 0) return null;
    const result = await voiceDb.query(
      `UPDATE public.crm_pipeline_stages SET ${updates.join(', ')}
       WHERE tenant_id = $1 AND id = $2
       RETURNING ${STAGE_COLUMNS}`,
      values
    );
    return result.rows[0] ? this.mapStage(result.rows[0]) : null;
  }

  async deleteStage(tenantId: string, stageId: string): Promise<boolean> {
    const result = await voiceDb.query(
      'DELETE FROM public.crm_pipeline_stages WHERE tenant_id = $1 AND id = $2',
      [tenantId, stageId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  // ---- Companies ----

  async listCompanies(tenantId: string): Promise<CrmCompany[]> {
    const result = await voiceDb.query(
      `SELECT ${COMPANY_COLUMNS} FROM public.crm_companies
       WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId]
    );
    return result.rows.map((row: any) => this.mapCompany(row));
  }

  async createCompany(
    tenantId: string,
    fields: { name: string; website?: string; industry?: string; notes?: string }
  ): Promise<CrmCompany> {
    const result = await voiceDb.query(
      `INSERT INTO public.crm_companies (tenant_id, name, website, industry, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${COMPANY_COLUMNS}`,
      [tenantId, fields.name, fields.website ?? null, fields.industry ?? null, fields.notes ?? null]
    );
    return this.mapCompany(result.rows[0]);
  }

  async updateCompany(
    tenantId: string,
    companyId: string,
    fields: { name?: string; website?: string; industry?: string; notes?: string }
  ): Promise<CrmCompany | null> {
    const updates: string[] = [];
    const values: unknown[] = [tenantId, companyId];
    const push = (key: string, value: unknown) => {
      values.push(value);
      updates.push(`${key} = $${values.length}`);
    };
    if (fields.name !== undefined) push('name', fields.name);
    if (fields.website !== undefined) push('website', fields.website);
    if (fields.industry !== undefined) push('industry', fields.industry);
    if (fields.notes !== undefined) push('notes', fields.notes);
    if (updates.length === 0) return null;
    const result = await voiceDb.query(
      `UPDATE public.crm_companies SET ${updates.join(', ')}, updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2
       RETURNING ${COMPANY_COLUMNS}`,
      values
    );
    return result.rows[0] ? this.mapCompany(result.rows[0]) : null;
  }

  async deleteCompany(tenantId: string, companyId: string): Promise<boolean> {
    const result = await voiceDb.query(
      'DELETE FROM public.crm_companies WHERE tenant_id = $1 AND id = $2',
      [tenantId, companyId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  // ---- Contacts ----

  async listContacts(tenantId: string): Promise<CrmContact[]> {
    const result = await voiceDb.query(
      `SELECT ${CONTACT_COLUMNS} FROM public.crm_contacts
       WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId]
    );
    return result.rows.map((row: any) => this.mapContact(row));
  }

  async createContact(
    tenantId: string,
    fields: { name: string; companyId?: string; phone?: string; email?: string; notes?: string }
  ): Promise<CrmContact> {
    const result = await voiceDb.query(
      `INSERT INTO public.crm_contacts (tenant_id, company_id, name, phone, email, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${CONTACT_COLUMNS}`,
      [tenantId, fields.companyId ?? null, fields.name, fields.phone ?? null, fields.email ?? null, fields.notes ?? null]
    );
    return this.mapContact(result.rows[0]);
  }

  async updateContact(
    tenantId: string,
    contactId: string,
    fields: { name?: string; companyId?: string; phone?: string; email?: string; notes?: string }
  ): Promise<CrmContact | null> {
    const updates: string[] = [];
    const values: unknown[] = [tenantId, contactId];
    const push = (key: string, value: unknown) => {
      values.push(value);
      updates.push(`${key} = $${values.length}`);
    };
    if (fields.name !== undefined) push('name', fields.name);
    if (fields.companyId !== undefined) push('company_id', fields.companyId);
    if (fields.phone !== undefined) push('phone', fields.phone);
    if (fields.email !== undefined) push('email', fields.email);
    if (fields.notes !== undefined) push('notes', fields.notes);
    if (updates.length === 0) return null;
    const result = await voiceDb.query(
      `UPDATE public.crm_contacts SET ${updates.join(', ')}, updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2
       RETURNING ${CONTACT_COLUMNS}`,
      values
    );
    return result.rows[0] ? this.mapContact(result.rows[0]) : null;
  }

  async deleteContact(tenantId: string, contactId: string): Promise<boolean> {
    const result = await voiceDb.query(
      'DELETE FROM public.crm_contacts WHERE tenant_id = $1 AND id = $2',
      [tenantId, contactId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  // ---- Deals ----

  async listDeals(tenantId: string): Promise<CrmDeal[]> {
    const result = await voiceDb.query(
      `SELECT ${DEAL_COLUMNS} FROM public.crm_deals
       WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId]
    );
    return result.rows.map((row: any) => this.mapDeal(row));
  }

  async createDeal(
    tenantId: string,
    fields: {
      title: string;
      stageId?: string;
      contactId?: string;
      companyId?: string;
      value?: number;
      currency?: string;
      notes?: string;
    }
  ): Promise<CrmDeal> {
    const result = await voiceDb.query(
      `INSERT INTO public.crm_deals (tenant_id, stage_id, contact_id, company_id, title, value, currency, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ${DEAL_COLUMNS}`,
      [
        tenantId,
        fields.stageId ?? null,
        fields.contactId ?? null,
        fields.companyId ?? null,
        fields.title,
        fields.value ?? 0,
        fields.currency ?? 'USD',
        fields.notes ?? null,
      ]
    );
    return this.mapDeal(result.rows[0]);
  }

  async updateDeal(
    tenantId: string,
    dealId: string,
    fields: {
      title?: string;
      stageId?: string;
      contactId?: string;
      companyId?: string;
      value?: number;
      currency?: string;
      notes?: string;
    }
  ): Promise<CrmDeal | null> {
    const updates: string[] = [];
    const values: unknown[] = [tenantId, dealId];
    const push = (key: string, value: unknown) => {
      values.push(value);
      updates.push(`${key} = $${values.length}`);
    };
    if (fields.title !== undefined) push('title', fields.title);
    if (fields.stageId !== undefined) push('stage_id', fields.stageId);
    if (fields.contactId !== undefined) push('contact_id', fields.contactId);
    if (fields.companyId !== undefined) push('company_id', fields.companyId);
    if (fields.value !== undefined) push('value', fields.value);
    if (fields.currency !== undefined) push('currency', fields.currency);
    if (fields.notes !== undefined) push('notes', fields.notes);
    if (updates.length === 0) return null;
    const result = await voiceDb.query(
      `UPDATE public.crm_deals SET ${updates.join(', ')}, updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2
       RETURNING ${DEAL_COLUMNS}`,
      values
    );
    return result.rows[0] ? this.mapDeal(result.rows[0]) : null;
  }

  async deleteDeal(tenantId: string, dealId: string): Promise<boolean> {
    const result = await voiceDb.query(
      'DELETE FROM public.crm_deals WHERE tenant_id = $1 AND id = $2',
      [tenantId, dealId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  // ---- Mappers ----

  private mapStage(row: any): CrmPipelineStage {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      position: row.position,
      createdAt: row.created_at,
    };
  }

  private mapCompany(row: any): CrmCompany {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      website: row.website,
      industry: row.industry,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapContact(row: any): CrmContact {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      companyId: row.company_id,
      name: row.name,
      phone: row.phone,
      email: row.email,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapDeal(row: any): CrmDeal {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      stageId: row.stage_id,
      contactId: row.contact_id,
      companyId: row.company_id,
      title: row.title,
      value: Number(row.value),
      currency: row.currency,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const crmService = new CrmService();
