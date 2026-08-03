import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveToolPolicy } from '../../../apps/gateway/src/services/ai-governance/tool-policy-engine.js';
import { evaluateRuntimePermissions } from '../../../apps/gateway/src/services/ai-governance/runtime-permissions.js';
import { assessExecutionRisk } from '../../../apps/gateway/src/services/ai-governance/execution-risk.js';
import { runExecutionGuardrails } from '../../../apps/gateway/src/services/ai-governance/execution-guardrails.js';
import { defaultTenantConfig } from '../../../apps/gateway/src/services/ai-governance/ai-policy-cache.js';

vi.mock('../../../apps/gateway/src/services/voice/tenant-scope.js', () => ({
  voiceDb: { query: vi.fn(async () => ({ rows: [] })) },
}));

vi.mock('../../../apps/gateway/src/services/voice/redis.client.js', () => ({
  voiceRedis: {
    lpush: vi.fn(async () => 1),
    ltrim: vi.fn(async () => 'OK'),
    expire: vi.fn(async () => 1),
    lrange: vi.fn(async () => []),
  },
}));

describe('tool-policy-engine', () => {
  it('disables unknown tools by default', () => {
    const p = resolveToolPolicy('t1', 'unknown_tool');
    expect(p.enabled).toBe(false);
  });

  it('respects disabled tools list', () => {
    const p = resolveToolPolicy('t1', 'send_sms', { disabledTools: ['send_sms'] });
    expect(p.enabled).toBe(false);
  });
});

describe('runtime-permissions', () => {
  it('denies when emergency disable', () => {
    process.env.CALLIQ_AI_EMERGENCY_DISABLE = 'true';
    const config = defaultTenantConfig('t1');
    const d = evaluateRuntimePermissions(config, 'create_lead');
    expect(d.allowed).toBe(false);
    delete process.env.CALLIQ_AI_EMERGENCY_DISABLE;
  });
});

describe('execution-risk', () => {
  it('flags critical transfer for strict tolerance', () => {
    const policy = resolveToolPolicy('t1', 'transfer_call');
    const risk = assessExecutionRisk(policy, 'strict');
    expect(risk.requiresEscalation).toBe(true);
    expect(risk.riskLevel).toBe('critical');
  });
});

describe('execution-guardrails', () => {
  it('rejects past appointment times', () => {
    const policy = resolveToolPolicy('t1', 'create_appointment');
    const result = runExecutionGuardrails({
      tenantId: 't1',
      sessionId: 's1',
      callSid: 'CA1',
      toolName: 'create_appointment',
      parameters: { preferred_time: '2020-01-01T10:00:00.000Z' },
      policy,
    });
    expect(result.ok).toBe(false);
    expect(result.trigger).toBe('booking_sanity');
  });
});

describe('AiGovernanceService mediation', () => {
  beforeEach(() => {
    process.env.CALLIQ_P3_GOVERNANCE = 'true';
    process.env.CALLIQ_AI_EMERGENCY_DISABLE = 'false';
  });

  it('denies disabled tool without calling executor', async () => {
    const { aiGovernanceService } = await import(
      '../../../apps/gateway/src/services/ai-governance/ai-governance.service.js'
    );
    const executor = vi.fn(async () => ({ success: true }));
    const session = {
      id: 'sess_1',
      tenantId: 't1',
      callSid: 'CA1',
    } as any;

    const result = await aiGovernanceService.executeMediatedTool(
      executor,
      session,
      'totally_unknown_tool',
      {}
    );
    expect(result.success).toBe(false);
    expect(executor).not.toHaveBeenCalled();
  });
});
