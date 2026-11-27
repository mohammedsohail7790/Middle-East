import { requireVoiceApiAccess } from '../voice/security.js';
import { voiceRateLimit } from '../voice/security.js';
import { voiceDb } from '../voice/tenant-scope.js';
import { appointmentService } from './appointment.service.js';
import { logger } from '../logger.js';
import express from 'express';
import { clientErrorMessage } from '../../security/safe-error.js';
import { isTenantOwner } from '../enterprise/rbac.service.js';
import { calendarService } from '../calendar/calendar.service.js';
import { getTenantTimezone } from './tenant-timezone.js';
import { createTestAppointment } from './test-appointment.js';

function getTenant(req: Request): string {
    const tenantId = (req as any).resolvedTenantId || req.header('x-tenant-id');
    if (!tenantId) throw new Error('x-tenant-id header required');
    return tenantId;
}

export function createAppointmentsRouter(): express.Router {
    const router = express.Router();
    router.use(requireVoiceApiAccess);
    router.use(voiceRateLimit);

    /** Only the workspace owner, signed in with their own login (not an API key or a service call). */
    async function ownerMayUseTestTool(req: any, tenantId: string): Promise<boolean> {
        const tenant = req.tenant as { source?: string; userId?: string } | undefined;
        if (!tenant || (tenant.source !== 'user_jwt' && tenant.source !== 'legacy_jwt') || !tenant.userId) return false;
        return isTenantOwner(tenantId, tenant.userId);
    }

    // GET /api/appointments/test-access — does this person get the "Add test appointment" button? (registered before /:id)
    router.get('/test-access', async (req: any, res: any) => {
        try {
            const tenantId = getTenant(req);
            const allowed = await ownerMayUseTestTool(req, tenantId);
            res.json({
                success: true,
                data: { allowed, googleConnected: allowed ? await calendarService.hasActiveConnection(tenantId) : false },
            });
        } catch (error) {
            logger.error('Failed to check test appointment access', { error: String(error) });
            res.json({ success: true, data: { allowed: false, googleConnected: false } });
        }
    });

    // POST /api/appointments/test — owner only: book one clearly labelled test appointment (goes to the connected Google Calendar)
    router.post('/test', async (req: any, res: any) => {
        try {
            const tenantId = getTenant(req);
            if (!(await ownerMayUseTestTool(req, tenantId))) {
                return res.status(403).json({ success: false, error: 'Only the workspace owner can add a test appointment.' });
            }
            const out = await createTestAppointment(tenantId, {
                timeZone: await getTenantTimezone(tenantId),
                create: (input) => appointmentService.createAppointment(input),
                hasGoogle: () => calendarService.hasActiveConnection(tenantId),
            });
            if (out.success === false) {
                return res.status(409).json({ success: false, error: out.message });
            }
            res.json({ success: true, data: { id: out.id, scheduled_time: out.scheduledTime, googleConnected: out.googleConnected } });
        } catch (error) {
            logger.error('Failed to create test appointment', { error: String(error) });
            res.status(400).json({ success: false, error: clientErrorMessage(error, 'Request failed') });
        }
    });

    // GET /api/appointments — list appointments for the current tenant
    router.get('/', async (req: any, res: any) => {
        try {
            const tenantId = getTenant(req);
            const limit = Math.min(parseInt(String(req.query.limit), 10) || 200, 500);
            const result = await voiceDb.query(
                `select id, tenant_id, name, phone, service, scheduled_time, status,
                        calendar_event_id, external_calendar_event_id, calendar_provider, created_at
                 from public.appointments
                 where tenant_id = $1
                   and status not in ('cancelled', 'canceled')
                 order by scheduled_time asc
                 limit $2`,
                [tenantId, limit],
            );
            res.json({ success: true, data: result.rows });
        } catch (error) {
            logger.error('Failed to list appointments', { error: String(error) });
            res.status(400).json({ success: false, error: clientErrorMessage(error, 'Request failed') });
        }
    });

    // POST /api/appointments — book into DB (shows on dashboard calendar)
    router.post('/', async (req: any, res: any) => {
        try {
            const tenantId = getTenant(req);
            const { name, phone, service, scheduled_time, time } = req.body ?? {};
            const slot = scheduled_time || time;
            if (!slot) {
                return res.status(400).json({ success: false, error: 'scheduled_time required' });
            }
            const result = await appointmentService.createAppointment({
                tenantId,
                name: String(name || 'Guest'),
                phone: String(phone || ''),
                service: String(service || 'Appointment'),
                time: String(slot),
            });
            if (!result.success) {
                return res.status(400).json({ success: false, error: result.message });
            }
            res.json({
                success: true,
                data: {
                    id: result.appointmentId,
                    scheduled_time: result.scheduledTime,
                    message: result.message,
                },
            });
        } catch (error) {
            logger.error('Failed to create appointment', { error: String(error) });
            res.status(400).json({ success: false, error: clientErrorMessage(error, 'Request failed') });
        }
    });

    // GET /api/appointments/:id — single appointment
    router.get('/:id', async (req: any, res: any) => {
        try {
            const tenantId = getTenant(req);
            const result = await voiceDb.query(
                `select id, tenant_id, name, phone, service, scheduled_time, status,
                        calendar_event_id, external_calendar_event_id, calendar_provider, created_at
                 from public.appointments
                 where id = $1 and tenant_id = $2`,
                [req.params.id, tenantId],
            );
            if (!result.rows.length) {
                return res.status(404).json({ success: false, error: 'Appointment not found' });
            }
            res.json({ success: true, data: result.rows[0] });
        } catch (error) {
            logger.error('Failed to get appointment', { error: String(error) });
            res.status(400).json({ success: false, error: clientErrorMessage(error, 'Request failed') });
        }
    });

    // PATCH /api/appointments/:id/reschedule — move to a new time (calendar + leads sync)
    router.patch('/:id/reschedule', async (req: any, res: any) => {
        try {
            const tenantId = getTenant(req);
            const slot = req.body?.scheduled_time || req.body?.time || req.body?.new_time;
            if (!slot) {
                return res.status(400).json({ success: false, error: 'scheduled_time required' });
            }
            const result = await appointmentService.rescheduleAppointment(tenantId, String(slot), {
                appointmentId: req.params.id,
            });
            if (!result.success) {
                return res.status(400).json({ success: false, error: result.message });
            }
            res.json({
                success: true,
                data: {
                    id: result.appointmentId,
                    scheduled_time: result.scheduledTime,
                    message: result.message,
                },
            });
        } catch (error) {
            logger.error('Failed to reschedule appointment', { error: String(error) });
            res.status(400).json({ success: false, error: clientErrorMessage(error, 'Request failed') });
        }
    });

    // PATCH /api/appointments/:id/cancel — cancel an appointment
    router.patch('/:id/cancel', async (req: any, res: any) => {
        try {
            const tenantId = getTenant(req);
            const result = await appointmentService.cancelAppointment(
                tenantId,
                req.params.id,
                req.body?.reason ? String(req.body.reason) : undefined
            );
            if (!result.success) {
                return res.status(400).json({ success: false, error: result.message });
            }
            res.json({ success: true, data: { id: result.appointmentId, status: 'cancelled' } });
        } catch (error) {
            logger.error('Failed to cancel appointment', { error: String(error) });
            res.status(400).json({ success: false, error: clientErrorMessage(error, 'Request failed') });
        }
    });

    return router;
}

