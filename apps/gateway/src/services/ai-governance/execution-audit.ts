import { randomUUID } from 'crypto';
import { voiceRedis } from '../voice/redis.client.js';
import { logger } from '../logger.js';
import type { RiskAssessment } from './execution-risk.js';
import type { ToolExecutionPolicy } from './tool-policy-engine.js';
import {
  redactToolArguments,
  summarizeToolArguments,
  safeResultSummary,
  safeErrorForLog,
  type RedactedValue,
} from '../../security/tool-arg-redaction.js';

export interface AiExecutionAuditRecord {
  auditId: string;
  tenantId: string;
  sessionId: string;
  callSid: string;
  eventId?: string;
  /** The routed ai_agents row, when the call reached an agent by phone-number routing. */
  agentId?: string;
  toolName: string;
  /** The STRUCTURE of the arguments with every value replaced by a constant marker. Raw values are never stored. */
  redactedArguments: Record<string, RedactedValue>;
  /** Which fields were supplied and how many were redacted (operational metadata, no values). */
  argumentSummary: { fieldCount: number; fields: string[]; redactedFieldCount: number };
  authorization: 'allow' | 'deny';
  denialReason?: string;
  riskLevel: string;
  policyVersion: string;
  latencyMs?: number;
  outcome?: 'success' | 'failure' | 'skipped';
  resultSummary?: string;
  occurredAt: string;
}

const AUDIT_PREFIX = 'calliq:ai_audit:';
const AUDIT_TTL_SEC = Number(process.env.AI_AUDIT_TTL_SEC || 604800);
const auditBuffer: AiExecutionAuditRecord[] = [];
const MAX_BUFFER = 500;

/** What callers hand in. `arguments` is the raw tool input; it is redacted here and is never stored or logged. */
export type ExecutionAuditInput = Omit<
  AiExecutionAuditRecord,
  'auditId' | 'occurredAt' | 'redactedArguments' | 'argumentSummary'
> & { arguments?: unknown };

export async function persistExecutionAudit(record: ExecutionAuditInput): Promise<AiExecutionAuditRecord> {
  const { arguments: rawArguments, resultSummary, denialReason, ...rest } = record;
  const full: AiExecutionAuditRecord = {
    auditId: randomUUID(),
    occurredAt: new Date().toISOString(),
    ...rest,
    redactedArguments: redactToolArguments(record.toolName, rawArguments),
    argumentSummary: summarizeToolArguments(rawArguments),
    resultSummary: safeResultSummary(resultSummary),
    denialReason: safeResultSummary(denialReason),
  };

  auditBuffer.push(full);
  if (auditBuffer.length > MAX_BUFFER) auditBuffer.shift();

  logger.info('AI_EXECUTION_AUDIT', {
    auditId: full.auditId,
    tenantId: full.tenantId,
    sessionId: full.sessionId,
    callSid: full.callSid,
    agentId: full.agentId,
    toolName: full.toolName,
    argumentFields: full.argumentSummary.fieldCount,
    authorization: full.authorization,
    outcome: full.outcome,
    riskLevel: full.riskLevel,
    policyVersion: full.policyVersion,
  });

  try {
    const key = `${AUDIT_PREFIX}${full.tenantId}:${full.sessionId}`;
    await voiceRedis.lpush(key, JSON.stringify(full));
    await voiceRedis.ltrim(key, 0, 199);
    await voiceRedis.expire(key, AUDIT_TTL_SEC);
  } catch (err) {
    // The audit must not break execution, but losing audit entries must not be silent either.
    logger.warn('AI_AUDIT_PERSIST_FAILED', { auditId: full.auditId, tenantId: full.tenantId, toolName: full.toolName, ...safeErrorForLog(err) });
  }

  return full;
}

/**
 * Records written before redaction existed (retained for up to AI_AUDIT_TTL_SEC) carry raw `arguments` and
 * free-text summaries. They are redacted on read so an old entry can never be returned to a caller.
 */
function sanitizeStoredRecord(parsed: Record<string, unknown>): AiExecutionAuditRecord {
  const legacy = Object.prototype.hasOwnProperty.call(parsed, 'arguments');
  const raw = legacy ? parsed.arguments : undefined;
  const { arguments: _drop, ...rest } = parsed as Record<string, unknown>;
  void _drop;
  const record = rest as unknown as AiExecutionAuditRecord;
  if (legacy) {
    record.redactedArguments = redactToolArguments(String(rest.toolName ?? ''), raw);
    record.argumentSummary = summarizeToolArguments(raw);
    record.resultSummary = safeResultSummary(rest.resultSummary);
  }
  return record;
}

export function listRecentAuditBuffer(tenantId?: string, limit = 50): AiExecutionAuditRecord[] {
  const rows = tenantId
    ? auditBuffer.filter((r) => r.tenantId === tenantId)
    : auditBuffer;
  return rows.slice(-limit).reverse();
}

export async function listSessionAudit(
  tenantId: string,
  sessionId: string
): Promise<AiExecutionAuditRecord[]> {
  try {
    const key = `${AUDIT_PREFIX}${tenantId}:${sessionId}`;
    const raw = await voiceRedis.lrange(key, 0, 99);
    return raw
      .map((s) => {
        try {
          return sanitizeStoredRecord(JSON.parse(s));
        } catch {
          return null;
        }
      })
      .filter(Boolean) as AiExecutionAuditRecord[];
  } catch {
    return [];
  }
}

export function auditFromPolicy(
  policy: ToolExecutionPolicy,
  risk: RiskAssessment
): Pick<AiExecutionAuditRecord, 'riskLevel' | 'policyVersion'> {
  return {
    riskLevel: risk.riskLevel,
    policyVersion: 'p3-v1',
  };
}
