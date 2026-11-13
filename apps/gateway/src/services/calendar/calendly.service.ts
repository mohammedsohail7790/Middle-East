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
    throw new CalendlyApiError(res.status, text);
  }

  return res.json();
}

/** Calendly returned a non-2xx. `status` lets callers tell "no scheduling-API
 *  access" (401/403) and "slot taken" (409/422) from a transient failure. */
export class CalendlyApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string
  ) {
    super(`Calendly API error ${status}: ${body.slice(0, 300)}`);
    this.name = 'CalendlyApiError';
  }

  /** Token rejected or plan lacks the Scheduling API: use the link-by-SMS path. */
  get isAccessDenied(): boolean {
    return this.status === 401 || this.status === 403;
  }

  /** Requested time is no longer bookable. */
  get isSlotUnavailable(): boolean {
    return this.status === 409 || this.status === 422;
  }
}

/** Calendly's available-times endpoint accepts at most a 7 day window. */
const CALENDLY_MAX_RANGE_MS = 7 * 24 * 60 * 60 * 1000 - 60_000;

export interface CalendlySchedulingEventType {
  uri: string;
  name: string;
  durationMinutes: number;
}

export interface CalendlyAvailableSlot {
  start: Date;
  end: Date;
}

export interface CalendlyBookingResult {
  /** Full scheduled event URI, used for cancellation. */
  eventUri: string;
  inviteeUri: string;
}

/** The trailing id of a Calendly URI (".../scheduled_events/UUID" -> "UUID"). */
export function calendlyUriId(uri: string): string {
  return uri.split('/').filter(Boolean).pop() || uri;
}

export interface CalendlyConnection {
  id: string;
  tenantId: string;
  organizationUri: string;
  userUri: string;
  accessToken: string;
  email: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
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

async function refreshCalendlyToken(refreshToken: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}> {
  const clientId = process.env.CALENDLY_CLIENT_ID?.trim() || '';
  const clientSecret = process.env.CALENDLY_CLIENT_SECRET?.trim() || '';
  if (!clientId || !clientSecret) throw new Error('Calendly OAuth is not configured on the server');
  const res = await fetch('https://auth.calendly.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
    timeout: CALENDLY_REQUEST_TIMEOUT_MS,
  } as any);
  if (!res.ok) throw new Error(`Calendly token refresh failed (${res.status})`);
  return res.json() as Promise<{ access_token: string; refresh_token?: string; expires_in?: number }>;
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
      `SELECT id, tenant_id, email, access_token, refresh_token, expires_at, status, metadata
       FROM public.calendar_connections
       WHERE tenant_id = $1 AND provider = 'calendly' AND status = 'active'
       LIMIT 1`,
      [tenantId]
    );
    if (!result.rows.length) return null;

    const row = result.rows[0];
    const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata || {};
    const conn: CalendlyConnection = {
      id: row.id,
      tenantId: row.tenant_id,
      organizationUri: meta.organizationUri || '',
      userUri: meta.userUri || '',
      accessToken: row.access_token,
      email: row.email,
      refreshToken: row.refresh_token || meta.refreshToken || null,
      expiresAt: row.expires_at ? new Date(row.expires_at) : null,
    };
    return this.refreshIfExpiring(conn);
  }

  /** Calendly access tokens last ~2h; refresh before use so a live call never hits a stale token. */
  private async refreshIfExpiring(conn: CalendlyConnection): Promise<CalendlyConnection> {
    if (!conn.refreshToken || !conn.expiresAt) return conn;
    if (conn.expiresAt.getTime() - Date.now() > 60_000) return conn;
    try {
      const t = await refreshCalendlyToken(conn.refreshToken);
      const expiresAt = new Date(Date.now() + (t.expires_in ?? 7200) * 1000);
      const refreshToken = t.refresh_token || conn.refreshToken;
      await pool.query(
        `UPDATE public.calendar_connections
         SET access_token = $1, refresh_token = $2, expires_at = $3, updated_at = NOW()
         WHERE id = $4`,
        [t.access_token, refreshToken, expiresAt, conn.id]
      );
      return { ...conn, accessToken: t.access_token, refreshToken, expiresAt };
    } catch (err) {
      logger.warn('[Calendly] Token refresh failed', { tenantId: conn.tenantId, error: String(err) });
      return conn;
    }
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

  /** The event type the receptionist books into: first active, non-secret one. */
  async getSchedulingEventType(tenantId: string): Promise<CalendlySchedulingEventType | null> {
    const types = await this.getEventTypes(tenantId);
    const t =
      types.find((x) => x?.active !== false && x?.secret !== true && x?.uri) ||
      types.find((x) => x?.uri);
    if (!t?.uri) return null;
    return {
      uri: String(t.uri),
      name: String(t.name || 'Appointment'),
      durationMinutes: Number(t.duration) > 0 ? Number(t.duration) : 30,
    };
  }

  /**
   * Open start times Calendly itself reports for the event type (honours the
   * host's availability, buffers, notice and existing bookings). The API caps
   * a request at 7 days, so longer ranges are fetched in chunks.
   */
  async getAvailableTimes(
    tenantId: string,
    eventType: CalendlySchedulingEventType,
    rangeStart: Date,
    rangeEnd: Date
  ): Promise<CalendlyAvailableSlot[]> {
    const conn = await this.getConnection(tenantId);
    if (!conn) throw new Error('No Calendly connection found');

    // Calendly rejects start_time in the past.
    const from = new Date(Math.max(rangeStart.getTime(), Date.now() + 60_000));
    const slots: CalendlyAvailableSlot[] = [];
    for (let cursor = from.getTime(); cursor < rangeEnd.getTime(); cursor += CALENDLY_MAX_RANGE_MS) {
      const chunkEnd = Math.min(cursor + CALENDLY_MAX_RANGE_MS, rangeEnd.getTime());
      const qs = new URLSearchParams({
        event_type: eventType.uri,
        start_time: new Date(cursor).toISOString(),
        end_time: new Date(chunkEnd).toISOString(),
      });
      const res = await calendlyRequest(`/event_type_available_times?${qs.toString()}`, conn.accessToken);
      for (const item of res.collection || []) {
        if (item?.status && item.status !== 'available') continue;
        const start = new Date(item?.start_time);
        if (Number.isNaN(start.getTime())) continue;
        slots.push({ start, end: new Date(start.getTime() + eventType.durationMinutes * 60_000) });
      }
    }
    slots.sort((a, b) => a.start.getTime() - b.start.getTime());
    return slots;
  }

  /**
   * Create the booking through the Scheduling API (POST /invitees) so it shows
   * up in Calendly. Needs the caller's email and a Calendly plan with
   * scheduling-API access; otherwise throws (CalendlyApiError for API refusals).
   */
  async createBooking(
    tenantId: string,
    input: {
      eventType: CalendlySchedulingEventType;
      start: Date;
      name: string;
      email: string;
      phone?: string;
      timezone: string;
    }
  ): Promise<CalendlyBookingResult> {
    const conn = await this.getConnection(tenantId);
    if (!conn) throw new Error('No Calendly connection found');

    const res = await calendlyRequest('/invitees', conn.accessToken, {
      method: 'POST',
      body: JSON.stringify({
        event_type: input.eventType.uri,
        start_time: input.start.toISOString(),
        invitee: { name: input.name, email: input.email, timezone: input.timezone },
        ...(input.phone && /^\+[1-9]\d{6,14}$/.test(input.phone)
          ? { text_reminder_number: input.phone }
          : {}),
      }),
    });
    const r = res?.resource;
    const eventUri = String(r?.event || '');
    if (!eventUri) throw new Error('Calendly did not confirm the booking (no event in response)');
    return { eventUri, inviteeUri: String(r?.uri || '') };
  }

  /** First invitee of a scheduled event: the details needed to rebook it. */
  async getEventInvitee(
    tenantId: string,
    eventUri: string
  ): Promise<{ name: string; email: string }> {
    const conn = await this.getConnection(tenantId);
    if (!conn) throw new Error('No Calendly connection found');
    const res = await calendlyRequest(
      `/scheduled_events/${encodeURIComponent(calendlyUriId(eventUri))}/invitees?status=active&count=1`,
      conn.accessToken
    );
    const inv = (res.collection || [])[0];
    if (!inv?.email) throw new Error('Calendly invitee not found for event');
    return { name: String(inv.name || ''), email: String(inv.email) };
  }

  /** Cancel a scheduled event (POST /scheduled_events/{uuid}/cancellation). */
  async cancelScheduledEvent(tenantId: string, eventUri: string, reason?: string): Promise<void> {
    const conn = await this.getConnection(tenantId);
    if (!conn) throw new Error('No Calendly connection found');
    try {
      await calendlyRequest(
        `/scheduled_events/${encodeURIComponent(calendlyUriId(eventUri))}/cancellation`,
        conn.accessToken,
        { method: 'POST', body: JSON.stringify({ reason: reason || 'Cancelled via Halla AI' }) }
      );
    } catch (err) {
      // Already cancelled in Calendly (e.g. by the host): nothing left to do.
      if (err instanceof CalendlyApiError && err.status === 400 && /already/i.test(err.body)) return;
      throw err;
    }
  }

  async cancelEvent(tenantId: string, eventUri: string): Promise<void> {
    const conn = await this.getConnection(tenantId);
    if (!conn) throw new Error('No Calendly connection found');

    await calendlyRequest(`/scheduled_events/${eventUri}/cancellation`, conn.accessToken, {
      method: 'POST',
      body: JSON.stringify({ reason: 'Cancelled via Halla AI' }),
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

