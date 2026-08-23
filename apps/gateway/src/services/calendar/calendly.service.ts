/**
 * Calendly Integration Service
 * Uses Calendly API v2 for event type scheduling, webhook events, and availability.
 * Docs: https://developer.calendly.com/api-docs
 */

import fetch from 'node-fetch';
import { pool } from '../db/pool.js';
import { getCalendlyRedirectUri, getCalendlyWebhookBaseUrl } from '../env.js';
import { logger } from '../logger.js';

const CALENDLY_BASE_URL = 'https://api.calendly.com';

interface CalendlyApiOptions {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
}

/** Callers on a live voice call can't afford Calendly hanging (e.g. a lapsed
 *  paid plan responding slowly instead of erroring outright) — cap every
 *  request so a stalled Calendly account can't stall the conversation. */
const CALENDLY_REQUEST_TIMEOUT_MS = 6000;

async function calendlyRequest(
  path: string,
  token: string,
  options: CalendlyApiOptions = {}
): Promise<any> {
  const url = `${CALENDLY_BASE_URL}${path}`;
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: options.body,
    timeout: CALENDLY_REQUEST_TIMEOUT_MS,
  } as any);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Calendly API error ${res.status}: ${text}`);
  }

  return res.json();
}

export interface CalendlyConnection {
  id: string;
  tenantId: string;
  organizationUri: string;
  userUri: string;
  accessToken: string;
  email: string;
}

export interface CalendlyEvent {
  id: string;
  tenantId: string;
  calendlyUri: string;
  title: string;
  startTime: Date;
  endTime: Date;
  attendeeEmail: string;
  attendeePhone: string;
  status: 'scheduled' | 'cancelled';
}

async function exchangeCalendlyCode(code: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}> {
  const clientId = process.env.CALENDLY_CLIENT_ID?.trim() || '';
  const clientSecret = process.env.CALENDLY_CLIENT_SECRET?.trim() || '';
  const redirectUri = getCalendlyRedirectUri();

  if (!clientId || !clientSecret) {
    throw new Error('Calendly OAuth is not configured on the server (CALENDLY_CLIENT_ID / SECRET)');
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const tokenRes = await fetch('https://auth.calendly.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  } as any);

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    throw new Error(`Calendly token error: ${text}`);
  }

  return tokenRes.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  }>;
}

export class CalendlyService {
  isConfigured(): boolean {
    return !!(
      process.env.CALENDLY_CLIENT_ID?.trim() && process.env.CALENDLY_CLIENT_SECRET?.trim()
    );
  }

  getAuthUrl(tenantId: string): string {
    const clientId = process.env.CALENDLY_CLIENT_ID?.trim() || '';
    if (!clientId) {
      throw new Error('CALENDLY_CLIENT_ID is not configured on the gateway');
    }
    const redirectUri = getCalendlyRedirectUri();
    const state = Buffer.from(JSON.stringify({ tenantId })).toString('base64url');
    return `https://auth.calendly.com/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${encodeURIComponent(state)}`;
  }

  async handleCallback(tenantId: string, code: string): Promise<CalendlyConnection> {
    const tokenData = await exchangeCalendlyCode(code);
    const token = tokenData.access_token;
    const expiresAt = new Date(Date.now() + (tokenData.expires_in ?? 7200) * 1000);

    const userRes = await calendlyRequest('/users/me', token);
    const user = userRes.resource;

    const metadata = {
      organizationUri: user.current_organization,
      userUri: user.uri,
      refreshToken: tokenData.refresh_token || null,
    };

    const conn = await pool.query(
      `INSERT INTO public.calendar_connections 
       (tenant_id, provider, email, access_token, refresh_token, expires_at, status, metadata)
       VALUES ($1, 'calendly', $2, $3, $4, $5, 'active', $6)
       ON CONFLICT (tenant_id, provider)
       DO UPDATE SET 
         email = $2,
         access_token = $3,
         refresh_token = $4,
         expires_at = $5,
         status = 'active',
         metadata = $6,
         updated_at = NOW()
       RETURNING id, tenant_id, provider, email, access_token, expires_at, status, metadata`,
      [
        tenantId,
        user.email,
        token,
        tokenData.refresh_token || null,
        expiresAt,
        JSON.stringify(metadata),
      ]
    );

    const connection: CalendlyConnection = {
      id: conn.rows[0].id,
      tenantId: conn.rows[0].tenant_id,
      organizationUri: user.current_organization,
      userUri: user.uri,
      accessToken: token,
      email: user.email,
    };

    void this.ensureWebhookSubscription(connection).catch((err) => {
      logger.warn('[Calendly] Webhook subscription failed', { error: String(err), tenantId });
    });

    return connection;
  }

  async ensureWebhookSubscription(conn: CalendlyConnection): Promise<void> {
    if (!conn.organizationUri) return;
    const webhookUrl = `${getCalendlyWebhookBaseUrl()}?tenant_id=${encodeURIComponent(conn.tenantId)}`;
    await calendlyRequest('/webhook_subscriptions', conn.accessToken, {
      method: 'POST',
      body: JSON.stringify({
        url: webhookUrl,
        events: ['invitee.created', 'invitee.canceled'],
        organization: conn.organizationUri,
        scope: 'organization',
      }),
    });
    logger.info('[Calendly] Webhook subscription registered', {
      tenantId: conn.tenantId,
      webhookUrl,
    });
  }

  async handleWebhookPayload(
    tenantId: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    const event = payload.event as string | undefined;
    const data = payload.payload as Record<string, unknown> | undefined;
    if (!event || !data) return;

    const conn = await pool.query(
      `SELECT id FROM public.calendar_connections
       WHERE tenant_id = $1 AND provider = 'calendly' AND status = 'active' LIMIT 1`,
      [tenantId]
    );
    const connectionId = conn.rows[0]?.id as string | undefined;
    if (!connectionId) {
      logger.warn('[Calendly] Webhook for tenant without active connection', { tenantId, event });
      return;
    }

    if (event === 'invitee.created') {
      const invitee = data as Record<string, unknown>;
      const scheduled = invitee.scheduled_event as Record<string, unknown> | undefined;
      const start = scheduled?.start_time as string | undefined;
      const end = scheduled?.end_time as string | undefined;
      const title = (scheduled?.name as string) || 'Calendly booking';
      const externalId = (scheduled?.uri as string) || (invitee.uri as string) || '';

      if (start && externalId) {
        await pool.query(
          `INSERT INTO public.calendar_events
           (calendar_connection_id, external_event_id, title, start_time, end_time, is_busy)
           VALUES ($1, $2, $3, $4, $5, true)
           ON CONFLICT (calendar_connection_id, external_event_id) DO UPDATE SET
             title = EXCLUDED.title,
             start_time = EXCLUDED.start_time,
             end_time = EXCLUDED.end_time,
             is_busy = EXCLUDED.is_busy`,
          [connectionId, externalId, title, start, end || start]
        );
      }
    }

    if (event === 'invitee.canceled') {
      const scheduled = (data as Record<string, unknown>).scheduled_event as
        | Record<string, unknown>
        | undefined;
      const externalId = scheduled?.uri as string | undefined;
      if (externalId) {
        await pool.query(
          `DELETE FROM public.calendar_events
           WHERE calendar_connection_id = $1 AND external_event_id = $2`,
          [connectionId, externalId]
        );
      }
    }
  }

  async getConnection(tenantId: string): Promise<CalendlyConnection | null> {
    const result = await pool.query(
      `SELECT id, tenant_id, email, access_token, expires_at, status, metadata
       FROM public.calendar_connections
       WHERE tenant_id = $1 AND provider = 'calendly' AND status = 'active'
       LIMIT 1`,
      [tenantId]
    );
    if (!result.rows.length) return null;

    const row = result.rows[0];
    const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata || {};
    return {
      id: row.id,
      tenantId: row.tenant_id,
      organizationUri: meta.organizationUri || '',
      userUri: meta.userUri || '',
      accessToken: row.access_token,
      email: row.email,
    };
  }

  async getEventTypes(tenantId: string): Promise<any[]> {
    const conn = await this.getConnection(tenantId);
    if (!conn) throw new Error('No Calendly connection found');

    const res = await calendlyRequest(
      `/event_types?organization=${encodeURIComponent(conn.organizationUri)}`,
      conn.accessToken
    );
    return res.collection || [];
  }

  async getScheduledEvents(
    tenantId: string,
    maxStartTime?: string,
    minStartTime?: string
  ): Promise<any[]> {
    const conn = await this.getConnection(tenantId);
    if (!conn) throw new Error('No Calendly connection found');

    let path = `/scheduled_events?organization=${encodeURIComponent(conn.organizationUri)}`;
    if (maxStartTime) path += `&max_start_time=${encodeURIComponent(maxStartTime)}`;
    if (minStartTime) path += `&min_start_time=${encodeURIComponent(minStartTime)}`;

    const res = await calendlyRequest(path, conn.accessToken);
    return res.collection || [];
  }

  async createInviteLink(
    tenantId: string,
    eventTypeId: string,
    startTime: string
  ): Promise<string> {
    const conn = await this.getConnection(tenantId);
    if (!conn) throw new Error('No Calendly connection found');

    const res = await calendlyRequest(
      `/event_types/${eventTypeId}/booking_questions`,
      conn.accessToken
    );

    // Return the Calendly booking URL with pre-filled time
    return `https://calendly.com/${res.resource?.slug || eventTypeId}/${startTime}`;
  }

  async cancelEvent(tenantId: string, eventUri: string): Promise<void> {
    const conn = await this.getConnection(tenantId);
    if (!conn) throw new Error('No Calendly connection found');

    await calendlyRequest(`/scheduled_events/${eventUri}/cancellation`, conn.accessToken, {
      method: 'POST',
      body: JSON.stringify({ reason: 'Cancelled via Call IQ' }),
    });

    await pool.query(
      `UPDATE public.calendar_events SET status = 'cancelled', updated_at = NOW() WHERE external_id = $1`,
      [eventUri]
    );
  }

  async disconnect(tenantId: string): Promise<void> {
    await pool.query(
      `UPDATE public.calendar_connections SET status = 'expired', updated_at = NOW() WHERE tenant_id = $1 AND provider = 'calendly'`,
      [tenantId]
    );
  }
}

export const calendlyService = new CalendlyService();

