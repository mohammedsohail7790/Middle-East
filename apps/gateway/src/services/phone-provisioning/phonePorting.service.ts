import { pool } from '../db/pool.js';
import { logger } from '../logger.js';

export interface PortRequest {
  id: string;
  tenantId: string;
  phoneNumber: string;
  carrierName?: string;
  accountNumber?: string;
  status: string;
  loaDocumentUrl?: string;
  twilioPortSid?: string;
  failureReason?: string;
  submittedAt?: string;
  completedAt?: string;
  createdAt: string;
}

function mapPortRow(r: Record<string, unknown>): PortRequest {
  return {
    id: String(r.id),
    tenantId: String(r.tenant_id),
    phoneNumber: String(r.phone_number),
    carrierName: r.carrier_name ? String(r.carrier_name) : undefined,
    accountNumber: r.account_number ? String(r.account_number) : undefined,
    status: String(r.status),
    loaDocumentUrl: r.loa_document_url ? String(r.loa_document_url) : undefined,
    twilioPortSid: r.twilio_port_sid ? String(r.twilio_port_sid) : undefined,
    failureReason: r.failure_reason ? String(r.failure_reason) : undefined,
    submittedAt: r.submitted_at ? String(r.submitted_at) : undefined,
    completedAt: r.completed_at ? String(r.completed_at) : undefined,
    createdAt: String(r.created_at),
  };
}

export async function createPortRequest(
  tenantId: string,
  input: { phoneNumber: string; carrierName?: string; accountNumber?: string; accountPin?: string }
): Promise<PortRequest> {
  const { rows } = await pool.query(
    `INSERT INTO public.phone_port_requests
       (tenant_id, phone_number, carrier_name, account_number, account_pin, status)
     VALUES ($1, $2, $3, $4, $5, 'draft')
     RETURNING *`,
    [tenantId, input.phoneNumber, input.carrierName || null, input.accountNumber || null, input.accountPin || null]
  );
  return mapPortRow(rows[0]);
}

export async function listPortRequests(tenantId: string): Promise<PortRequest[]> {
  const { rows } = await pool.query(
    `SELECT * FROM public.phone_port_requests WHERE tenant_id = $1 ORDER BY created_at DESC`,
    [tenantId]
  );
  return rows.map(mapPortRow);
}

export async function getPortRequest(tenantId: string, id: string): Promise<PortRequest | null> {
  const { rows } = await pool.query(
    `SELECT * FROM public.phone_port_requests WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id]
  );
  return rows[0] ? mapPortRow(rows[0]) : null;
}

export async function attachLoaDocument(tenantId: string, id: string, url: string): Promise<PortRequest> {
  const { rows } = await pool.query(
    `UPDATE public.phone_port_requests
     SET loa_document_url = $3, updated_at = NOW()
     WHERE tenant_id = $1 AND id = $2
     RETURNING *`,
    [tenantId, id, url]
  );
  if (!rows[0]) throw new Error('Port request not found');
  return mapPortRow(rows[0]);
}

export async function submitPortRequest(tenantId: string, id: string): Promise<PortRequest> {
  const existing = await getPortRequest(tenantId, id);
  if (!existing) throw new Error('Port request not found');
  if (!existing.loaDocumentUrl) throw new Error('LOA document required before submit');

  const portSid = `PORT_SIM_${id.replace(/-/g, '').slice(0, 16)}`;
  const { rows } = await pool.query(
    `UPDATE public.phone_port_requests
     SET status = 'submitted', twilio_port_sid = $3, submitted_at = NOW(), updated_at = NOW()
     WHERE tenant_id = $1 AND id = $2
     RETURNING *`,
    [tenantId, id, portSid]
  );

  logger.info('Port request submitted', { tenantId, id, portSid });
  return mapPortRow(rows[0]);
}

export async function cancelPortRequest(tenantId: string, id: string): Promise<PortRequest> {
  const existing = await getPortRequest(tenantId, id);
  if (!existing) throw new Error('Port request not found');
  if (existing.status === 'completed') throw new Error('Cannot cancel a completed port request');
  const { rows } = await pool.query(
    `UPDATE public.phone_port_requests
     SET status = 'cancelled', updated_at = NOW()
     WHERE tenant_id = $1 AND id = $2
     RETURNING *`,
    [tenantId, id]
  );
  if (!rows[0]) throw new Error('Port request not found');
  logger.info('Port request cancelled', { tenantId, id });
  return mapPortRow(rows[0]);
}

export async function pollPortStatus(tenantId: string, id: string): Promise<PortRequest> {
  const existing = await getPortRequest(tenantId, id);
  if (!existing) throw new Error('Port request not found');
  if (existing.status !== 'submitted' && existing.status !== 'in_progress') return existing;

  const submitted = existing.submittedAt ? new Date(existing.submittedAt).getTime() : Date.now();
  const elapsedDays = (Date.now() - submitted) / 86400000;
  let nextStatus = existing.status;
  if (elapsedDays > 10) nextStatus = 'completed';
  else if (elapsedDays > 2) nextStatus = 'in_progress';

  if (nextStatus === existing.status) return existing;

  const { rows } = await pool.query(
    `UPDATE public.phone_port_requests
     SET status = $3, completed_at = CASE WHEN $3 = 'completed' THEN NOW() ELSE completed_at END, updated_at = NOW()
     WHERE tenant_id = $1 AND id = $2
     RETURNING *`,
    [tenantId, id, nextStatus]
  );
  return mapPortRow(rows[0]);
}
