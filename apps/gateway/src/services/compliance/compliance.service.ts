import { voiceDb } from '../voice/tenant-scope.js';
import { pool } from '../db/pool.js';
import { recordEnterpriseAuditEvent } from '../enterprise/enterprise-audit.service.js';
import { logger } from '../logger.js';
import { redactPiiGeneric } from './pii-redaction.js';

export function redactPii(text: string): string {
  return redactPiiGeneric(text);
}

export async function getRetentionSummary(tenantId: string) {
  const [policyResult, callsResult, leadsResult, smsResult] = await Promise.all([
    voiceDb.query(
      `SELECT call_recordings_days FROM public.data_retention_policies WHERE tenant_id = $1 LIMIT 1`,
      [tenantId]
    ),
    voiceDb.query(
      `SELECT count(*)::int AS total, min(created_at) AS oldest FROM public.calls WHERE tenant_id = $1`,
      [tenantId]
    ),
    voiceDb.query(
      `SELECT count(*)::int AS total FROM public.leads WHERE tenant_id = $1`,
      [tenantId]
    ),
    voiceDb
      .query(`SELECT count(*)::int AS total FROM public.sms_messages WHERE tenant_id = $1`, [tenantId])
      .catch(() => ({ rows: [{ total: 0 }] })),
  ]);

  const retentionDays = policyResult.rows[0]?.call_recordings_days ?? 90;

  return {
    totalCalls: callsResult.rows[0]?.total ?? 0,
    totalLeads: leadsResult.rows[0]?.total ?? 0,
    totalSms: smsResult.rows[0]?.total ?? 0,
    retentionDays: Number(retentionDays),
    oldestRecordAt: callsResult.rows[0]?.oldest ?? null,
  };
}

export async function requestGdprExport(tenantId: string, actorId?: string) {
  await recordEnterpriseAuditEvent({
    tenantId,
    eventType: 'gdpr_export_requested',
    actorId,
    resourceType: 'tenant',
    resourceId: tenantId,
  });
  return { status: 'queued', message: 'Export will be prepared asynchronously' };
}

type SupportedResourceType = 'call' | 'lead' | 'recording' | 'transcript' | 'contact';

const RESOURCE_DELETE_HANDLERS: Record<
  SupportedResourceType,
  (tenantId: string, resourceId: string) => Promise<number>
> = {
  call: async (tenantId, resourceId) => {
    const result = await pool.query(
      `DELETE FROM public.calls WHERE id = $1 AND tenant_id = $2`,
      [resourceId, tenantId]
    );
    return result.rowCount ?? 0;
  },
  lead: async (tenantId, resourceId) => {
    const result = await pool.query(
      `DELETE FROM public.leads WHERE id = $1 AND tenant_id = $2`,
      [resourceId, tenantId]
    );
    return result.rowCount ?? 0;
  },
  recording: async (tenantId, resourceId) => {
    const result = await pool.query(
      `UPDATE public.calls SET recording_url = NULL, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND recording_url IS NOT NULL`,
      [resourceId, tenantId]
    );
    return result.rowCount ?? 0;
  },
  transcript: async (tenantId, resourceId) => {
    const result = await pool.query(
      `UPDATE public.calls SET transcript = NULL, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND transcript IS NOT NULL`,
      [resourceId, tenantId]
    );
    return result.rowCount ?? 0;
  },
  contact: async (tenantId, resourceId) => {
    const result = await pool.query(
      `DELETE FROM public.leads WHERE id = $1 AND tenant_id = $2`,
      [resourceId, tenantId]
    );
    return result.rowCount ?? 0;
  },
};

export async function requestSecureDelete(
  tenantId: string,
  resourceType: string,
  resourceId: string,
  actorId?: string
) {
  await recordEnterpriseAuditEvent({
    tenantId,
    eventType: 'secure_delete_requested',
    actorId,
    resourceType,
    resourceId,
  });

  const handler = RESOURCE_DELETE_HANDLERS[resourceType as SupportedResourceType];
  if (!handler) {
    logger.warn('SECURE_DELETE_UNSUPPORTED_TYPE', { tenantId, resourceType, resourceId });
    return { status: 'unsupported', resourceType, resourceId, deleted: 0 };
  }

  try {
    const deleted = await handler(tenantId, resourceId);
    logger.info('SECURE_DELETE_COMPLETED', { tenantId, resourceType, resourceId, deleted });
    return { status: 'completed', resourceType, resourceId, deleted };
  } catch (error) {
    logger.error('SECURE_DELETE_FAILED', { tenantId, resourceType, resourceId, error });
    return { status: 'failed', resourceType, resourceId, deleted: 0 };
  }
}
