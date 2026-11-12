/** The real database and provider connections behind the scheduler's job handlers. */
import { voiceDb } from '../voice/tenant-scope.js';
import type { DialCall, DialCampaign, DialPorts } from './dial-jobs.js';
import type { ReminderPorts, ReminderWindow } from './reminder-jobs.js';

const parseContext = (raw: unknown) => raw;

export const realReminderPorts: ReminderPorts = {
  async findCandidates(w: ReminderWindow, from, to) {
    const flag = w.channel === 'whatsapp' ? 'wa_reminder_24h_sent' : w.hours === 24 ? 'reminder_24h_sent' : 'reminder_1h_sent';
    const join = w.channel === 'whatsapp' ? `JOIN public.whatsapp_numbers w ON w.tenant_id = a.tenant_id AND w.status = 'connected'` : '';
    const r = await voiceDb.query(
      `SELECT a.id, a.tenant_id, a.scheduled_time FROM public.appointments a ${join}
       WHERE a.status = 'booked' AND a.scheduled_time BETWEEN $1 AND $2 AND COALESCE(a.${flag}, FALSE) = FALSE
       ORDER BY a.scheduled_time ASC LIMIT 500`,
      [from, to]
    );
    return r.rows.map((x) => ({ id: x.id as string, tenantId: x.tenant_id as string, scheduledTime: new Date(x.scheduled_time) }));
  },
  async loadAppointment(tenantId, appointmentId) {
    const r = await voiceDb.query(`SELECT status, scheduled_time FROM public.appointments WHERE id = $1 AND tenant_id = $2`, [appointmentId, tenantId]);
    return r.rows[0] ? { status: r.rows[0].status as string, scheduledTime: new Date(r.rows[0].scheduled_time) } : null;
  },
  async sendEmail(tenantId, appointmentId, hours) {
    const { automationService } = await import('../automation/automation.service.js');
    return automationService.deliverAppointmentReminder(tenantId, appointmentId, hours);
  },
  async sendWhatsApp(tenantId, appointmentId) {
    const { sendWhatsAppReminderNow } = await import('../whatsapp/whatsapp.outbound.js');
    return sendWhatsAppReminderNow(tenantId, appointmentId);
  },
  async markSent(appointmentId, channel, hours) {
    if (channel === 'whatsapp') {
      await voiceDb.query(`UPDATE public.appointments SET wa_reminder_24h_sent = TRUE WHERE id = $1`, [appointmentId]);
    } else if (hours === 24) {
      await voiceDb.query(`UPDATE public.appointments SET reminder_24h_sent = TRUE, reminder_24h_sent_at = NOW() WHERE id = $1`, [appointmentId]);
    } else {
      await voiceDb.query(`UPDATE public.appointments SET reminder_1h_sent = TRUE, reminder_1h_sent_at = NOW() WHERE id = $1`, [appointmentId]);
    }
  },
};

export const realDialPorts: DialPorts = {
  async getCampaign(tenantId, campaignId): Promise<DialCampaign | null> {
    const r = await voiceDb.query(
      `SELECT id, status, timezone, calling_start::text AS calling_start, calling_end::text AS calling_end, calling_days, dial_from_number, dial_agent_id
         FROM public.campaigns WHERE id = $1 AND tenant_id = $2`,
      [campaignId, tenantId]
    );
    const c = r.rows[0];
    if (!c) return null;
    return {
      id: c.id, status: c.status, timezone: c.timezone, callingStart: c.calling_start, callingEnd: c.calling_end,
      callingDays: (c.calling_days as number[]) ?? [1, 2, 3, 4, 5, 6, 7], fromNumber: c.dial_from_number, agentId: c.dial_agent_id,
    };
  },
  async getTenantTimezone(tenantId) {
    const { getTenantTimezone } = await import('../appointments/tenant-timezone.js');
    return getTenantTimezone(tenantId);
  },
  async claimCall(campaignId, campaignCallId): Promise<DialCall | null> {
    const r = await voiceDb.query(
      `UPDATE public.campaign_calls SET status = 'calling'
        WHERE id = $1 AND campaign_id = $2 AND status = 'pending'
       RETURNING id, phone_number, purpose, context, lead_id, customer_id`,
      [campaignCallId, campaignId]
    );
    const x = r.rows[0];
    return x ? { id: x.id, phoneNumber: x.phone_number, purpose: x.purpose, context: parseContext(x.context), leadId: x.lead_id, customerId: x.customer_id } : null;
  },
  async releaseCall(campaignCallId) {
    // Only when the call was not actually placed (called_at is set the moment Twilio accepts it).
    await voiceDb.query(`UPDATE public.campaign_calls SET status = 'pending' WHERE id = $1 AND status = 'calling' AND called_at IS NULL`, [campaignCallId]);
  },
  async failCall(campaignId, campaignCallId, reason) {
    await voiceDb.query(
      `UPDATE public.campaign_calls SET status = 'failed', result = $2 WHERE id = $1 AND status IN ('pending', 'calling') AND called_at IS NULL`,
      [campaignCallId, reason.slice(0, 200)]
    );
    const { refreshCampaignStats } = await import('../voice/outbound.service.js');
    await refreshCampaignStats(campaignId);
  },
  async markCampaignRunning(campaignId) {
    await voiceDb.query(`UPDATE public.campaigns SET status = 'running', updated_at = NOW() WHERE id = $1 AND status = 'scheduled'`, [campaignId]);
  },
  async dial({ tenantId, campaign, call }) {
    const { initiateOutboundCall, parseCampaignCallContext } = await import('../voice/outbound.service.js');
    return initiateOutboundCall({
      tenantId,
      toNumber: call.phoneNumber,
      fromNumber: campaign.fromNumber as string,
      agentId: campaign.agentId,
      reason: call.purpose || 'campaign',
      openingContext: parseCampaignCallContext(call.context),
      campaignCallId: call.id,
      leadId: call.leadId,
      customerId: call.customerId,
    });
  },
};
