import { productionTelemetry } from './production-telemetry.js';
import { sessionRegistry } from '../realtime/session-registry.js';
import { voiceDb } from './tenant-scope.js';

export interface CallTelemetrySnapshot {
  callId: string;
  tenantId?: string;
  callSid?: string;
  sessionId?: string;
  runtimeState?: string;
  reconnectCount?: number;
  dbCall?: Record<string, unknown> | null;
  productionEvents: Array<{
    type: string;
    timestamp: number;
    durationMs?: number;
    metadata?: Record<string, unknown>;
  }>;
}

/** Aggregate per-call telemetry from in-memory buffers and DB. */
export async function getCallTelemetry(callId: string): Promise<CallTelemetrySnapshot> {
  const runtime = sessionRegistry.getByCallSid(callId);

  const productionEvents = productionTelemetry.getEventsForCall(callId);

  let dbCall: Record<string, unknown> | null = null;
  let tenantId = runtime?.tenantId;

  try {
    const bySid = await voiceDb.query(
      `SELECT id, tenant_id, call_sid, status, duration_seconds, created_at, metadata
       FROM public.calls
       WHERE call_sid = $1 OR id::text = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [callId]
    );
    if (bySid.rows[0]) {
      dbCall = bySid.rows[0] as Record<string, unknown>;
      tenantId = tenantId || (dbCall.tenant_id as string | undefined);
    }
  } catch {
    dbCall = null;
  }

  return {
    callId,
    tenantId,
    callSid: callId,
    sessionId: runtime?.sessionId,
    runtimeState: runtime?.state,
    reconnectCount: runtime?.metrics?.reconnectCount,
    dbCall,
    productionEvents,
  };
}
