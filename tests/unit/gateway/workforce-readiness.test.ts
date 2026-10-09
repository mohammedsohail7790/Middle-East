/**
 * Readiness is pinned so it cannot be flipped by prose or by accident. Each assertion names the evidence that would be
 * needed before the value may change.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import {
  workforceReadiness, HALLA_LIVE_SAFETY_CONTROL, CODE_LEVEL_OUTPUT_GUARD_IMPLEMENTED, LIVE_MODEL_BEHAVIOUR,
  KLAROS_WEBHOOK_DELIVERY, ROW_LEVEL_SECURITY, RLS_APPLIED_TO_STAGING, RLS_APPLIED_TO_PRODUCTION,
} from '../../../apps/gateway/src/services/workforce-templates/readiness.js';
import { registerOrderLookupProvider, clearOrderLookupProvider } from '../../../apps/gateway/src/services/order-lookup/order-lookup.service.js';
import { WORKFORCE_TEMPLATES } from '../../../apps/gateway/src/services/workforce-templates/index.js';

const SRC = path.resolve(__dirname, '../../../apps/gateway/src');
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
  });

afterEach(() => clearOrderLookupProvider());

describe('HALLA_LIVE_SAFETY_CONTROL', () => {
  it('is BLOCKED because no code-level output guard exists', () => {
    expect(CODE_LEVEL_OUTPUT_GUARD_IMPLEMENTED).toBe(false);
    expect(HALLA_LIVE_SAFETY_CONTROL).toBe('BLOCKED');
  });

  it('cannot be flipped by editing a constant: no output guard / safety classifier module exists in the gateway', () => {
    const offenders = walk(SRC).filter((f) => /output-?guard|safety-?classif|content-?safety|response-?guard/i.test(path.basename(f)));
    expect(offenders).toEqual([]);
    // and nothing else in the gateway claims or flips the guard flag
    const users = walk(SRC).filter((f) => !f.endsWith('readiness.ts') && /CODE_LEVEL_OUTPUT_GUARD_IMPLEMENTED/.test(readFileSync(f, 'utf8')));
    expect(users).toEqual([]);
  }, 60_000); // reads the whole gateway source tree; under full-suite parallel load it exceeded the 10 s default

  it('every vertical reports SAFETY_POLICY_AVAILABLE as BLOCKED', () => {
    for (const v of Object.keys(WORKFORCE_TEMPLATES) as Array<keyof typeof WORKFORCE_TEMPLATES>) {
      expect(workforceReadiness(v).SAFETY_POLICY_AVAILABLE).toBe('BLOCKED');
    }
  });

  it('the vertical safety instructions are still configured in the live prompts (preserved, though not enforced)', () => {
    for (const t of Object.values(WORKFORCE_TEMPLATES)) {
      for (const a of t.agents) {
        expect(a.systemPrompt).toMatch(/HARD LIMITS/);
        expect(a.systemPrompt).toMatch(/HOW TO ESCALATE/);
        expect(a.systemPrompt).toMatch(/KNOWLEDGE BOUNDARY/);
      }
    }
    expect(WORKFORCE_TEMPLATES.medical_tourism.agents.every((a) => /EMERGENCY/.test(a.systemPrompt) && /Never diagnose/.test(a.systemPrompt) && /Never prescribe/.test(a.systemPrompt) && /Never promise or imply any result/.test(a.systemPrompt))).toBe(true);
    for (const t of Object.values(WORKFORCE_TEMPLATES)) {
      expect(t.governanceSandbox.disabledTools).toEqual(expect.arrayContaining(['send_sms', 'schedule_appointment', 'create_appointment']));
    }
  });
});

describe('the other honest states', () => {
  it('live-model behaviour was not tested', () => expect(LIVE_MODEL_BEHAVIOUR).toBe('NOT_TESTED'));
  it('Klaros webhook delivery is blocked (429 not attributable from Halla)', () => expect(KLAROS_WEBHOOK_DELIVERY).toBe('BLOCKED'));
  it('the RLS fix is verified in the repository (migration 072: non-bypass roles, every tenant table, mutation tests, fresh-database run)', () => {
    expect(ROW_LEVEL_SECURITY).toBe('READY');
    const migration = readFileSync(path.resolve(__dirname, '../../../supabase/migrations/072_halla_rls_hardening.sql'), 'utf8');
    expect(migration).toMatch(/user_can_access_tenant/);
    // the evidence that justifies READY exists as runnable tests, not as prose
    for (const t of ['tests/integration/rls-tenant-isolation.postgres.test.ts', 'tests/integration/rls-fresh-migration.postgres.test.ts']) {
      expect(statSync(path.resolve(__dirname, '../../../', t)).isFile()).toBe(true);
    }
  });

  it('is applied and measured on both databases (staging and production 2026-10-08), yet production stays blocked by the other open items', () => {
    expect(RLS_APPLIED_TO_STAGING).toBe('READY');
    expect(RLS_APPLIED_TO_PRODUCTION).toBe('READY');
    for (const v of Object.keys(WORKFORCE_TEMPLATES) as Array<keyof typeof WORKFORCE_TEMPLATES>) {
      const r = workforceReadiness(v);
      expect(r.RLS_APPLIED_TO_STAGING).toBe('READY');
      expect(r.RLS_APPLIED_TO_PRODUCTION).toBe('READY');
      // no code-level output guard, Klaros delivery unproven from the deployed sender, live model untested
      expect(r.PRODUCTION_READY).toBe('BLOCKED');
    }
  });
});

describe('workforceReadiness()', () => {
  it('Medical Tourism: defined and staging-ready, never production-ready; the order lookup does not apply', () => {
    const r = workforceReadiness('medical_tourism');
    expect(r).toMatchObject({ WORKFORCE_DEFINED: 'READY', AGENTS_CONFIGURED: 'READY', PROMPTS_CONFIGURED: 'READY', ESCALATION_CONFIGURED: 'READY', STAGING_READY: 'READY', PRODUCTION_READY: 'BLOCKED', ORDER_LOOKUP: 'NOT_APPLICABLE', WEBHOOK_READY: 'BLOCKED', ROW_LEVEL_SECURITY: 'READY', RLS_APPLIED_TO_STAGING: 'READY', RLS_APPLIED_TO_PRODUCTION: 'READY', LIVE_MODEL_BEHAVIOUR: 'NOT_TESTED' });
  });

  it('Dropshipping: ORDER_LOOKUP is BLOCKED_PENDING_KLAROS_READ_API until a provider exists, and production stays blocked either way', () => {
    expect(workforceReadiness('dropshipping').ORDER_LOOKUP).toBe('BLOCKED_PENDING_KLAROS_READ_API');
    expect(workforceReadiness('dropshipping').PRODUCTION_READY).toBe('BLOCKED');
    registerOrderLookupProvider({ name: 'fake', lookup: async () => null });
    expect(workforceReadiness('dropshipping').ORDER_LOOKUP).toBe('READY');
    expect(workforceReadiness('dropshipping').PRODUCTION_READY).toBe('BLOCKED'); // safety, RLS, webhook and live-model are still open
  });
});
