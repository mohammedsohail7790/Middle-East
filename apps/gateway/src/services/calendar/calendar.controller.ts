/**
 * Calendar Controller — Multi-Provider
 * Supports: Google Calendar, Outlook/365, Calendly, Acuity Scheduling.
 *
 * Plan gating:
 *   Essential ($39): Google Calendar only (basic)
 *   Professional ($149) + Enterprise ($499): All providers (native/custom)
 */

import { calendarService } from './calendar.service.js';
import { outlookCalendarService } from './outlook.calendar.service.js';
import { calendlyService } from './calendly.service.js';
import { acuityService } from './acuity.service.js';
import { squareAppointmentsService } from './square-appointments.service.js';
import { asyncHandler } from '../../middleware/error-handler.js';
import { voiceAuthUnlessPublic } from '../../middleware/voice-auth-unless-public.js';
import { logger } from '../logger.js';
import { billingService } from '../billing/billing.service.js';
import { publishIntegrationsUpdated } from '../integrations/integrations-notify.js';
import { scheduleIntegrationSyncForProvider } from '../integrations/integration-sync.service.js';
import { getDashboardBaseUrl, integrationsPageUrl, oauthProviderErrorDetail, readOAuthCallbackParams } from '../integrations/oauth-redirect.js';
import { getAcuityRedirectUri } from '../env.js';
import { getTenantId } from '../auth/tenant-context.js';
import { Router } from 'express';

async function requireBasicCalendar(tenantId: string, res: Response): Promise<boolean> {
  const sub = await billingService.getActiveSubscription(tenantId);
  if (sub && (sub.status === 'trialing' || sub.plan !== 'essential')) {
    return true;
  }
  const allowed = await billingService.canUseFeature(tenantId, 'calendar');
  if (!allowed) {
    res.status(403).json({ error: 'Calendar integration requires a paid plan' });
    return false;
  }
  return true;
}

async function requireAdvancedCalendar(tenantId: string, res: Response): Promise<boolean> {
  const sub = await billingService.getActiveSubscription(tenantId);
  if (!sub) {
    res.status(403).json({ error: 'Active subscription required for advanced calendar providers' });
    return false;
  }
  const planConfig = billingService.getPlanByKey(sub.plan);
  if (!planConfig || planConfig.features.calendar === 'basic') {
    res.status(403).json({
      error: 'Outlook, Calendly, and Acuity require a Professional plan or higher',
      currentPlan: sub.plan,
    });
    return false;
  }
  return true;
}

async function requireCalendarForProvider(tenantId: string, provider: string, res: Response): Promise<boolean> {
  if (provider === 'google') {
    return requireBasicCalendar(tenantId, res);
  }
  return requireAdvancedCalendar(tenantId, res);
}

export function createCalendarRouter(): Router {
  const router = Router();
  router.use(voiceAuthUnlessPublic);

  // ─── Google Calendar (all plans) ────────────────────────────────────────

  router.get(
    '/google/auth-url',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantId(req);
      if (!await requireBasicCalendar(tenantId, res)) return;

      res.json({ success: true, data: { authUrl: calendarService.getGoogleAuthUrl(tenantId) } });
    })
  );

  router.get('/google/callback', (req: any, res: any) => {
    void (async () => {
      const { code, state } = req.query;
      const tenantId = state as string;
      const dashboard = getDashboardBaseUrl();

      if (!code || !tenantId) {
        res.redirect(
          `${dashboard}/dashboard/integrations?provider=google-calendar&status=error&message=missing_oauth_code`
        );
        return;
      }

      try {
        await calendarService.handleGoogleCallback(tenantId, code as string);
        logger.info('[Calendar] Google OAuth connected', { tenantId });
        publishIntegrationsUpdated(tenantId, 'google-calendar');
        scheduleIntegrationSyncForProvider(tenantId, 'google-calendar');
        res.redirect(
          `${dashboard}/dashboard/integrations?provider=google-calendar&status=connected`
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Google Calendar connection failed';
        logger.error('[Calendar] Google OAuth callback error', { tenantId, error: String(error) });
        res.redirect(
          `${dashboard}/dashboard/integrations?provider=google-calendar&status=error&message=${encodeURIComponent(message)}`
        );
      }
    })().catch((err) => {
      logger.error('[Calendar] Google OAuth callback fatal', { error: String(err) });
      const dashboard = getDashboardBaseUrl();
      res.redirect(
        `${dashboard}/dashboard/integrations?provider=google-calendar&status=error&message=connection_failed`
      );
    });
  });

  // ─── Outlook Calendar (Professional+) ───────────────────────────────────

  router.get(
    '/outlook/auth-url',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantId(req);
      if (!await requireAdvancedCalendar(tenantId, res)) return;
      if (!outlookCalendarService.isConfigured()) {
        return res.status(501).json({ success: false, error: 'Outlook OAuth is not configured on the server' });
      }

      res.json({
        success: true,
        data: {
          authUrl: await outlookCalendarService.getAuthUrl(tenantId),
          redirectUri: outlookCalendarService.getRedirectUri(),
          tenantAuthority: outlookCalendarService.getTenantAuthority(),
        },
      });
    })
  );

  router.get(
    '/outlook/callback',
    asyncHandler(async (req: any, res: any) => {
      const { oauthError, oauthErrorDescription, code, state } = readOAuthCallbackParams(
        req.query as Record<string, unknown>
      );
      if (oauthError) {
        return res.redirect(
          integrationsPageUrl(
            'outlook',
            'error',
            getDashboardBaseUrl(),
            oauthProviderErrorDetail(oauthError, oauthErrorDescription)
          )
        );
      }
      const tenantId = state;
      if (!code || !tenantId) {
        return res.redirect(
          integrationsPageUrl(
            'outlook',
            'error',
            getDashboardBaseUrl(),
            'Missing authorization code — try connecting again'
          )
        );
      }

      try {
        await outlookCalendarService.handleCallback(tenantId, code);
        logger.info('[Calendar] Outlook OAuth connected', { tenantId });
        publishIntegrationsUpdated(tenantId, 'outlook');
        scheduleIntegrationSyncForProvider(tenantId, 'outlook');
        res.redirect(integrationsPageUrl('outlook', 'connected', getDashboardBaseUrl()));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Outlook connection failed';
        logger.error('[Calendar] Outlook OAuth callback error', { tenantId, error: String(error) });
        res.redirect(
          integrationsPageUrl('outlook', 'error', getDashboardBaseUrl(), message)
        );
      }
    })
  );

  // ─── Calendly (Professional+) ───────────────────────────────────────────

  router.get(
    '/calendly/auth-url',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantId(req);
      if (!calendlyService.isConfigured()) {
        return res.status(501).json({ error: 'Calendly OAuth is not configured on the server' });
      }
      if (!await requireAdvancedCalendar(tenantId, res)) return;

      res.json({ success: true, data: { authUrl: calendlyService.getAuthUrl(tenantId) } });
    })
  );

  router.get(
    '/calendly/callback',
    asyncHandler(async (req: any, res: any) => {
      const { code, state, oauthError, oauthErrorDescription } = readOAuthCallbackParams(
        req.query as Record<string, unknown>
      );
      if (oauthError) {
        return res.redirect(
          integrationsPageUrl(
            'calendly',
            'error',
            getDashboardBaseUrl(),
            oauthProviderErrorDetail(oauthError, oauthErrorDescription)
          )
        );
      }
      let parsedState: { tenantId?: string } = {};
      if (state) {
        try {
          parsedState = JSON.parse(Buffer.from(state as string, 'base64url').toString('utf8'));
        } catch {
          try {
            parsedState = JSON.parse(Buffer.from(state as string, 'base64').toString('utf8'));
          } catch {
            parsedState = {};
          }
        }
      }
      const resolvedTenantId = parsedState.tenantId || (state as string);

      if (!code || !resolvedTenantId) {
        return res.redirect(
          integrationsPageUrl(
            'calendly',
            'error',
            getDashboardBaseUrl(),
            'Missing authorization code — try connecting again'
          )
        );
      }

      try {
        await calendlyService.handleCallback(resolvedTenantId, code as string);
        logger.info('[Calendar] Calendly OAuth connected', { tenantId: resolvedTenantId });
        publishIntegrationsUpdated(resolvedTenantId, 'calendly');
        scheduleIntegrationSyncForProvider(resolvedTenantId, 'calendly');
        res.redirect(integrationsPageUrl('calendly', 'connected', getDashboardBaseUrl()));
      } catch (err) {
        logger.error('[Calendar] Calendly OAuth callback failed', { error: String(err) });
        res.redirect(
          integrationsPageUrl(
            'calendly',
            'error',
            getDashboardBaseUrl(),
            err instanceof Error ? err.message : String(err)
          )
        );
      }
    })
  );

  router.get(
    '/calendly/event-types',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = req.headers['x-tenant-id'] as string;
      if (!tenantId) return res.status(400).json({ error: 'Missing x-tenant-id header' });
      if (!await requireAdvancedCalendar(tenantId, res)) return;

      const types = await calendlyService.getEventTypes(tenantId);
      res.json({ success: true, data: types });
    })
  );

  router.get(
    '/calendly/events',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = req.headers['x-tenant-id'] as string;
      if (!tenantId) return res.status(400).json({ error: 'Missing x-tenant-id header' });
      if (!await requireAdvancedCalendar(tenantId, res)) return;

      const events = await calendlyService.getScheduledEvents(tenantId);
      res.json({ success: true, data: events });
    })
  );

  // ─── Acuity Scheduling (Professional+) ──────────────────────────────────

  router.get(
    '/acuity/auth-url',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantId(req);
      if (!acuityService.isConfigured()) {
        return res.status(501).json({ error: 'Acuity OAuth is not configured on the server' });
      }
      if (!await requireAdvancedCalendar(tenantId, res)) return;

      res.json({
        success: true,
        data: {
          authUrl: acuityService.getAuthUrl(tenantId),
          redirectUri: getAcuityRedirectUri(),
        },
      });
    })
  );

  router.get(
    '/acuity/callback',
    asyncHandler(async (req: any, res: any) => {
      const { code, state, oauthError, oauthErrorDescription } = readOAuthCallbackParams(
        req.query as Record<string, unknown>
      );
      if (oauthError) {
        return res.redirect(
          integrationsPageUrl(
            'acuity',
            'error',
            getDashboardBaseUrl(),
            oauthProviderErrorDetail(oauthError, oauthErrorDescription)
          )
        );
      }
      let parsedState: { tenantId?: string } = {};
      if (state) {
        try {
          parsedState = JSON.parse(Buffer.from(state as string, 'base64url').toString('utf8'));
        } catch {
          try {
            parsedState = JSON.parse(Buffer.from(state as string, 'base64').toString('utf8'));
          } catch {
            parsedState = {};
          }
        }
      }
      const resolvedTenantId = parsedState.tenantId || (state as string);

      if (!code || !resolvedTenantId) {
        return res.redirect(
          integrationsPageUrl(
            'acuity',
            'error',
            getDashboardBaseUrl(),
            'Missing authorization code — try connecting again'
          )
        );
      }

      try {
        const conn = await acuityService.handleCallback(resolvedTenantId, code as string);
        logger.info('[Calendar] Acuity OAuth connected', { tenantId: resolvedTenantId, email: conn.email });
        publishIntegrationsUpdated(resolvedTenantId, 'acuity');
        scheduleIntegrationSyncForProvider(resolvedTenantId, 'acuity');
        res.redirect(integrationsPageUrl('acuity', 'connected', getDashboardBaseUrl()));
      } catch (err) {
        logger.error('[Calendar] Acuity OAuth callback failed', { error: String(err) });
        res.redirect(
          integrationsPageUrl(
            'acuity',
            'error',
            getDashboardBaseUrl(),
            err instanceof Error ? err.message : String(err)
          )
        );
      }
    })
  );

  router.post(
    '/acuity/connect',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = req.headers['x-tenant-id'] as string;
      if (!tenantId) return res.status(400).json({ error: 'Missing x-tenant-id header' });
      if (!await requireAdvancedCalendar(tenantId, res)) return;

      const { userId, apiKey } = req.body;
      if (!userId || !apiKey) return res.status(400).json({ error: 'userId and apiKey required' });

      const test = await acuityService.testConnection(userId, apiKey);
      if (!test.success) return res.status(400).json({ error: 'Acuity connection test failed. Check credentials.' });

      const conn = await acuityService.saveConnection(tenantId, userId, apiKey, test.email, test.calendarName);
      logger.info('[Calendar] Acuity connected', { tenantId });
      res.json({ success: true, data: { email: conn.email, calendarName: conn.calendarName } });
    })
  );

  // ─── Square Appointments (Professional+) ────────────────────────────────

  router.get(
    '/square-appointments/auth-url',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = getTenantId(req);
      if (!squareAppointmentsService.isConfigured()) {
        return res.status(501).json({ error: 'Square OAuth is not configured on the server' });
      }
      if (!await requireAdvancedCalendar(tenantId, res)) return;

      res.json({ success: true, data: { authUrl: squareAppointmentsService.getAuthUrl(tenantId) } });
    })
  );

  router.get(
    '/square-appointments/callback',
    asyncHandler(async (req: any, res: any) => {
      const { code, state, oauthError, oauthErrorDescription } = readOAuthCallbackParams(
        req.query as Record<string, unknown>
      );
      if (oauthError) {
        return res.redirect(
          integrationsPageUrl(
            'square-appointments',
            'error',
            getDashboardBaseUrl(),
            oauthProviderErrorDetail(oauthError, oauthErrorDescription)
          )
        );
      }
      let parsedState: { tenantId?: string } = {};
      if (state) {
        try {
          parsedState = JSON.parse(Buffer.from(state as string, 'base64url').toString('utf8'));
        } catch {
          try {
            parsedState = JSON.parse(Buffer.from(state as string, 'base64').toString('utf8'));
          } catch {
            parsedState = {};
          }
        }
      }
      const resolvedTenantId = parsedState.tenantId || (state as string);

      if (!code || !resolvedTenantId) {
        return res.redirect(
          integrationsPageUrl(
            'square-appointments',
            'error',
            getDashboardBaseUrl(),
            'Missing authorization code — try connecting again'
          )
        );
      }

      try {
        const conn = await squareAppointmentsService.handleCallback(resolvedTenantId, code as string);
        logger.info('[Calendar] Square OAuth connected', { tenantId: resolvedTenantId, email: conn.email });
        publishIntegrationsUpdated(resolvedTenantId, 'square-appointments');
        scheduleIntegrationSyncForProvider(resolvedTenantId, 'square-appointments');
        res.redirect(integrationsPageUrl('square-appointments', 'connected', getDashboardBaseUrl()));
      } catch (err) {
        logger.error('[Calendar] Square OAuth callback failed', { error: String(err) });
        res.redirect(
          integrationsPageUrl(
            'square-appointments',
            'error',
            getDashboardBaseUrl(),
            err instanceof Error ? err.message : String(err)
          )
        );
      }
    })
  );

  router.get(
    '/acuity/appointment-types',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = req.headers['x-tenant-id'] as string;
      if (!tenantId) return res.status(400).json({ error: 'Missing x-tenant-id header' });
      if (!await requireAdvancedCalendar(tenantId, res)) return;

      const types = await acuityService.getAppointmentTypes(tenantId);
      res.json({ success: true, data: types });
    })
  );

  router.get(
    '/acuity/appointments',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = req.headers['x-tenant-id'] as string;
      if (!tenantId) return res.status(400).json({ error: 'Missing x-tenant-id header' });
      if (!await requireAdvancedCalendar(tenantId, res)) return;

      const { startDate, endDate } = req.query;
      const appointments = await acuityService.getAppointments(
        tenantId,
        startDate as string,
        endDate as string
      );
      res.json({ success: true, data: appointments });
    })
  );

  router.get(
    '/acuity/availability',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = req.headers['x-tenant-id'] as string;
      if (!tenantId) return res.status(400).json({ error: 'Missing x-tenant-id header' });
      if (!await requireAdvancedCalendar(tenantId, res)) return;

      const { appointmentTypeId, month, year } = req.query;
      if (!appointmentTypeId || !month || !year) {
        return res.status(400).json({ error: 'appointmentTypeId, month, and year required' });
      }

      const availability = await acuityService.getAvailability(
        tenantId,
        appointmentTypeId as string,
        month as string,
        year as string
      );
      res.json({ success: true, data: availability });
    })
  );

  router.post(
    '/acuity/appointments',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = req.headers['x-tenant-id'] as string;
      if (!tenantId) return res.status(400).json({ error: 'Missing x-tenant-id header' });
      if (!await requireAdvancedCalendar(tenantId, res)) return;

      const { appointmentTypeId, datetime, clientName, clientEmail, clientPhone } = req.body;
      if (!appointmentTypeId || !datetime || !clientName || !clientEmail) {
        return res.status(400).json({ error: 'appointmentTypeId, datetime, clientName, clientEmail required' });
      }

      const appointment = await acuityService.createAppointment(
        tenantId,
        appointmentTypeId,
        datetime,
        clientName,
        clientEmail,
        clientPhone || ''
      );
      res.json({ success: true, data: appointment });
    })
  );

  // ─── Shared Endpoints ─────────────────────────────────────────────────

  router.get(
    '/connection',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = req.headers['x-tenant-id'] as string;
      if (!tenantId) return res.status(400).json({ error: 'Missing x-tenant-id header' });
      if (!await requireBasicCalendar(tenantId, res)) return;

      const [google, outlook, calendly, acuity] = await Promise.all([
        calendarService.getConnection(tenantId),
        outlookCalendarService.getConnection(tenantId),
        calendlyService.getConnection(tenantId),
        acuityService.getConnection(tenantId),
      ]);

      res.json({
        success: true,
        data: {
          google: google ? { provider: 'google', email: google.email, status: google.status } : null,
          outlook: outlook ? { provider: 'outlook', email: outlook.email, status: outlook.status } : null,
          calendly: calendly ? { provider: 'calendly', email: calendly.email } : null,
          acuity: acuity ? { provider: 'acuity', email: acuity.email, calendarName: acuity.calendarName } : null,
        },
      });
    })
  );

  router.get(
    '/events',
    asyncHandler(async (req: any, res: any) => {
      const tenantId =
        ((req as any).resolvedTenantId as string | undefined) ||
        (req.headers['x-tenant-id'] as string);
      if (!tenantId) {
        return res.status(400).json({ success: false, error: 'Missing tenant (sign in or x-tenant-id)' });
      }

      const limit = parseInt(String(req.query.limit ?? '200'), 10) || 200;
      const fromRaw = req.query.from as string | undefined;
      const toRaw = req.query.to as string | undefined;
      const from = fromRaw ? new Date(fromRaw) : undefined;
      const to = toRaw ? new Date(toRaw) : undefined;

      if (fromRaw && Number.isNaN(from!.getTime())) {
        return res.status(400).json({ success: false, error: 'Invalid from date' });
      }
      if (toRaw && Number.isNaN(to!.getTime())) {
        return res.status(400).json({ success: false, error: 'Invalid to date' });
      }

      const events = await calendarService.getAppointmentsForCalendar(tenantId, {
        from,
        to,
        limit,
      });
      res.json({ success: true, data: events, count: events.length });
    })
  );

  router.post(
    '/events',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = req.headers['x-tenant-id'] as string;
      const { provider = 'google', title, startTime, endTime, attendeeEmail, attendeePhone, description } = req.body;

      if (!tenantId) return res.status(400).json({ error: 'Missing x-tenant-id header' });
      if (!await requireCalendarForProvider(tenantId, provider, res)) return;
      if (!title || !startTime || !endTime) return res.status(400).json({ error: 'title, startTime, endTime required' });

      let event: any;
      switch (provider) {
        case 'outlook':
          event = await outlookCalendarService.createEvent(
            tenantId, title, new Date(startTime), new Date(endTime),
            attendeeEmail, attendeePhone, description
          );
          break;
        case 'calendly':
          event = await calendlyService.createInviteLink(tenantId, title, startTime);
          break;
        case 'acuity':
          event = await acuityService.createAppointment(
            tenantId, title, startTime,
            req.body.clientName || title,
            attendeeEmail, attendeePhone || ''
          );
          break;
        default:
          event = await calendarService.createEvent(
            tenantId, title, new Date(startTime), new Date(endTime),
            attendeeEmail, attendeePhone, description
          );
      }

      logger.info('[Calendar] Event created', { tenantId, provider });
      res.json({ success: true, data: event });
    })
  );

  router.get(
    '/availability',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = req.headers['x-tenant-id'] as string;
      const { provider = 'google', startDate, endDate, duration } = req.query;

      if (!tenantId) return res.status(400).json({ error: 'Missing x-tenant-id header' });
      if (!await requireCalendarForProvider(tenantId, provider as string, res)) return;
      if (!startDate || !endDate) return res.status(400).json({ error: 'startDate, endDate required' });

      let slots: any[];
      switch (provider) {
        case 'outlook':
          slots = await outlookCalendarService.getAvailability(
            tenantId,
            new Date(startDate as string),
            new Date(endDate as string),
            duration ? parseInt(duration as string) : 60
          );
          break;
        case 'acuity':
          slots = await acuityService.getAvailability(
            tenantId,
            req.query.appointmentTypeId as string || '',
            new Date(startDate as string).getMonth().toString(),
            new Date(startDate as string).getFullYear().toString()
          );
          break;
        default:
          slots = await calendarService.getAvailability(
            tenantId,
            new Date(startDate as string),
            new Date(endDate as string),
            duration ? parseInt(duration as string) : 60
          );
      }

      res.json({ success: true, data: slots, count: slots.length });
    })
  );

  router.delete(
    '/events/:eventId',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = req.headers['x-tenant-id'] as string;
      const { eventId } = req.params;
      const { provider = 'google' } = req.body;

      if (!tenantId) return res.status(400).json({ error: 'Missing x-tenant-id header' });
      if (!await requireCalendarForProvider(tenantId, provider, res)) return;

      switch (provider) {
        case 'outlook':
          await outlookCalendarService.cancelEvent(tenantId, eventId);
          break;
        case 'calendly':
          await calendlyService.cancelEvent(tenantId, eventId);
          break;
        case 'acuity':
          await acuityService.cancelAppointment(tenantId, eventId);
          break;
        default:
          await calendarService.cancelEvent(tenantId, eventId);
      }

      logger.info('[Calendar] Event cancelled', { tenantId, eventId });
      res.json({ success: true, message: 'Event cancelled' });
    })
  );

  router.delete(
    '/connection',
    asyncHandler(async (req: any, res: any) => {
      const tenantId = req.headers['x-tenant-id'] as string;
      const { provider = 'google' } = req.query;

      if (!tenantId) return res.status(400).json({ error: 'Missing x-tenant-id header' });
      if (!await requireCalendarForProvider(tenantId, provider as string, res)) return;

      switch (provider) {
        case 'outlook':
          await outlookCalendarService.disconnect(tenantId);
          break;
        case 'calendly':
          await calendlyService.disconnect(tenantId);
          break;
        case 'acuity':
          await acuityService.disconnect(tenantId);
          break;
        case 'square-appointments':
          await squareAppointmentsService.disconnect(tenantId);
          break;
        default:
          await calendarService.disconnect(tenantId);
      }

      logger.info('[Calendar] Disconnected', { tenantId, provider });
      res.json({ success: true, message: `Calendar (${provider}) disconnected` });
    })
  );

  return router;
}

