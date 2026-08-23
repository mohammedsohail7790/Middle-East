/**
 * Calendar Service
 * Handles calendar integration with Google Calendar
 */

import { google } from 'googleapis';
import { getGoogleCalendarRedirectUri } from '../env.js';
import { voiceDb } from '../voice/tenant-scope.js';
import { getTenantTimezone } from '../appointments/tenant-timezone.js';
import { getBusinessHoursColumnSet, rowIsOpen } from '../business-hours/business-hours-schema.js';
import { mapGoogleCalendarConnectionRow } from './calendar-connection-map.js';

/** Legacy calendar_events / business_hours queries — same DB as voice pipeline */
const pool = voiceDb;

/** Tenant-scoped rows (calls, leads, appointments) — same DB as voice pipeline */
const tenantDb = voiceDb;

async function syncGoogleTokensToVoiceTenant(
  tenantId: string,
  accessToken: string,
  refreshToken: string | null
): Promise<void> {
  await voiceDb.query(
    `UPDATE public.voice_tenants
     SET google_access_token = $2,
         google_refresh_token = COALESCE($3, google_refresh_token),
         updated_at = NOW()
     WHERE id = $1`,
    [tenantId, accessToken, refreshToken]
  );
}

export interface CalendarConnection {
  id: string;
  tenantId: string;
  provider: 'google' | 'outlook';
  email: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  status: 'active' | 'expired' | 'error';
}

export interface CalendarEvent {
  id: string;
  tenantId: string;
  externalId: string;
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  attendeeEmail?: string;
  attendeePhone?: string;
  status: 'scheduled' | 'confirmed' | 'cancelled';
  reminderSent: boolean;
}

export interface AvailabilitySlot {
  start: Date;
  end: Date;
  available: boolean;
}

function assertGoogleOAuthConfigured(): void {
  if (!process.env.GOOGLE_CLIENT_ID?.trim() || !process.env.GOOGLE_CLIENT_SECRET?.trim()) {
    throw new Error(
      'Google Calendar is not configured on the server. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on Render.'
    );
  }
}

function emailFromIdToken(idToken: string | undefined | null): string {
  if (!idToken) return '';
  try {
    const payload = JSON.parse(
      Buffer.from(idToken.split('.')[1] || '', 'base64url').toString('utf8')
    ) as { email?: string };
    return payload.email?.trim() || '';
  } catch {
    return '';
  }
}

function googleOAuthClient() {
  const redirectUri = getGoogleCalendarRedirectUri();
  assertGoogleOAuthConfigured();
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );
}

const calendarConnectionCache = new Map<
  string,
  { connected: boolean; expiresAt: number }
>();

export class CalendarService {
  /**
   * Get OAuth URL for Google Calendar
   */
  getGoogleAuthUrl(tenantId: string): string {
    const oauth2Client = googleOAuthClient();

    const scopes = [
      'openid',
      'email',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
    ];

    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: true,
      scope: scopes,
      state: tenantId,
    });
  }

  /**
   * Handle OAuth callback and store tokens
   */
  async handleGoogleCallback(
    tenantId: string,
    code: string
  ): Promise<CalendarConnection> {
    try {
      const redirectUri = getGoogleCalendarRedirectUri();
      const oauth2Client = googleOAuthClient();

      const tokenParams = new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!.trim(),
        client_secret: process.env.GOOGLE_CLIENT_SECRET!.trim(),
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      });

      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenParams.toString(),
      });

      const tokenJson = (await tokenRes.json()) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        id_token?: string;
        error?: string;
        error_description?: string;
      };

      if (!tokenRes.ok || tokenJson.error) {
        const detail = tokenJson.error_description || tokenJson.error || `HTTP ${tokenRes.status}`;
        if (/invalid_client|unauthorized_client/i.test(detail)) {
          throw new Error(
            'Google rejected GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET on Render. Re-copy both from Google Cloud → Credentials → your Web client.'
          );
        }
        throw new Error(`Google token exchange failed: ${detail}`);
      }

      const tokens = {
        access_token: tokenJson.access_token,
        refresh_token: tokenJson.refresh_token,
        expiry_date: tokenJson.expires_in
          ? Date.now() + tokenJson.expires_in * 1000
          : undefined,
        id_token: tokenJson.id_token,
      };

      oauth2Client.setCredentials(tokens);

      if (!tokens.access_token) {
        throw new Error('Google did not return an access token — try connecting again');
      }

      const email =
        emailFromIdToken(tokens.id_token) ||
        `calendar-${tenantId.slice(0, 8)}@connected.calliq.local`;

      const expiresAt = new Date(tokens.expiry_date || Date.now() + 3600000);

      await syncGoogleTokensToVoiceTenant(
        tenantId,
        tokens.access_token,
        tokens.refresh_token ?? null
      );

      let row: CalendarConnection;
      try {
        await voiceDb.query(
          `DELETE FROM public.calendar_connections WHERE tenant_id = $1 AND provider = 'google'`,
          [tenantId]
        );

        const result = await voiceDb.query(
          `INSERT INTO public.calendar_connections 
           (tenant_id, provider, email, access_token, refresh_token, token_expires_at, expires_at, status)
           VALUES ($1, 'google', $2, $3, $4, $5, $5, 'active')
           RETURNING id, tenant_id, provider, email, access_token, refresh_token,
                     COALESCE(expires_at, token_expires_at) AS expires_at, status`,
          [
            tenantId,
            email,
            tokens.access_token,
            tokens.refresh_token ?? null,
            expiresAt,
          ]
        );
        row = result.rows[0];
      } catch (dbErr) {
        console.warn('[Calendar] calendar_connections row skipped:', dbErr);
        row = {
          id: tenantId,
          tenantId,
          provider: 'google',
          email,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token ?? '',
          expiresAt,
          status: 'active',
        };
      }

      console.log(`[Calendar] Google Calendar connected for tenant ${tenantId}`);

      return row;
    } catch (error: unknown) {
      console.error('[Calendar] Error handling Google callback:', error);
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Google Calendar connection failed');
    }
  }

  /**
   * Get calendar connection for tenant
   */
  async getConnection(tenantId: string): Promise<CalendarConnection | null> {
    try {
      const result = await voiceDb.query(
        `SELECT id, tenant_id, provider, email, access_token, refresh_token,
                COALESCE(expires_at, token_expires_at) AS expires_at,
                COALESCE(status, 'active') AS status
         FROM public.calendar_connections
         WHERE tenant_id = $1 AND provider = 'google'
           AND COALESCE(status, 'active') = 'active'
           AND access_token IS NOT NULL
         LIMIT 1`,
        [tenantId]
      );

      if (!result.rows[0]) return null;
      return mapGoogleCalendarConnectionRow(result.rows[0] as Record<string, unknown>);
    } catch (error) {
      console.error('[Calendar] Error getting connection:', error);
      throw error;
    }
  }

  /**
   * Refresh access token if expired
   */
  async refreshAccessToken(connection: CalendarConnection): Promise<string> {
    try {
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        getGoogleCalendarRedirectUri()
      );

      oauth2Client.setCredentials({
        refresh_token: connection.refreshToken,
      });

      const { credentials } = await oauth2Client.refreshAccessToken();
      const newAccessToken = credentials.access_token!;

      // Update in database
      const expiresAt = new Date(credentials.expiry_date || Date.now() + 3600000);
      await voiceDb.query(
        `UPDATE public.calendar_connections
         SET access_token = $1,
             expires_at = $2,
             token_expires_at = $2,
             updated_at = NOW()
         WHERE id = $3`,
        [newAccessToken, expiresAt, connection.id]
      );

      await syncGoogleTokensToVoiceTenant(connection.tenantId, newAccessToken, null);

      console.log(`[Calendar] Access token refreshed for connection ${connection.id}`);

      return newAccessToken;
    } catch (error) {
      console.error('[Calendar] Error refreshing token:', error);
      throw error;
    }
  }

  /**
   * Get authenticated Google Calendar client
   */
  private async getGoogleClient(tenantId: string) {
    const connection = await this.getConnection(tenantId);
    if (!connection) {
      throw new Error('No calendar connection found');
    }

    // Check if token is expired
    if (new Date() >= new Date(connection.expiresAt)) {
      connection.accessToken = await this.refreshAccessToken(connection);
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      getGoogleCalendarRedirectUri()
    );

    oauth2Client.setCredentials({
      access_token: connection.accessToken,
      refresh_token: connection.refreshToken,
    });

    return google.calendar({ version: 'v3', auth: oauth2Client });
  }

  /**
   * Pull Google Calendar events into calendar_events cache for dashboard + availability.
   */
  async syncExternalEventsCache(tenantId: string): Promise<number> {
    const connection = await this.getConnection(tenantId);
    if (!connection?.id) return 0;

    const from = new Date();
    from.setDate(from.getDate() - 14);
    const to = new Date();
    to.setDate(to.getDate() + 120);

    const calendar = await this.getGoogleClient(tenantId);
    const list = await calendar.events.list({
      calendarId: 'primary',
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 500,
    });

    const { batchUpsertCalendarEvents } = await import('./calendar-event-batch.js');
    const rows: Array<{
      externalEventId: string;
      title: string;
      startTime: Date;
      endTime: Date;
    }> = [];

    for (const item of list.data.items || []) {
      const startRaw = item.start?.dateTime || item.start?.date;
      const endRaw = item.end?.dateTime || item.end?.date;
      if (!startRaw || !endRaw || !item.id) continue;

      const startTime = new Date(startRaw);
      const endTime = new Date(endRaw);
      if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) continue;

      rows.push({
        externalEventId: item.id,
        title: item.summary || 'Busy',
        startTime,
        endTime,
      });
    }

    const count = await batchUpsertCalendarEvents(connection.id, rows);

    await voiceDb.query(
      `UPDATE public.calendar_connections SET last_sync_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [connection.id]
    );

    return count;
  }

  /** True when Google (or other) calendar OAuth is connected for this tenant. */
  async hasActiveConnection(tenantId: string): Promise<boolean> {
    const ttlMs = Number(process.env.VOICE_CALENDAR_CONN_CACHE_TTL_MS || 120_000);
    const cached = calendarConnectionCache.get(tenantId);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.connected;
    }
    try {
      const connection = await this.getConnection(tenantId);
      const connected = !!connection;
      calendarConnectionCache.set(tenantId, {
        connected,
        expiresAt: Date.now() + ttlMs,
      });
      return connected;
    } catch {
      calendarConnectionCache.set(tenantId, {
        connected: false,
        expiresAt: Date.now() + ttlMs,
      });
      return false;
    }
  }

  /**
   * Create event in Google Calendar only (no local appointments row).
   * Used by appointment booking so Call IQ DB stays the source of truth for the dashboard.
   */
  async createGoogleEventOnly(
    tenantId: string,
    title: string,
    startTime: Date,
    endTime: Date,
    description?: string,
    attendeeEmail?: string
  ): Promise<string> {
    const calendar = await this.getGoogleClient(tenantId);
    const timeZone = await getTenantTimezone(tenantId);
    const event = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: title,
        description,
        start: {
          dateTime: startTime.toISOString(),
          timeZone,
        },
        end: {
          dateTime: endTime.toISOString(),
          timeZone,
        },
        attendees: attendeeEmail ? [{ email: attendeeEmail }] : [],
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 24 * 60 },
            { method: 'popup', minutes: 60 },
          ],
        },
      },
    });
    return event.data.id || '';
  }

  /**
   * Create calendar event
   */
  async createEvent(
    tenantId: string,
    title: string,
    startTime: Date,
    endTime: Date,
    attendeeEmail?: string,
    attendeePhone?: string,
    description?: string
  ): Promise<CalendarEvent> {
    try {
      const calendar = await this.getGoogleClient(tenantId);
      const timeZone = await getTenantTimezone(tenantId);

      // Create event in Google Calendar
      const event = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: {
          summary: title,
          description,
          start: {
            dateTime: startTime.toISOString(),
            timeZone,
          },
          end: {
            dateTime: endTime.toISOString(),
            timeZone,
          },
          attendees: attendeeEmail ? [{ email: attendeeEmail }] : [],
          reminders: {
            useDefault: false,
            overrides: [
              { method: 'email', minutes: 24 * 60 }, // 1 day before
              { method: 'popup', minutes: 60 }, // 1 hour before
            ],
          },
        },
      });

      const attendeeName = attendeeEmail || title || 'Guest';
      const result = await pool.query(
        `INSERT INTO public.appointments
         (tenant_id, name, phone, service, scheduled_time, status, calendar_event_id)
         VALUES ($1, $2, $3, $4, $5, 'booked', $6)
         RETURNING id, tenant_id, name, service, scheduled_time, status, calendar_event_id`,
        [
          tenantId,
          attendeeName,
          attendeePhone || 'unknown',
          title,
          startTime,
          event.data.id,
        ]
      );

      console.log(`[Calendar] Appointment created: ${result.rows[0].id}`);

      return {
        id: result.rows[0].id,
        tenantId: result.rows[0].tenant_id,
        externalId: result.rows[0].calendar_event_id ?? '',
        title,
        startTime: result.rows[0].scheduled_time,
        endTime: endTime,
        attendeePhone: attendeePhone,
        status: result.rows[0].status,
        reminderSent: false,
      };
    } catch (error) {
      console.error('[Calendar] Error creating event:', error);
      throw error;
    }
  }

  /**
   * Get available time slots
   */
  async getAvailability(
    tenantId: string,
    startDate: Date,
    endDate: Date,
    duration: number = 60 // minutes
  ): Promise<AvailabilitySlot[]> {
    try {
      const calendar = await this.getGoogleClient(tenantId);
      const columns = await getBusinessHoursColumnSet(pool);

      // Get business hours
      const businessHoursResult = await pool.query(
        `SELECT day_of_week,
                ${columns.startCol} AS start_time,
                ${columns.endCol} AS end_time,
                ${columns.openCol} AS open_flag
         FROM public.business_hours
         WHERE tenant_id = $1`,
        [tenantId]
      );

      const businessHours = businessHoursResult.rows;

      // Get existing events
      const events = await calendar.events.list({
        calendarId: 'primary',
        timeMin: startDate.toISOString(),
        timeMax: endDate.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
      });

      const slots: AvailabilitySlot[] = [];
      const current = new Date(startDate);

      while (current < endDate) {
        const dayOfWeek = current.getDay();
        const businessHour = businessHours.find((bh: any) => bh.day_of_week === dayOfWeek);

        if (businessHour && rowIsOpen({ [columns.openCol]: businessHour.open_flag }, columns)) {
          // Parse business hours
          const [startHour, startMin] = businessHour.start_time.split(':').map(Number);
          const [endHour, endMin] = businessHour.end_time.split(':').map(Number);

          const slotStart = new Date(current);
          slotStart.setHours(startHour, startMin, 0, 0);

          const slotEnd = new Date(current);
          slotEnd.setHours(endHour, endMin, 0, 0);

          // Generate slots
          let currentSlot = new Date(slotStart);
          while (currentSlot < slotEnd) {
            const slotEndTime = new Date(currentSlot.getTime() + duration * 60000);

            // Check if slot conflicts with existing events
            const hasConflict = events.data.items?.some((event) => {
              const eventStart = new Date(event.start?.dateTime || event.start?.date || '');
              const eventEnd = new Date(event.end?.dateTime || event.end?.date || '');
              return currentSlot < eventEnd && slotEndTime > eventStart;
            });

            slots.push({
              start: new Date(currentSlot),
              end: new Date(slotEndTime),
              available: !hasConflict,
            });

            currentSlot = slotEndTime;
          }
        }

        // Move to next day
        current.setDate(current.getDate() + 1);
        current.setHours(0, 0, 0, 0);
      }

      return slots;
    } catch (error) {
      console.error('[Calendar] Error getting availability:', error);
      throw error;
    }
  }

  private mapRowToCalendarEvent(
    row: Record<string, unknown>,
    type: 'appointment' | 'lead' = 'appointment'
  ): Record<string, unknown> {
    const start = row.scheduled_time ?? row.preferred_time;
    const startDate =
      start instanceof Date ? start : new Date(String(start));
    const end = new Date(startDate.getTime() + 60 * 60 * 1000);
    const title = String(row.service || row.name || 'Appointment');
    const phone = row.phone ? String(row.phone) : '';
    const id = type === 'lead' ? `lead-${row.id}` : row.id;
    return {
      id,
      tenantId: row.tenant_id,
      title,
      service: row.service,
      name: row.name,
      start: startDate.toISOString(),
      end: end.toISOString(),
      start_time: startDate.toISOString(),
      end_time: end.toISOString(),
      attendee: phone,
      attendee_phone: phone,
      attendee_email: null,
      status: row.status ?? (type === 'lead' ? 'pending' : 'booked'),
      type,
    };
  }

  /**
   * Appointments for dashboard calendar (month grid + upcoming list).
   * Includes booked rows plus leads that have a parseable preferred_time in range.
   */
  async getAppointmentsForCalendar(
    tenantId: string,
    options: { from?: Date; to?: Date; limit?: number } = {}
  ): Promise<Record<string, unknown>[]> {
    const limit = Math.min(Math.max(options.limit ?? 200, 1), 500);
    const from =
      options.from ?? new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
    const to =
      options.to ??
      new Date(new Date().getFullYear(), new Date().getMonth() + 4, 0, 23, 59, 59, 999);

    try {
      const result = await tenantDb.query(
        `SELECT id, tenant_id, name, phone, service, scheduled_time, status, calendar_event_id, created_at
         FROM public.appointments
         WHERE tenant_id = $1
           AND scheduled_time >= $2::timestamptz
           AND scheduled_time <= $3::timestamptz
           AND status NOT IN ('cancelled', 'canceled')
         ORDER BY scheduled_time ASC
         LIMIT $4`,
        [tenantId, from.toISOString(), to.toISOString(), limit]
      );

      const events = result.rows.map((row: Record<string, unknown>) =>
        this.mapRowToCalendarEvent(row, 'appointment')
      );

      const bookedPhones = new Set(
        events.map((e) => String(e.attendee_phone || '').replace(/\D/g, '')).filter(Boolean)
      );

      try {
        const leads = await tenantDb.query(
          `SELECT id, tenant_id, name, phone, service, preferred_time, status
           FROM public.leads
           WHERE tenant_id = $1
             AND preferred_time IS NOT NULL
             AND btrim(preferred_time) <> ''
           ORDER BY created_at DESC
           LIMIT $2`,
          [tenantId, limit]
        );

        for (const row of leads.rows as Record<string, unknown>[]) {
          const parsed = new Date(String(row.preferred_time));
          if (Number.isNaN(parsed.getTime())) continue;
          if (parsed < from || parsed > to) continue;
          const phoneKey = String(row.phone || '').replace(/\D/g, '');
          if (phoneKey && bookedPhones.has(phoneKey)) continue;
          events.push(
            this.mapRowToCalendarEvent(
              { ...row, scheduled_time: parsed.toISOString() },
              'lead'
            )
          );
        }
      } catch (leadErr) {
        console.warn('[Calendar] Leads fallback skipped:', leadErr);
      }

      try {
        const external = await tenantDb.query(
          `SELECT ce.external_event_id, ce.title, ce.start_time, ce.end_time, cc.provider
           FROM public.calendar_events ce
           INNER JOIN public.calendar_connections cc ON cc.id = ce.calendar_connection_id
           WHERE cc.tenant_id = $1
             AND ce.start_time >= $2::timestamptz
             AND ce.start_time <= $3::timestamptz
           ORDER BY ce.start_time ASC
           LIMIT $4`,
          [tenantId, from.toISOString(), to.toISOString(), limit]
        );

        const seenExternal = new Set(
          events
            .map((e) => String(e.calendar_event_id || '').trim())
            .filter(Boolean)
        );

        for (const row of external.rows as Record<string, unknown>[]) {
          const extId = String(row.external_event_id || '');
          if (extId && seenExternal.has(extId)) continue;
          const startDate = new Date(String(row.start_time));
          const endDate = new Date(String(row.end_time));
          const provider = String(row.provider || 'google');
          events.push({
            id: `ext-${provider}-${extId}`,
            tenantId,
            title: String(row.title || 'Calendar event'),
            service: provider === 'outlook' ? 'Outlook' : 'Google Calendar',
            name: String(row.title || 'External'),
            start: startDate.toISOString(),
            end: endDate.toISOString(),
            start_time: startDate.toISOString(),
            end_time: endDate.toISOString(),
            attendee: '',
            attendee_phone: '',
            attendee_email: null,
            status: 'external',
            type: 'external',
            source: provider,
            calendar_event_id: extId,
          });
        }
      } catch (extErr) {
        console.warn('[Calendar] External events merge skipped:', extErr);
      }

      events.sort(
        (a, b) =>
          new Date(String(a.start)).getTime() - new Date(String(b.start)).getTime()
      );

      return events.slice(0, limit);
    } catch (error) {
      console.error('[Calendar] Error loading appointments for calendar:', error);
      throw error;
    }
  }

  /** @deprecated use getAppointmentsForCalendar */
  async getUpcomingEvents(
    tenantId: string,
    limit: number = 10
  ): Promise<CalendarEvent[]> {
    const rows = await this.getAppointmentsForCalendar(tenantId, {
      from: new Date(Date.now() - 24 * 60 * 60 * 1000),
      limit,
    });
    return rows as unknown as CalendarEvent[];
  }

  /**
   * Update event time
   */
  async updateEvent(
    tenantId: string,
    eventId: string,
    startTime: Date,
    endTime: Date
  ): Promise<CalendarEvent> {
    try {
      const eventResult = await pool.query(
        `SELECT calendar_event_id AS external_id, scheduled_time
         FROM public.appointments
         WHERE id = $1 AND tenant_id = $2`,
        [eventId, tenantId]
      );
      if (eventResult.rows.length === 0) {
        throw new Error('Event not found');
      }
      const externalId = eventResult.rows[0].external_id as string | null;

      if (externalId) {
      const calendar = await this.getGoogleClient(tenantId);
      const timeZone = await getTenantTimezone(tenantId);
      await calendar.events.patch({
        calendarId: 'primary',
        eventId: externalId,
        requestBody: {
          start: {
            dateTime: startTime.toISOString(),
            timeZone,
          },
          end: {
            dateTime: endTime.toISOString(),
            timeZone,
          },
        },
      });
      }

      const result = await pool.query(
        `UPDATE public.appointments
         SET scheduled_time = $1
         WHERE id = $2 AND tenant_id = $3
         RETURNING id, tenant_id, name, service, scheduled_time, status, calendar_event_id`,
        [startTime, eventId, tenantId]
      );

      console.log(`[Calendar] Event updated: ${eventId}`);
      return {
        id: result.rows[0].id,
        tenantId: result.rows[0].tenant_id,
        externalId: result.rows[0].calendar_event_id ?? '',
        title: result.rows[0].service,
        startTime: result.rows[0].scheduled_time,
        endTime: endTime,
        status: result.rows[0].status,
        reminderSent: false,
      };
    } catch (error) {
      console.error('[Calendar] Error updating event:', error);
      throw error;
    }
  }

  /**
   * Cancel event
   */
  async cancelEvent(tenantId: string, eventId: string): Promise<void> {
    try {
      // Get event
      const eventResult = await pool.query(
        `SELECT calendar_event_id AS external_id
         FROM public.appointments
         WHERE id = $1 AND tenant_id = $2`,
        [eventId, tenantId]
      );

      if (eventResult.rows.length === 0) {
        throw new Error('Event not found');
      }

      const externalId = eventResult.rows[0].external_id as string | null;

      if (externalId) {
        const calendar = await this.getGoogleClient(tenantId);
        await calendar.events.delete({
          calendarId: 'primary',
          eventId: externalId,
        });
      }

      await pool.query(
        `UPDATE public.appointments SET status = 'cancelled' WHERE id = $1 AND tenant_id = $2`,
        [eventId, tenantId]
      );

      console.log(`[Calendar] Event cancelled: ${eventId}`);
    } catch (error) {
      console.error('[Calendar] Error cancelling event:', error);
      throw error;
    }
  }

  /**
   * Disconnect calendar
   */
  async disconnect(tenantId: string): Promise<void> {
    try {
      await voiceDb.query(
        `UPDATE public.calendar_connections
         SET status = 'disconnected', updated_at = NOW()
         WHERE tenant_id = $1 AND provider = 'google'`,
        [tenantId]
      );
      await voiceDb.query(
        `UPDATE public.voice_tenants
         SET google_access_token = NULL, google_refresh_token = NULL, updated_at = NOW()
         WHERE id = $1`,
        [tenantId]
      );

      console.log(`[Calendar] Disconnected for tenant ${tenantId}`);
    } catch (error) {
      console.error('[Calendar] Error disconnecting:', error);
      throw error;
    }
  }
}

export const calendarService = new CalendarService();

