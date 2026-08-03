import { createHash } from 'crypto';
import { logger } from '../logger.js';
import { voiceDb } from '../voice/tenant-scope.js';
import type { RealtimeSession } from '../realtime/realtime.types.js';
import type { ToolResult } from '../realtime/realtime.tools.js';
import {
  defaultTenantConfig,
  getCachedTenantConfig,
  setCachedTenantConfig,
  type TenantAiRuntimeConfig,
} from './ai-policy-cache.js';
import { evaluateRuntimePermissions } from './runtime-permissions.js';
import { assessExecutionRisk } from './execution-risk.js';
import { runExecutionGuardrails } from './execution-guardrails.js';
import { persistExecutionAudit, auditFromPolicy } from './execution-audit.js';
import {
  aiGovernanceMetrics,
  recordExecution,
  snapshotMetrics,
} from './ai-governance-metrics.js';
import { getCorrelation } from '../observability/correlation-context.js';

type SessionExecutionState = {
  perCall: number;
  minuteWindowStart: number;
  perMinute: number;
  recentHashes: { hash: string; at: number }[];
  depth: number;
};

const sessionState = new Map<string, SessionExecutionState>();

function stateFor(sessionId: string): SessionExecutionState {
  let s = sessionState.get(sessionId);
  if (!s) {
    s = {
      perCall: 0,
      minuteWindowStart: Date.now(),
      perMinute: 0,
      recentHashes: [],
      depth: 0,
    };
    sessionState.set(sessionId, s);
  }
  return s;
}

function argsHash(toolName: string, parameters: unknown): string {
  return createHash('sha256')
    .update(`${toolName}:${JSON.stringify(parameters || {})}`)
    .digest('hex')
    .slice(0, 16);
}

export class AiGovernanceService {
  async loadTenantConfig(tenantId: string): Promise<TenantAiRuntimeConfig> {
    const cached = getCachedTenantConfig(tenantId);
    if (cached) return cached;

    const fallback = defaultTenantConfig(tenantId);
    try {
      const result = await voiceDb.query(
        `SELECT allowed_tools, disabled_tools, execution_limits, risk_tolerance,
                safety_mode, confirmation_required_tools,
                COALESCE(ai_governance_enabled, true) AS ai_governance_enabled,
                auto_create_lead, auto_schedule_appointment, auto_send_confirmation
         FROM public.ai_agent_configs WHERE tenant_id = $1 LIMIT 1`,
        [tenantId]
      );
      const row = result.rows[0];
      if (!row) {
        setCachedTenantConfig(fallback);
        return fallback;
      }

      const parseArr = (v: unknown): string[] => {
        if (Array.isArray(v)) return v.map(String);
        if (typeof v === 'string') {
          try {
            const p = JSON.parse(v);
            return Array.isArray(p) ? p.map(String) : [];
          } catch {
            return [];
          }
        }
        return [];
      };

      const limits =
        typeof row.execution_limits === 'object' && row.execution_limits
          ? row.execution_limits
          : {};

      const config: TenantAiRuntimeConfig = {
        tenantId,
        governanceEnabled: row.ai_governance_enabled !== false,
        safetyMode: row.safety_mode || 'standard',
        riskTolerance: row.risk_tolerance || 'standard',
        allowedTools: parseArr(row.allowed_tools),
        disabledTools: parseArr(row.disabled_tools),
        confirmationRequiredTools: parseArr(row.confirmation_required_tools),
        executionLimits: {
          maxExecutionsPerCall: limits.maxExecutionsPerCall ?? fallback.executionLimits.maxExecutionsPerCall,
          maxExecutionsPerMinute: limits.maxExecutionsPerMinute ?? fallback.executionLimits.maxExecutionsPerMinute,
          toolCooldownMs: limits.toolCooldownMs ?? fallback.executionLimits.toolCooldownMs,
          maxToolDepth: limits.maxToolDepth ?? fallback.executionLimits.maxToolDepth,
        },
        autoCreateLead: row.auto_create_lead !== false,
        autoScheduleAppointment: !!row.auto_schedule_appointment,
        autoSendConfirmation: row.auto_send_confirmation !== false,
        policyVersion: 'p3-v1',
      };
      setCachedTenantConfig(config);
      return config;
    } catch (err) {
      logger.debug('AI_GOVERNANCE_CONFIG_LOAD_FALLBACK', {
        tenantId,
        error: String(err),
      });
      setCachedTenantConfig(fallback);
      return fallback;
    }
  }

  private checkQuotas(
    sessionId: string,
    toolName: string,
    parameters: unknown,
    config: TenantAiRuntimeConfig,
    policy: ReturnType<typeof evaluateRuntimePermissions>['policy']
  ): { ok: boolean; reason?: string; trigger?: string } {
    const st = stateFor(sessionId);
    const limits = config.executionLimits;
    const maxCall = policy.maxExecutionsPerCall ?? limits.maxExecutionsPerCall ?? 25;
    const maxMin = policy.maxExecutionsPerMinute ?? limits.maxExecutionsPerMinute ?? 40;
    const maxDepth = limits.maxToolDepth ?? 12;

    if (st.perCall >= maxCall) {
      return { ok: false, reason: 'Max tool executions per call exceeded', trigger: 'quota_per_call' };
    }
    const now = Date.now();
    if (now - st.minuteWindowStart > 60_000) {
      st.minuteWindowStart = now;
      st.perMinute = 0;
    }
    if (st.perMinute >= maxMin) {
      return { ok: false, reason: 'Tool rate limit exceeded', trigger: 'quota_per_minute' };
    }
    if (st.depth >= maxDepth) {
      return { ok: false, reason: 'Tool recursion depth exceeded', trigger: 'loop_depth' };
    }

    const hash = argsHash(toolName, parameters);
    st.recentHashes = st.recentHashes.filter((h) => now - h.at < 30_000);
    const repeats = st.recentHashes.filter((h) => h.hash === hash).length;
    st.recentHashes.push({ hash, at: now });
    if (repeats >= 2 && policy.constraints?.preventDuplicateExecution !== false) {
      aiGovernanceMetrics.duplicatePreventions++;
      return { ok: false, reason: 'Duplicate tool invocation detected', trigger: 'duplicate_loop' };
    }

    return { ok: true };
  }

  private emitAiEvent(
    eventType:
      | 'AI_TOOL_AUTHORIZED'
      | 'AI_TOOL_DENIED'
      | 'AI_TOOL_EXECUTED'
      | 'AI_TOOL_FAILED'
      | 'AI_RUNTIME_POLICY_VIOLATION'
      | 'AI_RUNTIME_GUARDRAIL_TRIGGERED'
      | 'AI_RUNTIME_WARNING',
    payload: Record<string, unknown>,
    session: RealtimeSession,
    causationId?: string
  ): void {
    void import('../../events/event-publisher.js')
      .then(async ({ publishPlatformEvent }) => {
        const { PlatformEventTypes } = await import('../../events/event-types.js');
        publishPlatformEvent(PlatformEventTypes[eventType], payload, {
          tenantId: session.tenantId,
          callSid: session.callSid,
          sessionId: session.id,
          causationId,
        });
      })
      .catch(() => {});
  }

  async executeMediatedTool(
    executor: () => Promise<ToolResult>,
    session: RealtimeSession,
    toolName: string,
    parameters: any
  ): Promise<ToolResult> {
    const { startSpan, endSpan } = await import('../../observability/enterprise/tracing.js');
    const { incCounter } = await import('../../observability/enterprise/metrics-registry.js');
    const spanId = startSpan('ai.tool.execute', {
      tenantId: session.tenantId,
      toolName,
      sessionId: session.id,
    });
    const started = Date.now();
    try {
    const config = await this.loadTenantConfig(session.tenantId);
    const permission = evaluateRuntimePermissions(config, toolName);
    const risk = assessExecutionRisk(permission.policy, config.riskTolerance);
    const corr = getCorrelation();

    if (!permission.allowed) {
      aiGovernanceMetrics.denials++;
      logger.warn('AI_POLICY_DENY', {
        tenantId: session.tenantId,
        sessionId: session.id,
        toolName,
        reason: permission.reason,
      });
      await persistExecutionAudit({
        tenantId: session.tenantId,
        sessionId: session.id,
        callSid: session.callSid,
        eventId: corr.requestId,
        toolName,
        arguments: parameters || {},
        authorization: 'deny',
        denialReason: permission.reason,
        ...auditFromPolicy(permission.policy, risk),
        outcome: 'skipped',
      });
      this.emitAiEvent('AI_TOOL_DENIED', { toolName, reason: permission.reason }, session);
      return { success: false, message: permission.reason || 'Tool denied by policy' };
    }

    if (risk.requiresEscalation && config.safetyMode === 'strict') {
      aiGovernanceMetrics.policyViolations++;
      logger.warn('AI_POLICY_DENY', {
        tenantId: session.tenantId,
        toolName,
        reason: 'Risk escalation in strict mode',
      });
      this.emitAiEvent(
        'AI_RUNTIME_POLICY_VIOLATION',
        { toolName, riskLevel: risk.riskLevel },
        session
      );
      return {
        success: false,
        message: 'This action requires elevated approval in strict safety mode',
      };
    }

    const quota = this.checkQuotas(session.id, toolName, parameters, config, permission.policy);
    if (!quota.ok) {
      aiGovernanceMetrics.policyViolations++;
      this.emitAiEvent(
        'AI_RUNTIME_GUARDRAIL_TRIGGERED',
        { toolName, trigger: quota.trigger, reason: quota.reason },
        session
      );
      return { success: false, message: quota.reason };
    }

    const guard = runExecutionGuardrails({
      tenantId: session.tenantId,
      sessionId: session.id,
      callSid: session.callSid,
      toolName,
      parameters: parameters || {},
      policy: permission.policy,
    });
    if (!guard.ok) {
      aiGovernanceMetrics.guardrailTriggers++;
      logger.warn('AI_GUARDRAIL_TRIGGER', {
        tenantId: session.tenantId,
        toolName,
        trigger: guard.trigger,
        reason: guard.reason,
      });
      this.emitAiEvent(
        'AI_RUNTIME_GUARDRAIL_TRIGGERED',
        { toolName, trigger: guard.trigger, reason: guard.reason },
        session
      );
      await persistExecutionAudit({
        tenantId: session.tenantId,
        sessionId: session.id,
        callSid: session.callSid,
        toolName,
        arguments: parameters || {},
        authorization: 'deny',
        denialReason: guard.reason,
        ...auditFromPolicy(permission.policy, risk),
        outcome: 'skipped',
      });
      return { success: false, message: guard.reason };
    }

    logger.info('AI_POLICY_ALLOW', {
      tenantId: session.tenantId,
      sessionId: session.id,
      toolName,
      riskLevel: risk.riskLevel,
    });
    this.emitAiEvent(
      'AI_TOOL_AUTHORIZED',
      { toolName, riskLevel: risk.riskLevel },
      session
    );

    const st = stateFor(session.id);
    st.perCall++;
    st.perMinute++;
    st.depth++;

    try {
      const result = await executor();
      const latencyMs = Date.now() - started;
      recordExecution(toolName, session.tenantId, latencyMs);
      st.depth = Math.max(0, st.depth - 1);

      await persistExecutionAudit({
        tenantId: session.tenantId,
        sessionId: session.id,
        callSid: session.callSid,
        toolName,
        arguments: parameters || {},
        authorization: 'allow',
        ...auditFromPolicy(permission.policy, risk),
        latencyMs,
        outcome: result.success ? 'success' : 'failure',
        resultSummary: result.message || result.error,
      });

      if (result.success) {
        logger.info('AI_EXECUTION_SUCCESS', { tenantId: session.tenantId, toolName, latencyMs });
        this.emitAiEvent(
          'AI_TOOL_EXECUTED',
          { toolName, success: true, latencyMs },
          session
        );
      } else {
        aiGovernanceMetrics.failures++;
        logger.warn('AI_EXECUTION_FAILURE', {
          tenantId: session.tenantId,
          toolName,
          error: result.error,
        });
        this.emitAiEvent('AI_TOOL_FAILED', { toolName, error: result.error }, session);
      }

      return result;
    } catch (err) {
      st.depth = Math.max(0, st.depth - 1);
      aiGovernanceMetrics.failures++;
      const message = err instanceof Error ? err.message : String(err);
      logger.error('AI_EXECUTION_FAILURE', {
        tenantId: session.tenantId,
        toolName,
        error: message,
      });
      this.emitAiEvent('AI_TOOL_FAILED', { toolName, error: message }, session);
      await persistExecutionAudit({
        tenantId: session.tenantId,
        sessionId: session.id,
        callSid: session.callSid,
        toolName,
        arguments: parameters || {},
        authorization: 'allow',
        ...auditFromPolicy(permission.policy, risk),
        outcome: 'failure',
        resultSummary: message,
      });
      return { success: false, error: message };
    }
    } finally {
      const latencyMs = Date.now() - started;
      incCounter('calliq_ai_execution_latency_ms_sum', { toolName }, latencyMs);
      endSpan(spanId, 'ok');
    }
  }

  getMetricsSnapshot() {
    return snapshotMetrics();
  }
}

export const aiGovernanceService = new AiGovernanceService();
