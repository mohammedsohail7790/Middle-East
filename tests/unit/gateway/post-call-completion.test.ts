import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  runPostCallCompletion,
  type FinalCallState,
  type PostCallCompletionDeps,
} from '../../../apps/gateway/src/services/realtime/post-call-completion.js';
import type { QualificationResult } from '../../../apps/gateway/src/services/realtime/qualification-mapper.js';

const qualified: QualificationResult = { status: 'qualified', confidence: 0.9, reason: 'Booked', missingFields: [] };
const unknown: QualificationResult = { status: 'unknown', confidence: 0, reason: 'unavailable', missingFields: [] };

/** In-memory stand-in for the calls row so "persisted" state is observable. */
function harness(overrides: Partial<PostCallCompletionDeps> = {}) {
  const log: string[] = [];
  const published: Array<{ state: FinalCallState; qualificationEvent: Record<string, unknown> | null }> = [];
  const errors: Array<[string, unknown]> = [];
  const row = { qualification_status: 'unknown' as string };
  let claimed = false;

  const deps: PostCallCompletionDeps = {
    evaluate: async () => {
      log.push('evaluate');
      return qualified;
    },
    persistQualification: async (q) => {
      log.push('persist');
      row.qualification_status = q.status;
    },
    buildQualificationEvent: async (q) => {
      log.push('buildQualification');
      return { callId: 'CA1', leadId: 'lead-1', klarosLeadId: 'kl-1', status: q.status };
    },
    readFinalState: async () => {
      log.push('readFinalState');
      return { qualificationStatus: row.qualification_status, klarosLeadId: 'kl-1' };
    },
    publishCompleted: async (state, qualificationEvent) => {
      log.push('publish');
      published.push({ state, qualificationEvent });
    },
    claim: async () => {
      log.push('claim');
      if (claimed) return false;
      claimed = true;
      return true;
    },
    onError: (stage, err) => {
      log.push(`error:${stage}`);
      errors.push([stage, err]);
    },
    ...overrides,
  };
  return { deps, log, published, errors, row };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('runPostCallCompletion', () => {
  it('A. qualified: persists first, then ONE event carries the final status and the lead.qualified payload', async () => {
    const h = harness();
    expect(await runPostCallCompletion(h.deps)).toBe('emitted');

    expect(h.log).toEqual(['claim', 'evaluate', 'persist', 'buildQualification', 'readFinalState', 'publish']);
    expect(h.published).toHaveLength(1);
    expect(h.published[0].state).toEqual({ qualificationStatus: 'qualified', klarosLeadId: 'kl-1' });
    expect(h.published[0].qualificationEvent).toMatchObject({ status: 'qualified', leadId: 'lead-1', klarosLeadId: 'kl-1' });
  });

  it('B. an "unknown" result is persisted and reported as unknown; no lead.qualified payload is attached', async () => {
    const h = harness({ evaluate: async () => unknown });
    await runPostCallCompletion(h.deps);

    expect(h.log).toEqual(['claim', 'persist', 'readFinalState', 'publish']);
    expect(h.published[0].state.qualificationStatus).toBe('unknown');
    expect(h.published[0].qualificationEvent).toBeNull();
  });

  it('C. evaluation failure: nothing fabricated, completion still emitted with the unknown default', async () => {
    const boom = new Error('openai 500');
    const h = harness({
      evaluate: async () => {
        throw boom;
      },
    });
    expect(await runPostCallCompletion(h.deps)).toBe('emitted');

    expect(h.log).toEqual(['claim', 'error:evaluate', 'readFinalState', 'publish']);
    expect(h.errors).toEqual([['evaluate', boom]]);
    expect(h.published[0].state.qualificationStatus).toBe('unknown');
    expect(h.published[0].qualificationEvent).toBeNull();
    expect(h.row.qualification_status).toBe('unknown');
  });

  it('a hung evaluation times out, completion is still emitted, and the late result is never applied', async () => {
    vi.useFakeTimers();
    let resolveLate!: (q: QualificationResult) => void;
    const h = harness({
      evaluationTimeoutMs: 1000,
      evaluate: () => new Promise<QualificationResult>((resolve) => (resolveLate = resolve)),
    });

    const running = runPostCallCompletion(h.deps);
    await vi.advanceTimersByTimeAsync(1001);
    expect(await running).toBe('emitted');

    expect(String(h.errors[0][1])).toMatch(/timed out/);
    expect(h.published[0].state.qualificationStatus).toBe('unknown');

    resolveLate(qualified); // arrives after completion was already published
    await vi.advanceTimersByTimeAsync(10);
    expect(h.row.qualification_status).toBe('unknown');
    expect(h.published).toHaveLength(1);
    expect(h.published[0].qualificationEvent).toBeNull();
  });

  it('a persistence failure drops the lead.qualified payload so it can never disagree with the persisted status', async () => {
    const h = harness({
      persistQualification: async () => {
        throw new Error('db down');
      },
    });
    await runPostCallCompletion(h.deps);

    expect(h.log).toEqual(['claim', 'evaluate', 'error:persist', 'readFinalState', 'publish']);
    expect(h.published[0].qualificationEvent).toBeNull();
    expect(h.published[0].state.qualificationStatus).toBe('unknown');
  });

  it('an unreadable final state still yields a completion event, defaulting to unknown', async () => {
    const h = harness({
      readFinalState: async () => {
        throw new Error('db down');
      },
    });
    await runPostCallCompletion(h.deps);

    expect(h.log.at(-1)).toBe('publish');
    expect(h.published[0].state).toEqual({ qualificationStatus: 'unknown' });
  });

  it('with no evaluation possible (no transcript/config) completion is emitted immediately as unknown', async () => {
    const h = harness({ evaluate: null });
    await runPostCallCompletion(h.deps);

    expect(h.log).toEqual(['claim', 'readFinalState', 'publish']);
    expect(h.published[0].qualificationEvent).toBeNull();
  });

  it('a failure while building the qualification payload does not stop the completion event', async () => {
    const h = harness({
      buildQualificationEvent: async () => {
        throw new Error('correlation down');
      },
    });
    await runPostCallCompletion(h.deps);
    expect(h.log).toEqual(['claim', 'evaluate', 'persist', 'error:buildQualification', 'readFinalState', 'publish']);
    expect(h.published[0].qualificationEvent).toBeNull();
    expect(h.published[0].state.qualificationStatus).toBe('qualified'); // persisted, still reported
  });

  it('E. repeated post-call processing is idempotent: the second run publishes nothing and evaluates nothing', async () => {
    const h = harness();
    expect(await runPostCallCompletion(h.deps)).toBe('emitted');
    h.log.length = 0;

    expect(await runPostCallCompletion(h.deps)).toBe('duplicate');
    expect(h.log).toEqual(['claim']);
    expect(h.published).toHaveLength(1);
  });

  it('F. concurrent duplicate runs still publish exactly one finalization event', async () => {
    const h = harness();
    const results = await Promise.all([runPostCallCompletion(h.deps), runPostCallCompletion(h.deps)]);
    expect(results.sort()).toEqual(['duplicate', 'emitted']);
    expect(h.published).toHaveLength(1);
  });
});
