import express, { Router } from 'express';
import { asyncHandler, MiddlewareFactory } from '../../middleware/index.js';
import { logger } from '../logger.js';
import { verifyLink, type LinkPayload } from '../audit/signed-link.js';
import { getProposal, recordAcceptance, recordDecline, termsHash, type ProposalRow } from './proposal-store.js';
import { proposalText, renderMessagePage, renderProposalPage } from './proposal-pages.js';
import { moveLeadStatus, sendAcceptanceToClient, sendAcceptanceToTeam } from './proposal-mail.js';

/**
 * The proposal page a client opens from a private signed link, plus accepting or declining it. Mounted at /api/v1/public/proposal and listed in the public allowlist
 * (middleware/api-auth-unless-public.ts), so these routes carry no login: every one of them verifies its signed link itself (kind "proposal", not expired) before
 * touching the database, and a missing proposal looks exactly like a bad link, so nobody can find out whether an id exists.
 */
type Pool = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };

const readLimit = MiddlewareFactory.createRateLimit({ windowMs: 15 * 60 * 1000, max: 60, message: 'Too many requests. Please try again later.' });
const writeLimit = MiddlewareFactory.createRateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: 'Too many requests. Please try again later or email hello@hallaai.com.' });

type Checked = { ok: boolean; payload?: LinkPayload; status?: number; kind?: 'invalid' | 'expired' | 'unavailable' };

function checkLink(token: unknown): Checked {
  const secret = process.env.AUDIT_LINK_SECRET;
  if (!secret) return { ok: false, status: 503, kind: 'unavailable' };
  const r = verifyLink(typeof token === 'string' ? token : '', secret);
  if (!r.ok) return { ok: false, status: (r as { reason: string }).reason === 'expired' ? 410 : 400, kind: (r as { reason: string }).reason === 'expired' ? 'expired' : 'invalid' };
  const payload = (r as { payload: LinkPayload }).payload;
  if (payload.k !== 'proposal') return { ok: false, status: 400, kind: 'invalid' };
  return { ok: true, payload };
}

const wantsHtml = (req: any): boolean => !String(req.headers['content-type'] ?? '').includes('application/json');

export function createPublicProposalRouter(deps?: { pool?: Pool }): Router {
  const router = Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store').set('Referrer-Policy', 'no-referrer');
    next();
  });
  router.use(express.urlencoded({ extended: false, limit: '20kb' }));
  router.use(express.json({ limit: '20kb' }));
  const getPool = async (): Promise<Pool> => deps?.pool ?? ((await import('../db/pool.js')).pool as unknown as Pool);

  /** Answers a failed link check, as a page for the browser and as JSON for a script. */
  const refuse = (req: any, res: any, c: Checked) => {
    const t = proposalText('en');
    const text = c.kind === 'unavailable' ? 'This service is not set up yet. Please email hello@hallaai.com.' : c.kind === 'expired' ? t.expiredLinkBody : t.invalidBody;
    const title = c.kind === 'expired' ? t.expiredTitle : t.invalidTitle;
    if (wantsHtml(req)) return res.status(c.status ?? 400).type('html').send(renderMessagePage('en', title, text, 'bad'));
    return res.status(c.status ?? 400).json({ success: false, error: text });
  };

  /** The proposal this link is for, or null (same answer for "no such proposal" and "wrong link"). */
  const load = async (payload: LinkPayload): Promise<ProposalRow | null> => getProposal(await getPool(), payload.id);
  const notFound = (req: any, res: any) => refuse(req, res, { ok: false, status: 400, kind: 'invalid' });

  router.get(
    '/',
    readLimit,
    asyncHandler(async (req: any, res: any) => {
      const c = checkLink(req.query.t);
      if (!c.ok) return refuse(req, res, c);
      const row = await load(c.payload!);
      if (!row) return notFound(req, res);
      const status = row.status === 'expired' ? 410 : 200;
      res.status(status).type('html').send(renderProposalPage(row, String(req.query.t)));
    }),
  );

  router.post(
    '/accept',
    writeLimit,
    asyncHandler(async (req: any, res: any) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const token = String(body.t ?? '');
      const c = checkLink(token);
      if (!c.ok) return refuse(req, res, c);
      const pool = await getPool();
      const row = await getProposal(pool, c.payload!.id);
      if (!row) return notFound(req, res);
      const t = proposalText(row.language);
      const html = wantsHtml(req);
      const reply = (status: number, title: string, text: string, tone: 'good' | 'bad' | 'info' = 'bad', code?: string) =>
        html ? res.status(status).type('html').send(renderMessagePage(row.language, title, text, tone)) : res.status(status).json({ success: false, error: text, code });

      const name = String(body.name ?? '').replace(/\s+/g, ' ').trim();
      const agreed = body.agree === true || body.agree === 'yes' || body.agree === 'on' || body.agree === 'true';
      if (row.status === 'sent') {
        if (name.length < 2 || name.length > 120) return reply(400, t.accept, t.needName);
        if (!agreed) return reply(400, t.accept, t.needAgree);
        if (typeof body.terms === 'string' && body.terms && body.terms !== termsHash(row)) return reply(409, t.accept, t.changed, 'bad', 'terms-changed');
      }

      const result: any = await recordAcceptance(pool, row.id, { name, ip: req.ip ?? null, userAgent: String(req.headers['user-agent'] ?? '').slice(0, 500) || null });
      if (!result.ok) {
        const map = {
          'not-found': [400, t.invalidTitle, t.invalidBody],
          declined: [409, t.declinedTitle, t.declinedBody],
          withdrawn: [409, t.withdrawnTitle, t.withdrawnBody],
          expired: [410, t.expiredTitle, t.expiredBody],
          'not-sent': [409, t.notReadyTitle, t.notReadyBody],
        } as const;
        const [status, title, text] = map[result.reason];
        return reply(status, title, text, 'bad', result.reason);
      }

      const p = result.proposal;
      if (result.first) {
        // Everything after the acceptance is saved is best effort: a mail failure must not undo or hide the client's acceptance.
        const lead = (await pool.query(`SELECT company, contact_name, email FROM consultancy_leads WHERE id = $1`, [p.lead_id]).catch(() => ({ rows: [] as any[] }))).rows[0];
        const contact = lead?.email ? { email: lead.email as string, company: lead.company as string | null, contactName: lead.contact_name as string | null } : null;
        await sendAcceptanceToTeam(p, contact).catch((e) => logger.error('[Proposal] Failed to email the team about an acceptance', undefined, e instanceof Error ? e : new Error(String(e))));
        if (contact) await sendAcceptanceToClient(p, contact).catch((e) => logger.error('[Proposal] Failed to email the client a confirmation', undefined, e instanceof Error ? e : new Error(String(e))));
        await moveLeadStatus(pool, contact?.email, 'won');
      }
      if (html) return res.status(200).type('html').send(renderProposalPage(p, token));
      return res.json({
        success: true,
        data: { status: 'accepted', alreadyAccepted: !result.first, acceptedName: p.accepted_name, acceptedAt: p.accepted_at, termsHash: p.terms_hash },
      });
    }),
  );

  router.post(
    '/decline',
    writeLimit,
    asyncHandler(async (req: any, res: any) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const token = String(body.t ?? '');
      const c = checkLink(token);
      if (!c.ok) return refuse(req, res, c);
      const pool = await getPool();
      const row = await getProposal(pool, c.payload!.id);
      if (!row) return notFound(req, res);
      const t = proposalText(row.language);
      const reason = String(body.reason ?? '').trim().slice(0, 2000) || null;
      const result: any = await recordDecline(pool, row.id, reason);
      if (!result.ok) {
        const map = {
          'not-found': [400, t.invalidTitle, t.invalidBody],
          accepted: [409, t.acceptedTitle, 'This proposal was already accepted, so it cannot be declined. Write to hello@hallaai.com.'],
          withdrawn: [409, t.withdrawnTitle, t.withdrawnBody],
          expired: [410, t.expiredTitle, t.expiredBody],
          'not-sent': [409, t.notReadyTitle, t.notReadyBody],
        } as const;
        const [status, title, text] = map[result.reason];
        if (wantsHtml(req)) return res.status(status).type('html').send(renderMessagePage(row.language, title, text, 'bad'));
        return res.status(status).json({ success: false, error: text, code: result.reason });
      }
      if (wantsHtml(req)) return res.status(200).type('html').send(renderMessagePage(row.language, t.declinedTitle, t.declineThanks, 'info'));
      return res.json({ success: true, data: { status: 'declined', alreadyDeclined: !result.first } });
    }),
  );

  return router;
}
