import { randomUUID } from 'crypto';
import { voiceRedis } from '../voice/redis.client.js';
import { logger } from '../logger.js';
import type { RiskAssessment } from './execution-risk.js';
import type { ToolExecutionPolicy } from './tool-policy-engine.js';

export interface AiExecutionAuditRecord {
  auditId: string;
  tenantId: string;
  sessionId: string;
  callSid: string;
  eventId?: string;
  toolName: string;
  arguments: Record<string, unknown>;
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

export async function persistExecutionAudit(
  record: Omit<AiExecutionAuditRecord, 'auditId' | 'occurredAt'>
): Promise<AiExecutionAuditRecord> {
  const full: AiExecutionAuditRecord = {
    auditId: randomUUID(),
    occurredAt: new Date().toISOString(),
    ...record,
  };

  auditBuffer.push(full);
  if (auditBuffer.length > MAX_BUFFER) auditBuffer.shift();

  logger.info('AI_EXECUTION_AUDIT', {
    auditId: full.auditId,
    tenantId: full.tenantId,
    sessionId: full.sessionId,
    callSid: full.callSid,
    toolName: full.toolName,
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
  } catch {
    /* audit must not break execution */
  }

  return full;
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
          return JSON.parse(s) as AiExecutionAuditRecord;
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
