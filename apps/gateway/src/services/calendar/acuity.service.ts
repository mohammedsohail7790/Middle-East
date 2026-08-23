/**
 * Acuity Scheduling Integration Service
 * Supports OAuth 2.0 (Bearer) and legacy Basic Auth (userId + API key).
 * Docs: https://developers.acuityscheduling.com/docs/oauth2
 */

import fetch from 'node-fetch';
import { pool } from '../db/pool.js';
import { getAcuityRedirectUri } from '../env.js';
import { logger } from '../logger.js';

const ACUITY_BASE_URL = 'https://acuityscheduling.com/api/v1';
const ACUITY_TOKEN_URL = 'https://acuityscheduling.com/oauth2/token';

interface AcuityApiOptions {
  method?: string;
  body?: string;
}

async function acuityOAuthRequest(
  path: string,
  accessToken: string,
  options: AcuityApiOptions = {}
): Promise<any> {
  const res = await fetch(`${ACUITY_BASE_URL}${path}`, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: options.body,
  } as any);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Acuity API error ${res.status}: ${text}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

async function acuityBasicRequest(
  path: string,
  userId: string,
  apiKey: string,
  options: AcuityApiOptions = {}
): Promise<any> {
  const auth = Buffer.from(`${userId}:${apiKey}`).toString('base64');
  const res = await fetch(`${ACUITY_BASE_URL}${path}`, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: options.body,
  } as any);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Acuity API error ${res.status}: ${text}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

export interface AcuityConnection {
  id: string;
  tenantId: string;
  userId: string;
  accessToken: string;
  email: string;
  calendarName: string;
  authMode: 'basic' | 'oauth';
}

export interface AcuityEvent {
  id: string;
  tenantId: string;
  acuityId: string;
  title: string;
  startTime: Date;
  endTime: Date;
  attendeeEmail: string;
  attendeePhone: string;
  status: 'scheduled' | 'cancelled';
}

async function exchangeAcuityCode(code: string): Promise<{ access_token: string }> {
  const clientId = process.env.ACUITY_CLIENT_ID?.trim() || '';
  const clientSecret = process.env.ACUITY_CLIENT_SECRET?.trim() || '';
  const redirectUri = getAcuityRedirectUri();

  if (!clientId || !clientSecret) {
    throw new Error('Acuity OAuth is not configured on the server (ACUITY_CLIENT_ID / SECRET)');
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const tokenRes = await fetch(ACUITY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  } as any);

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    throw new Error(`Acuity token error: ${text}`);
  }

  return tokenRes.json() as Promise<{ access_token: string }>;
}

function mapConnectionRow(row: any): AcuityConnection {
  const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata || {};
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: String(meta.userId || ''),
    accessToken: row.access_token || '',
    email: row.email,
    calendarName: meta.calendarName || 'Acuity Calendar',
    authMode: meta.authMode === 'oauth' ? 'oauth' : 'basic',
  };
}

async function acuityRequestForConnection(
  conn: AcuityConnection,
  path: string,
  options: AcuityApiOptions = {}
): Promise<any> {
  if (conn.authMode === 'oauth') {
    return acuityOAuthRequest(path, conn.accessToken, options);
  }
  return acuityBasicRequest(path, conn.userId, conn.accessToken, options);
}

export class AcuityService {
  isConfigured(): boolean {
    return !!(process.env.ACUITY_CLIENT_ID?.trim() && process.env.ACUITY_CLIENT_SECRET?.trim());
  }

  getAuthUrl(tenantId: string): string {
    const clientId = process.env.ACUITY_CLIENT_ID?.trim() || '';
    if (!clientId) {
      throw new Error('ACUITY_CLIENT_ID is not configured on the gateway');
    }
    const redirectUri = getAcuityRedirectUri();
    const state = Buffer.from(JSON.stringify({ tenantId })).toString('base64url');
    return (
      'https://acuityscheduling.com/oauth2/authorize' +
      `?response_type=code` +
      `&scope=${encodeURIComponent('api-v1')}` +
      `&client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${encodeURIComponent(state)}`
    );
  }

  async handleCallback(tenantId: string, code: string): Promise<AcuityConnection> {
    const tokenData = await exchangeAcuityCode(code);
    const token = tokenData.access_token;
    const profile = await acuityOAuthRequest('/me', token);

    const userId = String(profile.id || profile.userID || '');
    const email = profile.email || '';
    const calendarName = profile.businessName || profile.username || 'Acuity Calendar';

    const conn = await pool.query(
      `INSERT INTO public.calendar_connections 
       (tenant_id, provider, email, access_token, expires_at, status, metadata)
       VALUES ($1, 'acuity', $2, $3, $4, 'active', $5)
       ON CONFLICT (tenant_id, provider)
       DO UPDATE SET 
         email = $2,
         access_token = $3,
         expires_at = $4,
         status = 'active',
         metadata = $5,
         updated_at = NOW()
       RETURNING id, tenant_id, provider, email, access_token, expires_at, status, metadata`,
      [
        tenantId,
        email,
        token,
        new Date('2099-01-01'),
        JSON.stringify({
          userId,
          calendarName,
          authMode: 'oauth',
        }),
      ]
    );

    return mapConnectionRow(conn.rows[0]);
  }

  async testConnection(userId: string, apiKey: string): Promise<{ success: boolean; calendarName: string; email: string }> {
    try {
      const data = await acuityBasicRequest('/me', userId, apiKey);
      return {
        success: true,
        calendarName: data.businessName || data.username || 'Acuity Calendar',
        email: data.email || '',
      };
    } catch {
      return {
        success: false,
        calendarName: '',
        email: '',
      };
    }
  }

  async saveConnection(
    tenantId: string,
    userId: string,
    apiKey: string,
    email: string,
    calendarName: string
  ): Promise<AcuityConnection> {
    const conn = await pool.query(
      `INSERT INTO public.calendar_connections 
       (tenant_id, provider, email, access_token, expires_at, status, metadata)
       VALUES ($1, 'acuity', $2, $3, $4, 'active', $5)
       ON CONFLICT (tenant_id, provider)
       DO UPDATE SET 
         email = $2,
         access_token = $3,
         expires_at = $4,
         status = 'active',
         metadata = $5,
         updated_at = NOW()
       RETURNING id, tenant_id, provider, email, access_token, expires_at, status, metadata`,
      [
        tenantId,
        email,
        apiKey,
        new Date('2099-01-01'),
        JSON.stringify({
          userId,
          calendarName,
          authMode: 'basic',
        }),
      ]
    );

    return mapConnectionRow(conn.rows[0]);
  }

  async getConnection(tenantId: string): Promise<AcuityConnection | null> {
    const result = await pool.query(
      `SELECT id, tenant_id, email, access_token, status, metadata
       FROM public.calendar_connections
       WHERE tenant_id = $1 AND provider = 'acuity' AND status = 'active'
       LIMIT 1`,
      [tenantId]
    );
    if (!result.rows.length) return null;
    return mapConnectionRow(result.rows[0]);
  }

  async getAppointments(tenantId: string, startDate?: string, endDate?: string): Promise<any[]> {
    const conn = await this.getConnection(tenantId);
    if (!conn) throw new Error('No Acuity connection found');

    let path = '/appointments';
    const params: string[] = [];
    if (startDate) params.push(`maxDate=${startDate}`);
    if (endDate) params.push(`minDate=${endDate}`);
    if (params.length) path += `?${params.join('&')}`;

    return acuityRequestForConnection(conn, path);
  }

  async getAppointmentTypes(tenantId: string): Promise<any[]> {
    const conn = await this.getConnection(tenantId);
    if (!conn) throw new Error('No Acuity connection found');
    return acuityRequestForConnection(conn, '/appointment-types');
  }

  async getAvailability(
    tenantId: string,
    appointmentTypeId: string,
    month: string,
    year: string
  ): Promise<any[]> {
    const conn = await this.getConnection(tenantId);
    if (!conn) throw new Error('No Acuity connection found');

    return acuityRequestForConnection(
      conn,
      `/availability/calendars?month=${month}&year=${year}&appointmentTypeID=${appointmentTypeId}`
    );
  }

  async createAppointment(
    tenantId: string,
    appointmentTypeId: string,
    datetime: string,
    clientName: string,
    clientEmail: string,
    clientPhone: string
  ): Promise<any> {
    const conn = await this.getConnection(tenantId);
    if (!conn) throw new Error('No Acuity connection found');

    const appointment = await acuityRequestForConnection(conn, '/appointments', {
      method: 'POST',
      body: JSON.stringify({
        appointmentTypeID: appointmentTypeId,
        datetime,
        firstName: clientName.split(' ')[0] || clientName,
        lastName: clientName.split(' ').slice(1).join(' ') || '',
        email: clientEmail,
        phone: clientPhone,
      }),
    });

    await pool.query(
      `INSERT INTO public.calendar_events
       (tenant_id, external_id, title, start_time, end_time, attendee_email, attendee_phone, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'scheduled')
       ON CONFLICT (tenant_id, external_id) DO NOTHING`,
      [
        tenantId,
        appointment.id,
        appointment.name || appointment.typeName || 'Acuity Appointment',
        new Date(appointment.datetime),
        new Date(new Date(appointment.datetime).getTime() + (appointment.duration || 60) * 60000),
        clientEmail,
        clientPhone,
      ]
    );

    return appointment;
  }

  async cancelAppointment(tenantId: string, acuityAppointmentId: string): Promise<void> {
    const conn = await this.getConnection(tenantId);
    if (!conn) throw new Error('No Acuity connection found');

    await acuityRequestForConnection(conn, `/appointments/${acuityAppointmentId}/cancel`, {
      method: 'PUT',
      body: JSON.stringify({ reason: 'Cancelled via Halla AI' }),
    });

    await pool.query(
      `UPDATE public.calendar_events SET status = 'cancelled', updated_at = NOW() WHERE external_id = $1`,
      [acuityAppointmentId]
    );
  }

  async disconnect(tenantId: string): Promise<void> {
    await pool.query(
      `UPDATE public.calendar_connections SET status = 'expired', updated_at = NOW() WHERE tenant_id = $1 AND provider = 'acuity'`,
      [tenantId]
    );
    logger.info('[Acuity] Disconnected', { tenantId });
  }
}

export const acuityService = new AcuityService();
