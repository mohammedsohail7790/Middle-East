import express, { Router } from 'express';
import { asyncHandler } from '../../middleware/index.js';
import { logger } from '../logger.js';
import { adminEmail } from './admin-access.js';
import { createDraft, getProposal, listProposals, markSent, PROPOSAL_STATUSES, ProposalValidationError, revertToDraft, updateDraft, withdraw } from './proposal-store.js';
import { moveLeadStatus, proposalLink, sendProposalToClient } from './proposal-mail.js';

/**
 * Team-side consultancy API: proposals. Mounted at /api/v1/consultancy-admin/proposals behind requireConsultancyAdmin (see consultancy-admin.router.ts),
 * so every route here is already limited to the team.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Pool = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };

export function createProposalsRouter(deps?: { pool?: Pool }): Router {
  const router = Router();
  router.use(express.json({ limit: '200kb' }));
  const getPool = async (): Promise<Pool> => deps?.pool ?? ((await import('../db/pool.js')).pool as unknown as Pool);
  const fail = (res: any, status: number, error: string) => res.status(status).json({ success: false, error });

  const leadOf = async (pool: Pool, id: string) => {
    const r = await pool.query(`SELECT id, company, contact_name, email FROM consultancy_leads WHERE id = $1`, [id]);
    return r.rows[0] as { id: string; company: string | null; contact_name: string | null; email: string | null } | undefined;
  };

  /** Runs a handler and turns validation errors into a 400 with the reason. */
  const guarded = (fn: (req: any, res: any) => Promise<unknown>) =>
    asyncHandler(async (req: any, res: any) => {
      try {
        await fn(req, res);
      } catch (e) {
        if (e instanceof ProposalValidationError) return fail(res, 400, e.message);
        throw e;
      }
    });

  router.get(
    '/',
    guarded(async (req, res) => {
      const leadId = typeof req.query.leadId === 'string' ? req.query.leadId : undefined;
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      if (leadId && !UUID.test(leadId)) return fail(res, 400, 'leadId is not valid');
      if (status && !(PROPOSAL_STATUSES as readonly string[]).includes(status)) return fail(res, 400, 'status is not valid');
      const rows = await listProposals(await getPool(), { leadId, status });
      res.json({ success: true, data: rows });
    }),
  );

  router.post(
    '/',
    guarded(async (req, res) => {
      const body = req.body ?? {};
      const leadId = String(body.leadId ?? '');
      if (!UUID.test(leadId)) return fail(res, 400, 'leadId is required');
      const pool = await getPool();
      if (!(await leadOf(pool, leadId))) return fail(res, 404, 'Lead not found');
      const row = await createDraft(pool, leadId, body, adminEmail(req) || null);
      res.status(201).json({ success: true, data: row });
    }),
  );

  router.get(
    '/:id',
    guarded(async (req, res) => {
      if (!UUID.test(req.params.id)) return fail(res, 404, 'Not found');
      const row = await getProposal(await getPool(), req.params.id);
      if (!row) return fail(res, 404, 'Not found');
      res.json({ success: true, data: row });
    }),
  );

  router.patch(
    '/:id',
    guarded(async (req, res) => {
      if (!UUID.test(req.params.id)) return fail(res, 404, 'Not found');
      const pool = await getPool();
      const existing = await getProposal(pool, req.params.id);
      if (!existing) return fail(res, 404, 'Not found');
      if (existing.status !== 'draft') return fail(res, 409, 'Only a draft can be edited. Withdraw this proposal and create a new one.');
      const row = await updateDraft(pool, req.params.id, req.body ?? {});
      if (!row) return fail(res, 409, 'Only a draft can be edited.');
      res.json({ success: true, data: row });
    }),
  );

  router.post(
    '/:id/send',
    guarded(async (req, res) => {
      if (!UUID.test(req.params.id)) return fail(res, 404, 'Not found');
      const pool = await getPool();
      const existing = await getProposal(pool, req.params.id);
      if (!existing) return fail(res, 404, 'Not found');
      if (existing.status !== 'draft') return fail(res, 409, `This proposal is ${existing.status}; only a draft can be sent.`);
      if (new Date(existing.valid_until).getTime() <= Date.now()) return fail(res, 409, 'The valid-until date has passed. Edit the draft to a future date first.');
      const lead = await leadOf(pool, existing.lead_id);
      if (!lead?.email) return fail(res, 400, 'The lead has no email address to send the proposal to.');
      const contact = { email: lead.email, company: lead.company, contactName: lead.contact_name };
      const link = proposalLink(existing, contact);
      if (!link) return fail(res, 503, 'AUDIT_LINK_SECRET is not set, so a client link cannot be made.');
      const sent = await markSent(pool, existing.id);
      if (!sent) return fail(res, 409, 'This proposal can no longer be sent.');
      let emailed = false;
      try {
        emailed = (await sendProposalToClient(sent, contact, link)) === 'sent';
      } catch (e) {
        logger.error('[Proposal] Failed to email the proposal', undefined, e instanceof Error ? e : new Error(String(e)));
        await revertToDraft(pool, sent.id).catch(() => undefined);
        return fail(res, 502, 'The email could not be delivered, so the proposal is still a draft. Try again.');
      }
      await moveLeadStatus(pool, lead.email, 'proposal_sent');
      res.json({ success: true, data: { proposal: sent, link, emailed } });
    }),
  );

  /** The client link of a sent proposal, so the team can copy it again later. */
  router.get(
    '/:id/link',
    guarded(async (req, res) => {
      if (!UUID.test(req.params.id)) return fail(res, 404, 'Not found');
      const pool = await getPool();
      const row = await getProposal(pool, req.params.id);
      if (!row) return fail(res, 404, 'Not found');
      if (row.status !== 'sent' && row.status !== 'accepted') return fail(res, 409, 'Only a sent proposal has a client link.');
      const lead = await leadOf(pool, row.lead_id);
      if (!lead?.email) return fail(res, 400, 'The lead has no email address.');
      const link = proposalLink(row, { email: lead.email, company: lead.company, contactName: lead.contact_name });
      if (!link) return fail(res, 503, 'AUDIT_LINK_SECRET is not set, so a client link cannot be made.');
      res.json({ success: true, data: { link } });
    }),
  );

  router.post(
    '/:id/withdraw',
    guarded(async (req, res) => {
      if (!UUID.test(req.params.id)) return fail(res, 404, 'Not found');
      const pool = await getPool();
      const existing = await getProposal(pool, req.params.id);
      if (!existing) return fail(res, 404, 'Not found');
      const row = await withdraw(pool, req.params.id);
      if (!row) return fail(res, 409, `This proposal is ${existing.status} and cannot be withdrawn.`);
      res.json({ success: true, data: row });
    }),
  );

  return router;
}
