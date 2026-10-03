/**
 * Resolves the Halla lead / Klaros lead an event belongs to, for the event
 * payloads Klaros correlates on. Strictly deterministic: a value is returned
 * only when the stored relationships identify it unambiguously, otherwise it
 * is left undefined — an ID is never guessed.
 *
 * Never throws: correlation is best-effort enrichment and must not block
 * event emission.
 */
import { voiceDb } from '../voice/tenant-scope.js';
import { logger } from '../logger.js';

export interface LeadCorrelation {
  leadId?: string;
  klarosLeadId?: string;
}

const nonEmpty = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined);

/**
 * Call -> lead. `calls.klaros_lead_id` is set explicitly when Klaros placed
 * the call, so it wins; the lead row linked through `leads.call_id` supplies
 * the Halla lead id (and a Klaros id if the call itself carries none).
 */
export async function resolveCallCorrelation(tenantId: string, callSid: string | null | undefined): Promise<LeadCorrelation> {
  if (!callSid) return {};
  try {
    const call = await voiceDb.query(
      `SELECT id, klaros_lead_id FROM public.calls WHERE tenant_id = $1 AND call_sid = $2 LIMIT 1`,
      [tenantId, callSid]
    );
    const callRow = call.rows[0] as { id?: string; klaros_lead_id?: string | null } | undefined;

    let lead: { id?: string; klaros_lead_id?: string | null } | undefined;
    if (callRow?.id) {
      const leads = await voiceDb.query(
        `SELECT id, klaros_lead_id FROM public.leads
         WHERE tenant_id = $1 AND call_id = $2 ORDER BY created_at DESC LIMIT 1`,
        [tenantId, callRow.id]
      );
      lead = leads.rows[0];
    }

    return {
      leadId: nonEmpty(lead?.id),
      klarosLeadId: nonEmpty(callRow?.klaros_lead_id) ?? nonEmpty(lead?.klaros_lead_id),
    };
  } catch (err) {
    logger.warn('KLAROS_CALL_CORRELATION_FAILED', { tenantId, error: String(err) });
    return {};
  }
}

/**
 * Appointment -> lead. Appointments store no lead reference, but leads are
 * deduplicated per (tenant, phone), so the appointment's phone identifies the
 * lead only when exactly one lead matches. Zero or several matches resolve to
 * nothing for the lead id; a Klaros id is returned only if every matching
 * lead agrees on a single one.
 */
export async function resolveAppointmentCorrelation(tenantId: string, appointmentId: string): Promise<LeadCorrelation> {
  try {
    const appt = await voiceDb.query(
      `SELECT phone FROM public.appointments WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
      [appointmentId, tenantId]
    );
    const phone = nonEmpty(appt.rows[0]?.phone);
    if (!phone || phone === 'unknown') return {};

    const leads = await voiceDb.query(
      `SELECT id, klaros_lead_id FROM public.leads WHERE tenant_id = $1 AND phone = $2 LIMIT 5`,
      [tenantId, phone]
    );
    const rows = leads.rows as Array<{ id?: string; klaros_lead_id?: string | null }>;
    const klarosIds = new Set(rows.map((r) => nonEmpty(r.klaros_lead_id)).filter((v): v is string => Boolean(v)));

    return {
      leadId: rows.length === 1 ? nonEmpty(rows[0].id) : undefined,
      klarosLeadId: klarosIds.size === 1 ? [...klarosIds][0] : undefined,
    };
  } catch (err) {
    logger.warn('KLAROS_APPOINTMENT_CORRELATION_FAILED', { tenantId, appointmentId, error: String(err) });
    return {};
  }
}
