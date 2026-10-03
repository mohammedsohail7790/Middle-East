/**
 * Deterministic end-of-call sequence for the events Klaros consumes:
 *
 *   1. claim (idempotency)       - a call completes at most once
 *   2. evaluate                  - AI evaluation -> structured qualification (bounded by a timeout)
 *   3. persist qualification
 *   4. build the lead.qualified payload (only for a real, persisted determination)
 *   5. read the final persisted state
 *   6. publish ONE finalization event carrying the final qualificationStatus AND the
 *      lead.qualified payload. The Klaros consumer delivers them as an ordered
 *      sequence (lead.qualified, then call.completed) — see klaros-webhook.consumer.ts.
 *
 * lead.qualified deliberately does NOT travel as its own stream entry: separate
 * entries retry independently, so a failed lead.qualified would be retried after
 * call.completed had already been delivered.
 *
 * Runs detached from the voice call and from session cleanup (the caller does
 * not await it), so a slow evaluation never delays releasing call capacity.
 * An evaluation that fails, is unavailable, or times out never fabricates a
 * result: the finalization event still goes out, with whatever is actually
 * persisted (the column default is "unknown") and no lead.qualified.
 */
import type { QualificationResult } from './qualification-mapper.js';

export interface FinalCallState {
  klarosLeadId?: string;
  qualificationStatus: string;
  escalation?: string;
}

export type CompletionStage = 'evaluate' | 'persist' | 'buildQualification' | 'readFinalState';

export interface PostCallCompletionDeps {
  /** null when no evaluation is possible (no transcript / tenant config / persisted call). */
  evaluate: (() => Promise<QualificationResult>) | null;
  persistQualification: (q: QualificationResult) => Promise<void>;
  /** Resolves the lead.qualified payload (with lead / Klaros-lead correlation). It travels inside the finalization event. */
  buildQualificationEvent: (q: QualificationResult) => Promise<Record<string, unknown>>;
  readFinalState: () => Promise<FinalCallState>;
  /** Publishes the single finalization event; `qualificationEvent` is null when there is no real, persisted determination. */
  publishCompleted: (state: FinalCallState, qualificationEvent: Record<string, unknown> | null) => Promise<void>;
  /** Resolves false when completion was already emitted for this call. */
  claim: () => Promise<boolean>;
  onError: (stage: CompletionStage, err: unknown) => void;
  evaluationTimeoutMs?: number;
}

const DEFAULT_EVALUATION_TIMEOUT_MS = 45_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Qualification evaluation timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function runPostCallCompletion(deps: PostCallCompletionDeps): Promise<'emitted' | 'duplicate'> {
  if (!(await deps.claim())) return 'duplicate';

  let qualificationEvent: Record<string, unknown> | null = null;

  if (deps.evaluate) {
    let qualification: QualificationResult | null = null;
    try {
      qualification = await withTimeout(deps.evaluate(), deps.evaluationTimeoutMs ?? DEFAULT_EVALUATION_TIMEOUT_MS);
    } catch (err) {
      deps.onError('evaluate', err);
    }

    if (qualification) {
      let persisted = false;
      try {
        await deps.persistQualification(qualification);
        persisted = true;
      } catch (err) {
        deps.onError('persist', err);
      }

      // Only a persisted, real determination is announced — the finalization
      // event reads the same persisted value, so the two always agree.
      if (persisted && qualification.status !== 'unknown') {
        try {
          qualificationEvent = await deps.buildQualificationEvent(qualification);
        } catch (err) {
          deps.onError('buildQualification', err);
        }
      }
    }
  }

  let state: FinalCallState;
  try {
    state = await deps.readFinalState();
  } catch (err) {
    deps.onError('readFinalState', err);
    state = { qualificationStatus: 'unknown' };
  }

  await deps.publishCompleted(state, qualificationEvent);
  return 'emitted';
}
