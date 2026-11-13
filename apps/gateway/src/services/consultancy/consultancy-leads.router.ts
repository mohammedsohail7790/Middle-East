import { Router, json } from 'express';
import type { Pool } from 'pg';
import { logger } from '../logger.js';
import { adminEmail } from './admin-access.js';
import { countByStatus, createLead, getAuditSummaryByEmail, getLead, isLeadStatus, listLeads, updateLead, type LeadPatch } from './lead-store.js';

/**
 * Team-side consultancy API: leads. Mounted at /api/v1/consultancy-admin/leads behind requireConsultancyAdmin (see consultancy-admin.router.ts),
 * so every route here is already limited to the team. Answers are always `{ success, data }` or `{ success: false, error }`.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Fail = { error: string };
const isFail = (v: unknown): v is Fail => !!v && typeof v === 'object' && 'error' in (v as object);

function text(body: Record<string, unknown>, key: string, max: number): string | null | undefined | Fail {
  if (!(key in body) || body[key] === undefined) return undefined;
  const v = body[key];
  if (v === null) return null;
  if (typeof v !== 'string') return { error: `${key} must be text` };
  if (v.length > max) return { error: `${key} is too long (max ${max} characters)` };
  return v.trim() || null;
}

function emailField(body: Record<string, unknown>, key: string): string | null | undefined | Fail {
  const v = text(body, key, 254);
  if (v && !isFail(v) && !EMAIL.test(v)) return { error: `${key} is not a valid email address` };
  return v;
}

/** Only status, notes and owner_email are accepted; anything else is an error rather than silently ignored. */
export function parsePatch(body: unknown): LeadPatch | Fail {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Send a JSON object' };
  const b = body as Record<string, unknown>;
  const extra = Object.keys(b).filter((k) => !['status', 'notes', 'owner_email'].includes(k));
  if (extra.length) return { error: `Cannot change: ${extra.join(', ')}` };
  const patch: LeadPatch = {};
  if ('status' in b) {
    if (!isLeadStatus(b.status)) return { error: 'status is not one of the allowed values' };
    patch.status = b.status;
  }
  const notes = text(b, 'notes', 5000);
  if (isFail(notes)) return notes;
  if (notes !== undefined) patch.notes = notes;
  const owner = emailField(b, 'owner_email');
  if (isFail(owner)) return owner;
  if (owner !== undefined) patch.owner_email = owner;
  if (!Object.keys(patch).length) return { error: 'Nothing to change' };
  return patch;
}

export function parseManualLead(body: unknown): { company: string | null; contact_name: string | null; email: string | null; phone: string | null; country: string | null; notes: string | null } | Fail {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Send a JSON object' };
  const b = body as Record<string, unknown>;
  const out: Record<string, string | null> = {};
  for (const [key, max] of [['company', 200], ['contact_name', 200], ['phone', 40], ['country', 80], ['notes', 5000]] as const) {
    const v = text(b, key, max);
    if (isFail(v)) return v;
    out[key] = v ?? null;
  }
  const email = emailField(b, 'email');
  if (isFail(email)) return email;
  out.email = email ?? null;
  if (!out.company && !out.contact_name && !out.email) return { error: 'Give at least a company, a contact name or an email' };
  return out as ReturnType<typeof parseManualLead> & object;
}

export function createLeadsRouter(deps: { pool?: Pick<Pool, 'query'> } = {}): Router {
  const router = Router();
  router.use(json({ limit: '50kb' }));

  const db = async (): Promise<Pick<Pool, 'query'>> => deps.pool ?? (await import('../db/pool.js')).pool;
  const fail = (res: any, status: number, error: string) => res.status(status).json({ success: false, error });
  const crash = (res: any, what: string, error: unknown) => {
    logger.error(`[ConsultancyLeads] ${what} failed`, undefined, error instanceof Error ? new Error(error.name) : undefined);
    fail(res, 500, 'Something went wrong. Please try again.');
  };

  router.get('/', async (req, res) => {
    const status = req.query.status;
    if (status !== undefined && status !== '' && !isLeadStatus(status)) return fail(res, 400, 'status is not one of the allowed values');
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    try {
      const pool = await db();
      const [list, counts] = await Promise.all([
        listLeads(pool, { status: isLeadStatus(status) ? status : undefined, q, limit: req.query.limit as string, offset: req.query.offset as string }),
        countByStatus(pool),
      ]);
      res.json({ success: true, data: { items: list.items, total: list.total, counts } });
    } catch (error) {
      crash(res, 'List', error);
    }
  });

  router.post('/', async (req, res) => {
    const lead = parseManualLead(req.body);
    if (isFail(lead)) return fail(res, 400, lead.error);
    try {
      const row = await createLead(await db(), { source: 'manual', ...lead, owner_email: adminEmail(req) || null });
      res.status(201).json({ success: true, data: row });
    } catch (error) {
      crash(res, 'Create', error);
    }
  });

  router.get('/:id', async (req, res) => {
    if (!UUID.test(req.params.id)) return fail(res, 404, 'Lead not found');
    try {
      const pool = await db();
      const lead = await getLead(pool, req.params.id);
      if (!lead) return fail(res, 404, 'Lead not found');
      const audit = await getAuditSummaryByEmail(pool, lead.email).catch(() => null);
      res.json({ success: true, data: { lead, audit } });
    } catch (error) {
      crash(res, 'Get', error);
    }
  });

  router.patch('/:id', async (req, res) => {
    if (!UUID.test(req.params.id)) return fail(res, 404, 'Lead not found');
    const patch = parsePatch(req.body);
    if (isFail(patch)) return fail(res, 400, patch.error);
    try {
      const lead = await updateLead(await db(), req.params.id, patch);
      if (!lead) return fail(res, 404, 'Lead not found');
      res.json({ success: true, data: lead });
    } catch (error) {
      crash(res, 'Update', error);
    }
  });

  return router;
}
