import { voiceDb } from '../voice/tenant-scope.js';
import { listRecentAuditBuffer } from '../ai-governance/execution-audit.js';

export type SearchCategory =
  | 'calls'
  | 'leads'
  | 'appointments'
  | 'audit'
  | 'events'
  | 'governance'
  | 'all';

export interface SearchHit {
  category: string;
  id: string;
  title: string;
  snippet: string;
  createdAt?: string;
}

export async function enterpriseSearch(
  tenantId: string,
  query: string,
  category: SearchCategory = 'all',
  limit = 20
): Promise<SearchHit[]> {
  const q = query.trim();
  if (!q || q.length < 2) return [];
  const pattern = `%${q.replace(/%/g, '')}%`;
  const hits: SearchHit[] = [];

  if (category === 'all' || category === 'calls') {
    const r = await voiceDb.query(
      `SELECT id, call_sid, transcript, created_at FROM public.calls
       WHERE tenant_id = $1 AND (transcript ILIKE $2 OR call_sid ILIKE $2)
       ORDER BY created_at DESC LIMIT $3`,
      [tenantId, pattern, limit]
    );
    for (const row of r.rows) {
      hits.push({
        category: 'calls',
        id: row.id,
        title: row.call_sid || row.id,
        snippet: String(row.transcript || '').slice(0, 160),
        createdAt: row.created_at,
      });
    }
  }

  if (category === 'all' || category === 'leads') {
    const r = await voiceDb.query(
      `SELECT id, name, phone, created_at FROM public.leads
       WHERE tenant_id = $1 AND (name ILIKE $2 OR phone ILIKE $2 OR notes ILIKE $2)
       ORDER BY created_at DESC LIMIT $3`,
      [tenantId, pattern, limit]
    );
    for (const row of r.rows) {
      hits.push({
        category: 'leads',
        id: row.id,
        title: row.name || row.phone,
        snippet: row.phone || '',
        createdAt: row.created_at,
      });
    }
  }

  if (category === 'all' || category === 'appointments') {
    const r = await voiceDb.query(
      `SELECT id, phone, scheduled_time, created_at FROM public.appointments
       WHERE tenant_id = $1 AND (phone ILIKE $2 OR status ILIKE $2)
       ORDER BY created_at DESC LIMIT $3`,
      [tenantId, pattern, limit]
    );
    for (const row of r.rows) {
      hits.push({
        category: 'appointments',
        id: row.id,
        title: row.phone || 'Appointment',
        snippet: String(row.scheduled_time || ''),
        createdAt: row.created_at,
      });
    }
  }

  if (category === 'all' || category === 'governance') {
    const qLower = q.toLowerCase();
    for (const row of listRecentAuditBuffer(tenantId, 100)) {
      const hay = `${row.toolName} ${row.outcome} ${row.authorization}`.toLowerCase();
      if (!hay.includes(qLower.replace(/%/g, ''))) continue;
      hits.push({
        category: 'governance',
        id: row.auditId,
        title: row.toolName,
        snippet: `${row.authorization} · ${row.outcome || 'pending'}`,
        createdAt: row.occurredAt,
      });
    }
  }

  if (category === 'all' || category === 'audit') {
    const r = await voiceDb.query(
      `SELECT id, event_type, payload, created_at FROM public.enterprise_audit_events
       WHERE tenant_id = $1 AND (event_type ILIKE $2 OR payload::text ILIKE $2)
       ORDER BY created_at DESC LIMIT $3`,
      [tenantId, pattern, limit]
    );
    for (const row of r.rows) {
      hits.push({
        category: 'audit',
        id: row.id,
        title: row.event_type,
        snippet: JSON.stringify(row.payload).slice(0, 120),
        createdAt: row.created_at,
      });
    }
  }

  return hits.slice(0, limit);
}
