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

  describe('per-tool limits count that tool only (regression: transfer_call was denied after any other tool ran)', () => {
    const run = async (sessionId: string, toolName: string) => {
      const { aiGovernanceService } = await import('../../../apps/gateway/src/services/ai-governance/ai-governance.service.js');
      const executor = vi.fn(async () => ({ success: true, message: 'ran' }));
      const result = await aiGovernanceService.executeMediatedTool(
        executor, { id: sessionId, tenantId: 't-quota', callSid: 'CAQ' } as any, toolName,
        toolName === 'transfer_call' ? { phone: '+15551234567' } : { query: toolName }
      );
      return { result, executor };
    };

    it('transfer_call still runs after search_knowledge_base and other tools have run in the same call', async () => {
      for (const tool of ['search_knowledge_base', 'lookup_customer', 'check_availability']) {
        expect((await run('sess_quota_1', tool)).result.success).toBe(true);
      }
      const t = await run('sess_quota_1', 'transfer_call');
      expect(t.result).toMatchObject({ success: true, message: 'ran' });
      expect(t.executor).toHaveBeenCalledTimes(1);
    });

    it("transfer_call's own limit (1 per call) still holds: a second transfer in the same call is denied", async () => {
      expect((await run('sess_quota_2', 'transfer_call')).result.success).toBe(true);
      const second = await run('sess_quota_2', 'transfer_call');
      expect(second.result.success).toBe(false);
      expect(second.result.message).toMatch(/Max tool executions per call exceeded/);
      expect(second.executor).not.toHaveBeenCalled();
    });

    it('the tenant-wide ceiling still counts every tool together', async () => {
      // default tenant limit is 25 executions per call across all tools; distinct read-only tools are not per-tool capped
      let ran = 0;
      for (let i = 0; i < 30; i++) {
        const r = await run('sess_quota_3', i % 2 ? 'lookup_customer' : 'check_availability');
        if (r.result.success) ran++;
        else expect(r.result.message).toMatch(/exceeded|Duplicate|rate limit/i);
      }
      expect(ran).toBeLessThanOrEqual(25);
    });
  });
});
