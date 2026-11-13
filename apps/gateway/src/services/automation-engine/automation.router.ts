import { Router } from 'express';
import { asyncHandler } from '../../middleware/index.js';
import { getTenantId, type CallIqAuthenticatedRequest } from '../auth/tenant-context.js';
import { listTemplates, getTemplate } from './registry.js';
import { validateConfig } from './config-validation.js';
import * as store from './store.js';
import * as engine from './engine.js';
import { createDocumentRouter } from './document.router.js';
import type { ApprovalMode, ApprovalStatus, RunStatus } from './types.js';

/**
 * /api/v1/automations: the business's side of the automation engine. Everything is scoped to the signed-in business.
 *   GET  /                          the library: every template, with this business's copy of it (or null)
 *   PUT  /:templateKey              switch on or off, set the approval mode and the settings   (needs ops:write)
 *   GET  /runs                      the run log (filters: status, automation, limit, offset)
 *   GET  /runs/:id                  one run with its step-by-step log
 *   POST /runs/:id/retry            run a failed run again                                     (needs ops:write)
 *   GET  /approvals                 actions waiting for the owner's yes (filter: status)
 *   POST /approvals/:id/decide      { decision: "approve" | "reject" }                         (needs ops:write)
 *   GET  /stats                     runs and estimated time saved (days, default 30)
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RUN_STATUS: readonly RunStatus[] = ['running', 'waiting_approval', 'succeeded', 'failed', 'skipped', 'rejected'];
const APPROVAL_STATUS: readonly ApprovalStatus[] = ['pending', 'approved', 'rejected', 'expired'];

export interface RouterDeps {
  pool?: store.Db;
  /** Whether the signed-in user may change automations. Defaults to the business role check (ops:write). */
  canWrite?: (tenantId: string, userId: string | undefined) => Promise<boolean>;
  engine?: Pick<typeof engine, 'resumeAfterDecision' | 'retryRun'>;
}

async function defaultCanWrite(tenantId: string, userId: string | undefined): Promise<boolean> {
  const { resolveUserRole, requirePermission } = await import('../enterprise/rbac.service.js');
  const role = await resolveUserRole(tenantId, userId);
  return requirePermission(role, 'ops:write').ok;
}

export function createAutomationEngineRouter(deps: RouterDeps = {}): Router {
  const router = Router();
  const db = async (): Promise<store.Db> => deps.pool ?? ((await import('../db/pool.js')).pool as unknown as store.Db);
  const canWrite = deps.canWrite ?? defaultCanWrite;
  const eng = deps.engine ?? engine;

  const tenant = (req: any, res: any): string | null => {
    try {
      return getTenantId(req);
    } catch {
      res.status(400).json({ success: false, error: 'Tenant required' });
      return null;
    }
  };
  const mayWrite = async (req: any, res: any, tenantId: string): Promise<boolean> => {
    const ok = await canWrite(tenantId, (req as CallIqAuthenticatedRequest).tenant?.userId).catch(() => false);
    if (!ok) res.status(403).json({ success: false, error: 'You do not have permission to change automations' });
    return ok;
  };
  const who = (req: any): string => String((req as CallIqAuthenticatedRequest).tenant?.userId ?? 'owner');

  router.use('/documents', createDocumentRouter({ db, canWrite }));

  router.get('/', asyncHandler(async (req: any, res: any) => {
    const tenantId = tenant(req, res);
    if (!tenantId) return;
    const mine = new Map((await store.listAutomations(await db(), tenantId)).map((a) => [a.templateKey, a]));
    res.json({ success: true, data: { templates: listTemplates().map((t) => ({ ...t, automation: mine.get(t.key) ?? null })) } });
  }));

  router.put('/:templateKey', asyncHandler(async (req: any, res: any) => {
    const tenantId = tenant(req, res);
    if (!tenantId) return;
    const template = getTemplate(String(req.params.templateKey));
    if (!template) return res.status(404).json({ success: false, error: 'Unknown automation' });
    if (!(await mayWrite(req, res, tenantId))) return;
    const body = req.body ?? {};
    const pool = await db();
    const existing = await store.getAutomation(pool, tenantId, template.key);
    const enabled: boolean | undefined = typeof body.enabled === 'boolean' ? body.enabled : undefined;
    if (body.approvalMode !== undefined && body.approvalMode !== 'auto' && body.approvalMode !== 'ask') {
      return res.status(400).json({ success: false, error: 'approvalMode must be "auto" or "ask"' });
    }
    // Settings are checked whenever they are given, and always when switching on, against what is saved or the defaults.
    const willEnable = enabled === true;
    let config: Record<string, unknown> | undefined;
    if (body.config !== undefined || willEnable) {
      const check = validateConfig(template, body.config !== undefined ? body.config : existing?.config ?? {}, { enabling: willEnable });
      if (check.ok === false) return res.status(400).json({ success: false, error: 'Check the settings', details: check.errors });
      config = check.config;
    }
    const saved = await store.upsertAutomation(pool, tenantId, template.key, {
      name: template.name, enabled, approvalMode: body.approvalMode as ApprovalMode | undefined, config, createdBy: who(req),
    });
    res.json({ success: true, data: saved });
  }));

  router.get('/runs', asyncHandler(async (req: any, res: any) => {
    const tenantId = tenant(req, res);
    if (!tenantId) return;
    const status = req.query.status ? String(req.query.status) : undefined;
    if (status && !RUN_STATUS.includes(status as RunStatus)) return res.status(400).json({ success: false, error: 'Unknown status' });
    const automationId = req.query.automation ? String(req.query.automation) : undefined;
    if (automationId && !UUID.test(automationId)) return res.status(400).json({ success: false, error: 'Unknown automation' });
    const runs = await store.listRuns(await db(), tenantId, { status: status as RunStatus | undefined, automationId, limit: Number(req.query.limit) || undefined, offset: Number(req.query.offset) || undefined });
    res.json({ success: true, data: runs });
  }));

  router.get('/runs/:id', asyncHandler(async (req: any, res: any) => {
    const tenantId = tenant(req, res);
    if (!tenantId) return;
    if (!UUID.test(String(req.params.id))) return res.status(404).json({ success: false, error: 'Run not found' });
    const run = await store.getRun(await db(), tenantId, String(req.params.id));
    if (!run) return res.status(404).json({ success: false, error: 'Run not found' });
    res.json({ success: true, data: run });
  }));

  router.post('/runs/:id/retry', asyncHandler(async (req: any, res: any) => {
    const tenantId = tenant(req, res);
    if (!tenantId) return;
    if (!UUID.test(String(req.params.id))) return res.status(404).json({ success: false, error: 'Run not found' });
    if (!(await mayWrite(req, res, tenantId))) return;
    const run = await store.getRun(await db(), tenantId, String(req.params.id));
    if (!run) return res.status(404).json({ success: false, error: 'Run not found' });
    if (run.status !== 'failed') return res.status(409).json({ success: false, error: 'Only a failed run can be run again' });
    const r = await eng.retryRun(tenantId, run.id);
    if (!r.ok) return res.status(r.reason === 'not_found' ? 404 : 501).json({ success: false, error: r.reason === 'not_implemented' ? 'Not available yet' : 'Could not run it again' });
    res.json({ success: true, data: r.run ?? run });
  }));

  router.get('/approvals', asyncHandler(async (req: any, res: any) => {
    const tenantId = tenant(req, res);
    if (!tenantId) return;
    const status = req.query.status ? String(req.query.status) : undefined;
    if (status && !APPROVAL_STATUS.includes(status as ApprovalStatus)) return res.status(400).json({ success: false, error: 'Unknown status' });
    const pool = await db();
    await engine.expireApprovalsNow(pool); // answers nobody gave in time are closed before the list is read (never throws)
    res.json({ success: true, data: await store.listApprovals(pool, tenantId, status as ApprovalStatus | undefined) });
  }));

  router.post('/approvals/:id/decide', asyncHandler(async (req: any, res: any) => {
    const tenantId = tenant(req, res);
    if (!tenantId) return;
    if (!UUID.test(String(req.params.id))) return res.status(404).json({ success: false, error: 'Approval not found' });
    if (!(await mayWrite(req, res, tenantId))) return;
    const d = req.body?.decision;
    if (d !== 'approve' && d !== 'reject') return res.status(400).json({ success: false, error: 'decision must be "approve" or "reject"' });
    const r = await store.decideApproval(await db(), tenantId, String(req.params.id), d === 'approve' ? 'approved' : 'rejected', who(req));
    if (r.ok === false) {
      const code = r.reason === 'not_found' ? 404 : 409;
      const msg = r.reason === 'not_found' ? 'Approval not found' : r.reason === 'expired' ? 'This request has expired' : 'This request was already answered';
      return res.status(code).json({ success: false, error: msg });
    }
    // The decision is saved first; carrying on with the run is the engine's job and never changes the answer the owner gave.
    const resumed = await eng.resumeAfterDecision(tenantId, r.approval.id).catch(() => ({ ok: false }));
    res.json({ success: true, data: { approval: r.approval, resumed: resumed.ok === true } });
  }));

  router.get('/stats', asyncHandler(async (req: any, res: any) => {
    const tenantId = tenant(req, res);
    if (!tenantId) return;
    res.json({ success: true, data: await store.stats(await db(), tenantId, Number(req.query.days) || 30) });
  }));

  return router;
}
