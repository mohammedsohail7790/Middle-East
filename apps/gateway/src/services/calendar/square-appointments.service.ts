/**
 * Square Appointments — OAuth 2.0 via Square Connect API.
 * Docs: https://developer.squareup.com/docs/oauth-api/overview
 */

import fetch from 'node-fetch';
import { pool } from '../db/pool.js';
import { getSquareRedirectUri } from '../env.js';
import { logger } from '../logger.js';

const SQUARE_API_BASE = 'https://connect.squareup.com/v2';
const SQUARE_TOKEN_URL = 'https://connect.squareup.com/oauth2/token';
const SQUARE_VERSION = '2024-01-18';
const SQUARE_SCOPES = [
  'APPOINTMENTS_READ',
  'APPOINTMENTS_WRITE',
  'MERCHANT_PROFILE_READ',
  'APPOINTMENTS_BUSINESS_SETTINGS_READ',
].join(' ');

export interface SquareConnection {
  id: string;
  tenantId: string;
  accessToken: string;
  refreshToken: string;
  email: string;
  calendarName: string;
  locationId: string;
}

function mapConnectionRow(row: any): SquareConnection {
  const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata || {};
  return {
    id: row.id,
    tenantId: row.tenant_id,
    accessToken: row.access_token || '',
    refreshToken: row.refresh_token || '',
    email: row.email || '',
    calendarName: meta.calendarName || 'Square Appointments',
    locationId: meta.locationId || '',
  };
}

async function squareApiRequest(path: string, accessToken: string): Promise<any> {
  const res = await fetch(`${SQUARE_API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Square-Version': SQUARE_VERSION,
      'Content-Type': 'application/json',
    },
  } as any);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Square API error ${res.status}: ${text}`);
  }

  return res.json();
}

async function exchangeSquareCode(code: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_at?: string;
}> {
  const clientId = process.env.SQUARE_CLIENT_ID?.trim() || '';
  const clientSecret = process.env.SQUARE_CLIENT_SECRET?.trim() || '';
  const redirectUri = getSquareRedirectUri();

  if (!clientId || !clientSecret) {
    throw new Error('Square OAuth is not configured on the server (SQUARE_CLIENT_ID / SECRET)');
  }

  const tokenRes = await fetch(SQUARE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  } as any);

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    throw new Error(`Square token error: ${text}`);
  }

  return tokenRes.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_at?: string;
  }>;
}

export class SquareAppointmentsService {
  isConfigured(): boolean {
    return !!(process.env.SQUARE_CLIENT_ID?.trim() && process.env.SQUARE_CLIENT_SECRET?.trim());
  }

  getAuthUrl(tenantId: string): string {
    const clientId = process.env.SQUARE_CLIENT_ID?.trim() || '';
    if (!clientId) {
      throw new Error('SQUARE_CLIENT_ID is not configured on the gateway');
    }
    const redirectUri = getSquareRedirectUri();
    const state = Buffer.from(JSON.stringify({ tenantId })).toString('base64url');
    return (
      'https://connect.squareup.com/oauth2/authorize' +
      `?client_id=${encodeURIComponent(clientId)}` +
      `&scope=${encodeURIComponent(SQUARE_SCOPES)}` +
      `&session=false` +
      `&state=${encodeURIComponent(state)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}`
    );
  }

  async handleCallback(tenantId: string, code: string): Promise<SquareConnection> {
    const tokenData = await exchangeSquareCode(code);
    const token = tokenData.access_token;

    const locationsData = (await squareApiRequest('/locations', token)) as {
      locations?: Array<{ id?: string; name?: string; status?: string }>;
    };
    const activeLocation =
      locationsData.locations?.find((l) => l.status === 'ACTIVE') || locationsData.locations?.[0];
    const locationId = activeLocation?.id || '';
    const calendarName = activeLocation?.name || 'Square Appointments';

    let email = '';
    try {
      const merchant = (await squareApiRequest('/merchants/me', token)) as {
        merchant?: { business_name?: string };
      };
      email = merchant.merchant?.business_name || calendarName;
    } catch {
      email = calendarName;
    }

    const expiresAt = tokenData.expires_at ? new Date(tokenData.expires_at) : new Date('2099-01-01');

    const conn = await pool.query(
      `INSERT INTO public.calendar_connections
       (tenant_id, provider, email, access_token, refresh_token, expires_at, status, metadata)
       VALUES ($1, 'square-appointments', $2, $3, $4, $5, 'active', $6)
       ON CONFLICT (tenant_id, provider)
       DO UPDATE SET
         email = $2,
         access_token = $3,
         refresh_token = $4,
         expires_at = $5,
         status = 'active',
         metadata = $6,
         updated_at = NOW()
       RETURNING id, tenant_id, provider, email, access_token, refresh_token, expires_at, status, metadata`,
      [
        tenantId,
        email,
        token,
        tokenData.refresh_token || null,
        expiresAt,
        JSON.stringify({
          locationId,
          calendarName,
          authMode: 'oauth',
        }),
      ]
    );

    return mapConnectionRow(conn.rows[0]);
  }

  async getConnection(tenantId: string): Promise<SquareConnection | null> {
    const result = await pool.query(
      `SELECT id, tenant_id, email, access_token, refresh_token, status, metadata
       FROM public.calendar_connections
       WHERE tenant_id = $1 AND provider = 'square-appointments' AND status = 'active'
       LIMIT 1`,
      [tenantId]
    );
    if (!result.rows.length) return null;
    return mapConnectionRow(result.rows[0]);
  }

  async disconnect(tenantId: string): Promise<void> {
    await pool.query(
      `UPDATE public.calendar_connections SET status = 'expired', updated_at = NOW()
       WHERE tenant_id = $1 AND provider = 'square-appointments'`,
      [tenantId]
    );
    logger.info('[Square] Disconnected', { tenantId });
  }
}

export const squareAppointmentsService = new SquareAppointmentsService();
