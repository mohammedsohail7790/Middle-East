import type { AutomationRun, TriggerKind } from './types.js';

/**
 * The engine's entry points. PLACEHOLDERS for now: the runtime (matching triggers to the business's switched-on automations, resolving "{{...}}" in step params,
 * running the steps in order through the registered executors, logging each step, pausing for approval before external steps in "ask first" mode, retrying)
 * replaces these bodies. The API in automation.router.ts and the triggers call only these three functions.
 */
export interface EngineResult {
  ok: boolean;
  reason?: 'not_implemented' | 'not_found' | 'not_allowed';
  run?: AutomationRun;
}

/** Something happened for a business (a lead was created, a call ended...). Starts every switched-on automation that listens for it. Never throws: a failing automation must not break the call or form that caused it. */
export async function emitTrigger(_tenantId: string, _kind: TriggerKind, _ref: string, _payload: Record<string, unknown>): Promise<void> {
  /* implemented by the runtime */
}

/** After the owner decides an approval: carry on with the run (approved) or end it (rejected). */
export async function resumeAfterDecision(_tenantId: string, _approvalId: string): Promise<EngineResult> {
  return { ok: false, reason: 'not_implemented' };
}

/** Run a failed run again from the step that failed. */
export async function retryRun(_tenantId: string, _runId: string): Promise<EngineResult> {
  return { ok: false, reason: 'not_implemented' };
}
