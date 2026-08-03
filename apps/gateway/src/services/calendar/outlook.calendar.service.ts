import { pool } from '../db/pool.js';

/**
 * Outlook Calendar Service — Microsoft Graph API
 * Full OAuth2 flow, event CRUD, availability checks.
 */

import { ConfidentialClientApplication } from '@azure/msal-node';
import { Client } from '@microsoft/microsoft-graph-client';
import { getOutlookCalendarRedirectUri } from '../env.js';
import { mapOutlookCalendarConnectionRow } from './calendar-connection-map.js';

const MS_CLIENT_ID = process.env.MS_CLIENT_ID || '';
const MS_CLIENT_SECRET = process.env.MS_CLIENT_SECRET || '';
const MS_TENANT_ID = process.env.MS_TENANT_ID || 'common';
const MS_REDIRECT_URI = getOutlookCalendarRedirectUri();

const MS_AUTHORITY = `https://login.microsoftonline.com/${MS_TENANT_ID}`;
const MS_SCOPES = [
  'https://graph.microsoft.com/Calendars.ReadWrite',
  'https://graph.microsoft.com/User.Read',
  'offline_access',
];

function extractRefreshTokenFromMsalCache(msal: ConfidentialClientApplication): string {
  try {
    const serialized = msal.getTokenCache().serialize();
    const parsed = JSON.parse(serialized) as { RefreshToken?: Record<string, { secret?: string }> };
    const tokens = parsed.RefreshToken || {};
    const first = Object.values(tokens)[0];
    return first?.secret?.trim() || '';
  } catch {
    return '';
  }
}

function getMsalClient(): ConfidentialClientApplication {
  return new ConfidentialClientApplication({
    auth: {
      clientId: MS_CLIENT_ID,
      clientSecret: MS_CLIENT_SECRET,
      authority: MS_AUTHORITY,
    },
  });
}

function getGraphClient(accessToken: string): Client {
  return Client.init({
    authProvider: (done) => {
      done(null, accessToken);
    },
  });
}

export interface OutlookCalendarConnection {
  id: string;
  tenantId: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  status: 'active' | 'expired' | 'error';
}

export interface OutlookCalendarEvent {
  id: string;
  externalId: string;
  subject: string;
  body?: string;
  start: Date;
  end: Date;
  attendeeEmail?: string;
  attendeePhone?: string;
}

export class OutlookCalendarService {
  isConfigured(): boolean {
    return !!(MS_CLIENT_ID && MS_CLIENT_SECRET);
  }

  getRedirectUri(): string {
    return MS_REDIRECT_URI;
  }

  getTenantAuthority(): string {
    return MS_TENANT_ID;
  }

  async getAuthUrl(tenantId: string): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('Outlook OAuth is not configured on the server (MS_CLIENT_ID / MS_CLIENT_SECRET)');
    }
    const msal = getMsalClient();
    return msal.getAuthCodeUrl({
      scopes: MS_SCOPES,
      redirectUri: MS_REDIRECT_URI,
      state: tenantId,
      responseMode: 'query',
    });
  }

  async handleCallback(tenantId: string, code: string): Promise<OutlookCalendarConnection> {
    const msal = getMsalClient();
    const result = await msal.acquireTokenByCode({
      code,
      scopes: MS_SCOPES,
      redirectUri: MS_REDIRECT_URI,
    });

    if (!result?.accessToken || !result?.account) {
      throw new Error('Failed to acquire Outlook access token');
    }

    const email = (result.account as any).username || '';
    const expiresAt = result.expiresOn || new Date(Date.now() + 3600000);
    const refreshToken = extractRefreshTokenFromMsalCache(msal);

    const connResult = await pool.query(
      `INSERT INTO public.calendar_connections 
       (tenant_id, provider, email, access_token, refresh_token, expires_at, status)
       VALUES ($1, 'outlook', $2, $3, $4, $5, 'active')
       ON CONFLICT (tenant_id, provider)
       DO UPDATE SET 
         email = $2,
         access_token = $3,
         refresh_token = COALESCE(NULLIF($4, ''), calendar_connections.refresh_token),
         expires_at = $5,
         status = 'active',
         updated_at = NOW()
       RETURNING id, tenant_id, provider, email, access_token, refresh_token, expires_at, status`,
      [tenantId, email, result.accessToken, refreshToken, expiresAt]
    );

    return mapOutlookCalendarConnectionRow(connResult.rows[0] as Record<string, unknown>);
  }

  async getConnection(tenantId: string): Promise<OutlookCalendarConnection | null> {
    const result = await pool.query(
      `SELECT id, tenant_id, provider, email, access_token, refresh_token, expires_at, status
       FROM public.calendar_connections
       WHERE tenant_id = $1 AND provider = 'outlook' AND status = 'active'
       LIMIT 1`,
      [tenantId]
    );
    return result.rows[0]
      ? mapOutlookCalendarConnectionRow(result.rows[0] as Record<string, unknown>)
      : null;
  }

  private async getFreshToken(conn: OutlookCalendarConnection): Promise<string> {
    if (new Date() < new Date(conn.expiresAt)) {
      return conn.accessToken;
    }

    if (!conn.refreshToken) {
      throw new Error('Outlook refresh token not available');
    }

    const msal = getMsalClient();
    const result = await msal.acquireTokenByRefreshToken({
      refreshToken: conn.refreshToken,
      scopes: MS_SCOPES,
    });

    if (!result?.accessToken) {
      throw new Error('Failed to refresh Outlook token');
    }

    const newExpires = result.expiresOn || new Date(Date.now() + 3600000);
    await pool.query(
      `UPDATE public.calendar_connections
       SET access_token = $1, expires_at = $2, updated_at = NOW()
       WHERE id = $3`,
      [result.accessToken, newExpires, conn.id]
    );

    return result.accessToken;
  }

  async createEvent(
    tenantId: string,
    title: string,
    startTime: Date,
    endTime: Date,
    attendeeEmail?: string,
    attendeePhone?: string,
    description?: string
  ): Promise<OutlookCalendarEvent> {
    const conn = await this.getConnection(tenantId);
    if (!conn) throw new Error('No Outlook calendar connection found');

    const token = await this.getFreshToken(conn);
    const graph = getGraphClient(token);

    const eventBody: any = {
      subject: title,
      body: { contentType: 'HTML', content: description || '' },
      start: { dateTime: startTime.toISOString(), timeZone: 'UTC' },
      end: { dateTime: endTime.toISOString(), timeZone: 'UTC' },
      attendees: attendeeEmail
        ? [{ emailAddress: { address: attendeeEmail }, type: 'required' }]
        : [],
    };

    const event = await graph.api('/me/calendar/events').post(eventBody);

    const dbResult = await pool.query(
      `INSERT INTO public.calendar_events
       (tenant_id, external_id, title, description, start_time, end_time, attendee_email, attendee_phone, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'scheduled')
       RETURNING id, tenant_id, external_id, title, description, start_time, end_time, attendee_email, attendee_phone, status, reminder_sent`,
      [tenantId, event.id, title, description, startTime, endTime, attendeeEmail, attendeePhone]
    );

    return {
      id: dbResult.rows[0].id,
      externalId: event.id,
      subject: title,
      body: description,
      start: startTime,
      end: endTime,
      attendeeEmail,
      attendeePhone,
    };
  }

  async getAvailability(
    tenantId: string,
    startDate: Date,
    endDate: Date,
    duration: number = 60
  ): Promise<Array<{ start: Date; end: Date; available: boolean }>> {
    const conn = await this.getConnection(tenantId);
    if (!conn) throw new Error('No Outlook calendar connection found');

    const token = await this.getFreshToken(conn);
    const graph = getGraphClient(token);

    const events = await graph
      .api('/me/calendarView')
      .query({
        startDateTime: startDate.toISOString(),
        endDateTime: endDate.toISOString(),
      })
      .get();

    const busySlots = (events.value || []).map((e: any) => ({
      start: new Date(e.start.dateTime),
      end: new Date(e.end.dateTime),
    }));

    const businessHoursResult = await pool.query(
      `SELECT day_of_week, start_time, end_time, is_open FROM public.business_hours WHERE tenant_id = $1`,
      [tenantId]
    );
    const businessHours = businessHoursResult.rows;

    const slots: Array<{ start: Date; end: Date; available: boolean }> = [];
    const current = new Date(startDate);

    while (current < endDate) {
      const dayOfWeek = current.getDay();
      const bh = businessHours.find((b: any) => b.day_of_week === dayOfWeek);

      if (bh && bh.is_open) {
        const [startHour, startMin] = bh.start_time.split(':').map(Number);
        const [endHour, endMin] = bh.end_time.split(':').map(Number);

        const slotStart = new Date(current);
        slotStart.setHours(startHour, startMin, 0, 0);
        const slotEnd = new Date(current);
        slotEnd.setHours(endHour, endMin, 0, 0);

        let cur = new Date(slotStart);
        while (cur < slotEnd) {
          const slotEndT = new Date(cur.getTime() + duration * 60000);
          const conflict = busySlots.some(
            (b: any) => cur < b.end && slotEndT > b.start
          );
          slots.push({ start: new Date(cur), end: slotEndT, available: !conflict });
          cur = slotEndT;
        }
      }

      current.setDate(current.getDate() + 1);
      current.setHours(0, 0, 0, 0);
    }

    return slots;
  }

  async updateEvent(
    tenantId: string,
    eventId: string,
    startTime: Date,
    endTime: Date
  ): Promise<any> {
    const conn = await this.getConnection(tenantId);
    if (!conn) throw new Error('No Outlook calendar connection found');

    const token = await this.getFreshToken(conn);
    const graph = getGraphClient(token);

    const eventResult = await pool.query(
      'SELECT external_id FROM public.calendar_events WHERE id = $1 AND tenant_id = $2',
      [eventId, tenantId]
    );
    if (!eventResult.rows.length) throw new Error('Event not found');

    await graph
      .api(`/me/calendar/events/${eventResult.rows[0].external_id}`)
      .patch({
        start: { dateTime: startTime.toISOString(), timeZone: 'UTC' },
        end: { dateTime: endTime.toISOString(), timeZone: 'UTC' },
      });

    const dbResult = await pool.query(
      `UPDATE public.calendar_events
       SET start_time = $1, end_time = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [startTime, endTime, eventId]
    );
    return dbResult.rows[0];
  }

  async cancelEvent(tenantId: string, eventId: string): Promise<void> {
    const conn = await this.getConnection(tenantId);
    if (!conn) throw new Error('No Outlook calendar connection found');

    const token = await this.getFreshToken(conn);
    const graph = getGraphClient(token);

    const eventResult = await pool.query(
      'SELECT external_id FROM public.calendar_events WHERE id = $1 AND tenant_id = $2',
      [eventId, tenantId]
    );
    if (!eventResult.rows.length) throw new Error('Event not found');

    await graph.api(`/me/calendar/events/${eventResult.rows[0].external_id}`).delete();

    await pool.query(
      `UPDATE public.calendar_events SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
      [eventId]
    );
  }

  /**
   * Pull Outlook events into calendar_events cache (migration 004 schema).
   */
  async syncExternalEventsCache(tenantId: string): Promise<number> {
    const conn = await this.getConnection(tenantId);
    if (!conn?.id) return 0;

    const from = new Date();
    from.setDate(from.getDate() - 14);
    const to = new Date();
    to.setDate(to.getDate() + 120);

    const token = await this.getFreshToken(conn);
    const graph = getGraphClient(token);
    const events = await graph
      .api('/me/calendarView')
      .query({
        startDateTime: from.toISOString(),
        endDateTime: to.toISOString(),
      })
      .get();

    const { batchUpsertCalendarEvents } = await import('./calendar-event-batch.js');
    const rows: Array<{
      externalEventId: string;
      title: string;
      startTime: Date;
      endTime: Date;
    }> = [];

    for (const item of events.value || []) {
      if (!item.id || !item.start?.dateTime || !item.end?.dateTime) continue;
      const startTime = new Date(item.start.dateTime);
      const endTime = new Date(item.end.dateTime);
      if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) continue;

      rows.push({
        externalEventId: item.id,
        title: item.subject || 'Busy',
        startTime,
        endTime,
      });
    }

    const count = await batchUpsertCalendarEvents(conn.id, rows);

    await pool.query(
      `UPDATE public.calendar_connections SET last_sync_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [conn.id]
    );

    return count;
  }

  async disconnect(tenantId: string): Promise<void> {
    await pool.query(
      `UPDATE public.calendar_connections SET status = 'expired', updated_at = NOW() WHERE tenant_id = $1 AND provider = 'outlook'`,
      [tenantId]
    );
  }
}

export const outlookCalendarService = new OutlookCalendarService();

