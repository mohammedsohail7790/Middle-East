import { Router, type Response } from 'express';
import { logger } from '../logger.js';
import { signLink } from '../audit/signed-link.js';
import { para, sendClientAuditMail } from '../audit/audit-client-mail.js';
import { escapeHtml } from '../automation/email-template.js';
import {
  ProjectError, addMilestone, createProject, createProjectFromProposal, deleteMilestone, getProject, getProjectContact, getProjectLinkVersion, listAcceptedProposals, listProjects,
  reorderMilestones, revokeProjectLinks, updateMilestone, updateProject, type Queryable,
} from './project-store.js';

/**
 * Team-side consultancy API: projects. Mounted at /api/v1/consultancy-admin/projects behind requireConsultancyAdmin (see consultancy-admin.router.ts),
 * so every route here is already limited to the team.
 */
export const STATUS_LINK_DAYS = 180;
const GATEWAY = () => process.env.GATEWAY_PUBLIC_URL || 'https://gateway.hallaai.com';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Mailer = typeof sendClientAuditMail;

const STATUS_FOR: Record<string, number> = { not_found: 404, not_accepted: 409, invalid: 400, handover_incomplete: 409 };

export function createProjectsRouter(deps: { pool?: Queryable; mail?: Mailer; now?: () => Date } = {}): Router {
  const router = Router();
  const getPool = async (): Promise<Queryable> => deps.pool ?? ((await import('../db/pool.js')).pool as unknown as Queryable);
  const now = () => deps.now?.() ?? new Date();

  const fail = (res: Response, err: unknown) => {
    if (err instanceof ProjectError) return void res.status(STATUS_FOR[err.code] ?? 400).json({ success: false, error: err.message, code: err.code });
    logger.error('consultancy projects request failed', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
  };
  const run = (fn: (db: Queryable, req: any, res: Response) => Promise<void>) => async (req: any, res: Response) => {
    try {
      await fn(await getPool(), req, res);
    } catch (err) {
      fail(res, err);
    }
  };
  const idOk = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
  const notFound = (res: Response) => void res.status(404).json({ success: false, error: 'Not found', code: 'not_found' });
  const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

  router.get('/', run(async (db, req, res) => {
    const projects = await listProjects(db, { status: str(req.query.status), overdue: req.query.overdue === '1' || req.query.overdue === 'true', search: str(req.query.search) }, now());
    res.json({ success: true, data: projects });
  }));

  // Before /:id so it is not read as a project id.
  router.get('/accepted-proposals', run(async (db, _req, res) => {
    res.json({ success: true, data: await listAcceptedProposals(db) });
  }));

  router.post('/', run(async (db, req, res) => {
    const b = req.body ?? {};
    if (b.proposalId !== undefined) {
      if (!idOk(b.proposalId)) return notFound(res);
      const r = await createProjectFromProposal(db, b.proposalId, { startsOn: b.startsOn, now: now() });
      return void res.status(r.created ? 201 : 200).json({ success: true, data: r.project, created: r.created });
    }
    if (!idOk(b.leadId)) throw new ProjectError('invalid', 'Choose a lead, or create the project from an accepted proposal.');
    const project = await createProject(db, { name: b.name, leadId: b.leadId, startsOn: b.startsOn, deliveryDate: b.deliveryDate, clientNotes: b.clientNotes }, now());
    res.status(201).json({ success: true, data: project, created: true });
  }));

  router.get('/:id', run(async (db, req, res) => {
    if (!idOk(req.params.id)) return notFound(res);
    const p = await getProject(db, req.params.id, now());
    if (!p) return notFound(res);
    res.json({ success: true, data: p });
  }));

  router.patch('/:id', run(async (db, req, res) => {
    if (!idOk(req.params.id)) return notFound(res);
    const b = req.body ?? {};
    const p = await updateProject(
      db,
      req.params.id,
      { name: b.name, status: b.status, startsOn: b.startsOn, deliveryDate: b.deliveryDate, clientNotes: b.clientNotes, handover: b.handover && typeof b.handover === 'object' ? b.handover : undefined },
      { force: b.force === true, now: now() },
    );
    res.json({ success: true, data: p });
  }));

  router.post('/:id/milestones/reorder', run(async (db, req, res) => {
    if (!idOk(req.params.id)) return notFound(res);
    res.json({ success: true, data: await reorderMilestones(db, req.params.id, req.body?.order) });
  }));

  router.post('/:id/milestones', run(async (db, req, res) => {
    if (!idOk(req.params.id)) return notFound(res);
    const b = req.body ?? {};
    res.status(201).json({ success: true, data: await addMilestone(db, req.params.id, { title: b.title, dueOn: b.dueOn, note: b.note, done: b.done }, now()) });
  }));

  router.patch('/:id/milestones/:mid', run(async (db, req, res) => {
    if (!idOk(req.params.id) || !idOk(req.params.mid)) return notFound(res);
    const b = req.body ?? {};
    res.json({ success: true, data: await updateMilestone(db, req.params.id, req.params.mid, { title: b.title, dueOn: b.dueOn, note: b.note, done: typeof b.done === 'boolean' ? b.done : undefined }, now()) });
  }));

  router.delete('/:id/milestones/:mid', run(async (db, req, res) => {
    if (!idOk(req.params.id) || !idOk(req.params.mid)) return notFound(res);
    await deleteMilestone(db, req.params.id, req.params.mid);
    res.json({ success: true });
  }));

  router.post('/:id/revoke-links', run(async (db, req, res) => {
    if (!idOk(req.params.id)) return notFound(res);
    const version = await revokeProjectLinks(db, req.params.id);
    if (version === null) return notFound(res);
    res.json({ success: true, data: { linkVersion: version } }); // every status link made before now stops working; make a new one to share again
  }));

  router.post('/:id/status-link', run(async (db, req, res) => {
    if (!idOk(req.params.id)) return notFound(res);
    const secret = process.env.AUDIT_LINK_SECRET;
    if (!secret) return void res.status(503).json({ success: false, error: 'AUDIT_LINK_SECRET is not set, so links cannot be made.' });
    const contact = await getProjectContact(db, req.params.id);
    if (!contact) return notFound(res);
    // The email is left out of the link itself: the page never shows it, and a link is only a signed, readable token.
    const v = (await getProjectLinkVersion(db, req.params.id)) ?? 1;
    const token = signLink({ k: 'project', id: req.params.id, company: contact.company.slice(0, 200), email: '', x: Math.floor(now().getTime() / 1000 + STATUS_LINK_DAYS * 86400), v }, secret);
    const url = `${GATEWAY()}/api/v1/public/project?t=${encodeURIComponent(token)}`;
    const out: { url: string; expiresInDays: number; emailed?: 'sent' | 'not-configured' } = { url, expiresInDays: STATUS_LINK_DAYS };
    if (req.body?.send === true) {
      if (!contact.email) throw new ProjectError('invalid', 'This lead has no email address to send the link to.');
      const ar = contact.language === 'ar';
      const name = contact.contactName?.trim().split(/\s+/)[0];
      const hi = escapeHtml(name || (ar ? 'مرحباً' : 'there'));
      out.emailed = await (deps.mail ?? sendClientAuditMail)({
        to: contact.email,
        eyebrow: ar ? 'هلا للاستشارات الذكية' : 'Halla AI Consultancy',
        title: ar ? 'حالة مشروعكم' : 'Your project status',
        subject: ar ? `حالة مشروع ${contact.name}` : `Status of your project: ${contact.name}`,
        bodyHtml: ar
          ? para(`${hi}،`) + para('يمكنكم متابعة تقدم المشروع وتاريخ التسليم والمراحل وقائمة التسليم من خلال الرابط الخاص بكم. الصفحة للقراءة فقط.')
          : para(`Hi ${hi},`) + para('You can follow your project here: the delivery date, the milestones and the handover checklist. The page is read-only and the link is private to you.'),
        ctaLabel: ar ? 'عرض حالة المشروع' : 'View project status',
        ctaUrl: url,
        rtl: ar,
      });
    }
    res.json({ success: true, data: out });
  }));

  return router;
}
