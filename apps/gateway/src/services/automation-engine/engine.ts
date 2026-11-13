import { logger } from '../logger.js';
import * as realStore from './store.js';
import { getExecutor as realGetExecutor, getTemplate as realGetTemplate, listTemplates as realListTemplates } from './registry.js';
import { isTruthy, redactForProposal, resolveParams, resolveValue } from './params.js';
import type {
  AutomationApproval, AutomationRun, AutomationTemplate, ExecutorResult, StepExecutor, StepKind, StepLogEntry, StepSpec, TenantAutomation, TriggerKind,
} from './types.js';

/**
 * The engine: matches a trigger to the business's switched-on automations, runs their steps in order through the registered executors, logs every step,
 * pauses for the owner's yes before external steps in "ask first" mode, and carries on after an answer or a retry. The API in automation.router.ts and the
 * triggers call only the entry points at the bottom of this file.
 */
export interface EngineResult {
  ok: boolean;
  reason?: 'not_implemented' | 'not_found' | 'not_allowed';
  run?: AutomationRun;
}

/** What the engine needs from the outside, so tests can run it against an in-memory store. */
export interface EngineDeps {
  db: () => Promise<realStore.Db>;
  store: Pick<
    typeof realStore,
    'enabledForTrigger' | 'claimFailedRun' | 'createRun' | 'updateRun' | 'getRun' | 'getAutomationById' | 'createApproval' | 'getApproval' | 'expirePendingApprovals'
  >;
  getTemplate: (key: string) => AutomationTemplate | undefined;
  listTemplates: () => AutomationTemplate[];
  getExecutor: (kind: StepKind) => StepExecutor | undefined;
  stepTimeoutMs: number;
  /** Makes sure the template library and the executors are registered (the defaults import them). */
  ensureLoaded: () => Promise<void>;
}

export const STEP_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_CHARS = 8_000;
export const NO_ANSWER_ERROR = 'No answer in 7 days';

/** A step log entry plus what the step produced, kept so a run can carry on after a pause or a retry with the data of the steps already done. */
type LoggedStep = StepLogEntry & { output?: Record<string, unknown> };

const nowIso = (): string => new Date().toISOString();

/** Short plain text for the log: no stack traces, and nothing that looks like a secret, an address or a phone number. */
export function safeErrorText(err: unknown): string {
  let m = err instanceof Error ? err.message : typeof err === 'string' ? err : 'Something went wrong';
  m = m
    .split('\n')[0]
    .replace(/https?:\/\/[^\s)"']+/gi, '[link]')
    .replace(/\b(bearer|basic)\s+[\w.~+/=-]+/gi, '$1 [hidden]')
    .replace(/\b(api[_-]?key|token|secret|password|authorization)\b\s*[=:]\s*\S+/gi, '$1=[hidden]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/\+?\d[\d\s().-]{7,}\d/g, '[number]')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[hidden]')
    .trim();
  if (!m) m = 'Something went wrong';
  return m.length > 200 ? `${m.slice(0, 200)}…` : m;
}

function cleanOutput(o: unknown): Record<string, unknown> | undefined {
  if (o === undefined) return undefined;
  if (o === null || typeof o !== 'object' || Array.isArray(o)) throw new Error('bad output');
  return JSON.parse(JSON.stringify(o)) as Record<string, unknown>;
}

function wellFormed(r: unknown): r is ExecutorResult {
  if (r === null || typeof r !== 'object' || Array.isArray(r)) return false;
  const x = r as Record<string, unknown>;
  if (typeof x.summary !== 'string' || !x.summary.trim()) return false;
  if (x.skipped !== undefined && typeof x.skipped !== 'boolean') return false;
  if (x.output !== undefined && (x.output === null || typeof x.output !== 'object' || Array.isArray(x.output))) return false;
  return true;
}

type StepOutcome = { status: 'succeeded' | 'skipped'; summary: string; output?: Record<string, unknown> } | { status: 'failed'; error: string };

export class Engine {
  constructor(private readonly deps: EngineDeps) {}

  // ── one step ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  private async callExecutor(
    tenantId: string, automation: TenantAutomation, runId: string, step: StepSpec, data: Record<string, unknown>, approved: boolean,
  ): Promise<StepOutcome> {
    try {
      if (step.external && !approved) return { status: 'failed', error: 'This step needs approval first' };
      const executor = this.deps.getExecutor(step.kind);
      if (!executor) return { status: 'failed', error: 'This kind of step is not available' };
      let params: Record<string, unknown>;
      try {
        params = resolveParams(step.params, data);
      } catch (e) {
        return { status: 'failed', error: safeErrorText(e) };
      }
      let timer: NodeJS.Timeout | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`The step took longer than ${Math.round(this.deps.stepTimeoutMs / 1000)} seconds`)), this.deps.stepTimeoutMs);
        timer.unref?.();
      });
      let result: unknown;
      try {
        result = await Promise.race([Promise.resolve().then(() => executor({ tenantId, automation, runId, step, params, data, approved })), timeout]);
      } finally {
        if (timer) clearTimeout(timer);
      }
      if (!wellFormed(result)) return { status: 'failed', error: 'The step gave an unexpected answer' };
      let output: Record<string, unknown> | undefined;
      try {
        output = cleanOutput(result.output);
      } catch {
        return { status: 'failed', error: 'The step gave an unexpected answer' };
      }
      if (output && JSON.stringify(output).length > MAX_OUTPUT_CHARS) output = { truncated: true };
      const summary = result.summary.length > 300 ? `${result.summary.slice(0, 300)}…` : result.summary;
      return { status: result.skipped === true ? 'skipped' : 'succeeded', summary, output };
    } catch (e) {
      return { status: 'failed', error: safeErrorText(e) };
    }
  }

  // ── a run, from a given step ───────────────────────────────────────────────────────────────────────────────────────────────────────
  /** Runs steps `from`.. in order. `approvedIndex` is the one external step the owner has already said yes to. Returns the run as last saved. */
  private async execute(
    run: AutomationRun, automation: TenantAutomation, template: AutomationTemplate, log: LoggedStep[], from: number, approvedIndex: number | null,
  ): Promise<AutomationRun> {
    const db = await this.deps.db();
    const { store } = this.deps;
    const tenantId = run.tenantId;
    const save = async (patch: Parameters<typeof realStore.updateRun>[3]): Promise<AutomationRun> => (await store.updateRun(db, tenantId, run.id, patch)) ?? run;

    const data: Record<string, unknown> = { trigger: run.triggerPayload, config: automation.config, steps: {} as Record<string, unknown> };
    const outputs = data.steps as Record<string, unknown>;
    for (const e of log.slice(0, from)) if (e.output) outputs[e.key] = e.output;

    let current = await save({ status: 'running', steps: log, error: null });

    for (let i = from; i < template.steps.length; i++) {
      const step = template.steps[i];
      // A step whose `skipIf` is true is left out (no approval is asked for it) and the run carries on.
      if (step.skipIf) {
        let skip = false;
        try {
          skip = isTruthy(resolveValue(step.skipIf, data));
        } catch {
          skip = false;
        }
        if (skip) {
          log[i] = { index: i, key: step.key, status: 'skipped', startedAt: nowIso(), finishedAt: nowIso(), summary: `Not needed: ${step.title}` };
          current = await save({ steps: log });
          continue;
        }
      }
      let approved = !step.external || automation.approvalMode === 'auto';

      if (step.external && !approved) {
        if (approvedIndex === i) approved = true;
        else {
          let params: Record<string, unknown> = {};
          try {
            params = resolveParams(step.params, data);
          } catch {
            /* the step itself will report this when it runs */
          }
          const approval = await store.createApproval(db, {
            tenantId, runId: run.id, stepIndex: i, stepKey: step.key,
            summary: `Halla AI wants to: ${step.title}`,
            proposal: { step: step.title, kind: step.kind, params: redactForProposal(params) as Record<string, unknown> },
          });
          if (approval.status === 'approved') approved = true; // an answer already given for this very step (a retry after it failed)
          else if (approval.status === 'pending') {
            log[i] = { index: i, key: step.key, status: 'waiting_approval', startedAt: nowIso(), summary: `Waiting for your yes: ${step.title}` };
            return save({ status: 'waiting_approval', steps: log });
          } else {
            log[i] = { index: i, key: step.key, status: 'rejected', startedAt: nowIso(), finishedAt: nowIso(), summary: approval.status === 'expired' ? NO_ANSWER_ERROR : 'You said no' };
            return save({ status: 'rejected', steps: log, error: approval.status === 'expired' ? NO_ANSWER_ERROR : 'You said no', minutesSaved: 0, finished: true });
          }
        }
      }

      log[i] = { index: i, key: step.key, status: 'running', startedAt: nowIso(), summary: step.title };
      current = await save({ steps: log });

      const outcome = await this.callExecutor(tenantId, automation, run.id, step, data, approved);
      const startedAt = log[i].startedAt;
      if (outcome.status === 'failed') {
        log[i] = { index: i, key: step.key, status: 'failed', startedAt, finishedAt: nowIso(), summary: `Could not: ${step.title}`, error: outcome.error };
        return save({ status: 'failed', steps: log, error: outcome.error, finished: true });
      }
      log[i] = { index: i, key: step.key, status: outcome.status, startedAt, finishedAt: nowIso(), summary: outcome.summary, ...(outcome.output ? { output: outcome.output } : {}) };
      if (outcome.output) outputs[step.key] = outcome.output;
      current = await save({ steps: log });
    }

    // Nothing happened outside Halla AI (every step skipped, or every outside step skipped such as a cold lead that sent no alert): no time was saved.
    const doneExternal = template.steps.map((st, idx) => ({ st, e: log[idx] })).filter((x) => x.st.external);
    const allSkipped = (log.length > 0 && log.every((e) => e.status === 'skipped')) || (doneExternal.length > 0 && doneExternal.every((x) => x.e?.status === 'skipped'));
    current = await save(
      allSkipped
        ? { status: 'skipped', steps: log, minutesSaved: 0, error: null, finished: true }
        : { status: 'succeeded', steps: log, minutesSaved: template.minutesSavedPerRun, error: null, finished: true },
    );
    return current;
  }

  private async failRun(run: AutomationRun, message: string): Promise<AutomationRun> {
    const db = await this.deps.db();
    return (await this.deps.store.updateRun(db, run.tenantId, run.id, { status: 'failed', error: message, finished: true })) ?? run;
  }

  // ── entry points ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  /** Starts every switched-on automation that listens for this trigger. Resolves when they have run (or paused); callers use `emitTrigger`, which does not wait. */
  async processTrigger(tenantId: string, kind: TriggerKind, ref: string, payload: Record<string, unknown>): Promise<void> {
    await this.deps.ensureLoaded();
    const templates = this.deps.listTemplates().filter((t) => t.trigger === kind);
    if (!templates.length) return;
    const db = await this.deps.db();
    const automations = await this.deps.store.enabledForTrigger(db, tenantId, templates.map((t) => t.key));
    for (const automation of automations) {
      const template = templates.find((t) => t.key === automation.templateKey);
      if (!template) continue;
      try {
        const { run, created } = await this.deps.store.createRun(db, { tenantId, automationId: automation.id, triggerKind: kind, triggerRef: ref, triggerPayload: payload });
        if (!created) continue;
        await this.execute(run, automation, template, [], 0, null);
      } catch (e) {
        logger.warn('AUTOMATION_RUN_FAILED', { tenantId, templateKey: automation.templateKey, trigger: kind, error: safeErrorText(e) });
      }
    }
  }

  async resume(tenantId: string, approvalId: string): Promise<EngineResult> {
    await this.deps.ensureLoaded();
    const db = await this.deps.db();
    const { store } = this.deps;
    const approval: AutomationApproval | null = await store.getApproval(db, tenantId, approvalId);
    if (!approval) return { ok: false, reason: 'not_found' };
    if (approval.status !== 'approved' && approval.status !== 'rejected') return { ok: false, reason: 'not_allowed' };
    const run = await store.getRun(db, tenantId, approval.runId);
    if (!run) return { ok: false, reason: 'not_found' };
    if (run.status !== 'waiting_approval') return { ok: false, reason: 'not_allowed' };

    const log: LoggedStep[] = run.steps.map((s) => ({ ...s }));
    if (approval.status === 'rejected') {
      const prior = log[approval.stepIndex];
      log[approval.stepIndex] = { ...(prior ?? { index: approval.stepIndex, key: approval.stepKey }), status: 'rejected', finishedAt: nowIso(), summary: 'You said no' };
      const saved = await store.updateRun(db, tenantId, run.id, { status: 'rejected', steps: log, error: 'You said no', minutesSaved: 0, finished: true });
      return { ok: true, run: saved ?? run };
    }
    const automation = await store.getAutomationById(db, tenantId, run.automationId);
    if (!automation) return { ok: false, reason: 'not_found' };
    const template = this.deps.getTemplate(automation.templateKey);
    if (!template) return { ok: true, run: await this.failRun(run, 'This automation is no longer available') };
    const saved = await this.execute(run, automation, template, log, approval.stepIndex, approval.stepIndex);
    return { ok: true, run: saved };
  }

  async retry(tenantId: string, runId: string): Promise<EngineResult> {
    await this.deps.ensureLoaded();
    const db = await this.deps.db();
    const { store } = this.deps;
    const run = await store.getRun(db, tenantId, runId);
    if (!run) return { ok: false, reason: 'not_found' };
    if (run.status !== 'failed') return { ok: false, reason: 'not_allowed' };
    const automation = await store.getAutomationById(db, tenantId, run.automationId);
    if (!automation) return { ok: false, reason: 'not_found' };
    const template = this.deps.getTemplate(automation.templateKey);
    if (!template) return { ok: true, run: await this.failRun(run, 'This automation is no longer available') };
    // Only one retry can take the run; a second one at the same moment finds it already running.
    if (!(await store.claimFailedRun(db, tenantId, runId))) return { ok: false, reason: 'not_allowed' };

    const log: LoggedStep[] = run.steps.map((s) => ({ ...s }));
    let from = log.findIndex((e) => e.status !== 'succeeded' && e.status !== 'skipped');
    if (from < 0) from = log.length;
    const saved = await this.execute(run, automation, template, log.slice(0, from), from, null);
    return { ok: true, run: saved };
  }

  /** Ends the runs of approvals that nobody answered in time. Returns how many runs were ended. */
  async expireApprovals(dbOverride?: realStore.Db): Promise<number> {
    const db = dbOverride ?? (await this.deps.db());
    const { store } = this.deps;
    const expired = await store.expirePendingApprovals(db);
    let ended = 0;
    for (const a of expired) {
      try {
        const run = await store.getRun(db, a.tenantId, a.runId);
        if (!run || run.status !== 'waiting_approval') continue;
        const log: LoggedStep[] = run.steps.map((s) => ({ ...s }));
        const prior = log[a.stepIndex];
        log[a.stepIndex] = { ...(prior ?? { index: a.stepIndex, key: a.stepKey }), status: 'rejected', finishedAt: nowIso(), summary: NO_ANSWER_ERROR };
        await store.updateRun(db, a.tenantId, run.id, { status: 'rejected', steps: log, error: NO_ANSWER_ERROR, minutesSaved: 0, finished: true });
        ended++;
      } catch (e) {
        logger.warn('AUTOMATION_EXPIRY_FAILED', { error: safeErrorText(e) });
      }
    }
    return ended;
  }
}

async function defaultDb(): Promise<realStore.Db> {
  return (await import('../db/pool.js')).pool as unknown as realStore.Db;
}

async function defaultEnsureLoaded(): Promise<void> {
  await import('./templates/index.js');
  await import('./executors/index.js');
}

export function createEngine(overrides: Partial<EngineDeps> = {}): Engine {
  return new Engine({
    db: defaultDb, store: realStore, getTemplate: realGetTemplate, listTemplates: realListTemplates, getExecutor: realGetExecutor, stepTimeoutMs: STEP_TIMEOUT_MS, ensureLoaded: defaultEnsureLoaded,
    ...overrides,
  });
}

let shared: Engine | null = null;
const engine = (): Engine => (shared ??= createEngine());

/**
 * Something happened for a business (a lead was created, a call ended...). Starts every switched-on automation that listens for it.
 * Never throws and never waits: the work runs after this returns, so a failing automation cannot break or slow the call or form that caused it.
 */
export async function emitTrigger(tenantId: string, kind: TriggerKind, ref: string, payload: Record<string, unknown>): Promise<void> {
  try {
    setImmediate(() => {
      void engine().processTrigger(tenantId, kind, ref, payload).catch((e) => {
        logger.warn('AUTOMATION_TRIGGER_FAILED', { tenantId, trigger: kind, error: safeErrorText(e) });
      });
    });
  } catch {
    /* never break the caller */
  }
}

/** After the owner decides an approval: carry on with the run (approved) or end it (rejected). */
export async function resumeAfterDecision(tenantId: string, approvalId: string): Promise<EngineResult> {
  return engine().resume(tenantId, approvalId);
}

/** Run a failed run again from the step that failed. */
export async function retryRun(tenantId: string, runId: string): Promise<EngineResult> {
  return engine().retry(tenantId, runId);
}

/** Ends the runs whose approval nobody answered within 7 days (the store marks the approvals expired). */
export async function expireApprovalsNow(db?: realStore.Db): Promise<number> {
  try {
    return await engine().expireApprovals(db);
  } catch (e) {
    logger.warn('AUTOMATION_EXPIRY_FAILED', { error: safeErrorText(e) });
    return 0;
  }
}

let sweeper: ReturnType<typeof setInterval> | null = null;

/** Once per process: every 10 minutes end the runs whose approval went unanswered. Switch off with AUTOMATION_SWEEPER_ENABLED=false. */
export function startAutomationSweeper(): void {
  if ((process.env.AUTOMATION_SWEEPER_ENABLED || 'true').toLowerCase() === 'false' || sweeper) return;
  sweeper = setInterval(() => void expireApprovalsNow(), Number(process.env.AUTOMATION_SWEEPER_MS || 10 * 60_000));
  sweeper.unref?.();
}

export function stopAutomationSweeper(): void {
  if (sweeper) clearInterval(sweeper);
  sweeper = null;
}
