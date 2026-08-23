/**
 * Automation Service
 * Handles automated follow-ups, reminders, and notifications
 */

import { Resend } from 'resend';
import { voiceDb } from '../voice/tenant-scope.js';
import { renderBrandedEmail, renderDetailList, stripToPlainText } from './email-template.js';

const pool = voiceDb;

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export interface AutomationRule {
  id: string;
  tenantId: string;
  name: string;
  trigger: 'call_ended' | 'appointment_created' | 'lead_created' | 'appointment_reminder';
  action: 'send_sms' | 'send_email' | 'create_task';
  delay: number; // minutes
  template: string;
  enabled: boolean;
  createdAt: Date;
}

export class AutomationService {
  /**
   * Caller email from their lead record (email column, falling back to
   * custom_fields.email). All caller-facing notifications go out by email —
   * when no email was captured on the call, the notification is skipped.
   */
  private async resolveCallerEmail(tenantId: string, phone: string): Promise<string | null> {
    if (!phone) return null;
    try {
      const result = await pool.query(
        `SELECT COALESCE(NULLIF(TRIM(email), ''), NULLIF(TRIM(custom_fields->>'email'), '')) AS email
         FROM public.leads
         WHERE tenant_id = $1 AND phone = $2
         ORDER BY created_at DESC
         LIMIT 1`,
        [tenantId, phone]
      );
      return result.rows[0]?.email || null;
    } catch (error) {
      console.warn('[Automation] Caller email lookup failed:', error);
      return null;
    }
  }

  /**
   * Business-owner notification recipients: tenant metadata email + active team
   * members + the tenant owner's Supabase login email. The first two are optional
   * fields nothing currently populates for most tenants, so the owner's auth email
   * (always present — set at signup) is included unconditionally as a guaranteed
   * fallback rather than only when the others are empty.
   */
  private async getOwnerNotificationEmails(tenantId: string): Promise<string[]> {
    const emails = new Set<string>();
    try {
      const tenantResult = await pool.query(
        `SELECT vt.metadata->>'email' AS metadata_email, u.email AS owner_email
         FROM public.voice_tenants vt
         LEFT JOIN auth.users u ON u.id = vt.owner_user_id
         WHERE vt.id = $1`,
        [tenantId]
      );
      const row = tenantResult.rows[0];
      if (row?.metadata_email) emails.add(String(row.metadata_email).trim().toLowerCase());
      if (row?.owner_email) emails.add(String(row.owner_email).trim().toLowerCase());

      const teamResult = await pool.query(
        `SELECT email FROM public.team_members WHERE tenant_id = $1 AND is_active = true`,
        [tenantId]
      );
      for (const row of teamResult.rows) {
        if (row.email) emails.add(String(row.email).trim().toLowerCase());
      }
    } catch (error) {
      console.warn('[Automation] Owner email lookup failed:', error);
    }
    return [...emails];
  }

  /**
   * Send automated follow-up after call — by email to the caller when their
   * email was captured on the call (lead record). SMS follow-ups are retired.
   */
  async sendCallFollowUp(
    tenantId: string,
    callId: string,
    phoneNumber: string
  ): Promise<void> {
    try {
      // Get tenant info
      const tenantResult = await pool.query(
        "SELECT company_name, metadata->>'email' as email FROM public.voice_tenants WHERE id = $1",
        [tenantId]
      );

      if (tenantResult.rows.length === 0) return;

      const { company_name, email } = tenantResult.rows[0];
      const callerEmail = await this.resolveCallerEmail(tenantId, phoneNumber);

      // Check if automation is enabled
      const ruleResult = await pool.query(
        `SELECT id, tenant_id, "trigger", action, template, delay, enabled
         FROM public.automation_rules
         WHERE tenant_id = $1 AND "trigger" = 'call_ended' AND enabled = true
         LIMIT 1`,
        [tenantId]
      );

      if (ruleResult.rows.length === 0) {
        if (!callerEmail) {
          console.log(`[Automation] Skipping call follow-up for ${callId} — no caller email captured`);
          return;
        }
        await this.sendEmail(
          callerEmail,
          `Thanks for calling ${company_name}`,
          renderBrandedEmail({
            eyebrow: 'Thanks for calling',
            title: `Thanks for calling ${company_name}!`,
            bodyHtml: `<p>We've received your request and will get back to you shortly.</p>
             <p>Just reply to this email if you have any questions in the meantime.</p>`,
          })
        );
      } else {
        const rule = ruleResult.rows[0];

        // Replace variables in template
        let message = rule.template;
        message = message.replace(/{{company_name}}/g, company_name);
        message = message.replace(/{{phone_number}}/g, phoneNumber);

        // Legacy send_sms rules deliver by email to the caller now
        if (rule.action === 'send_sms' || rule.action === 'send_email') {
          const to = callerEmail || email;
          if (!to) {
            console.log(`[Automation] Skipping call follow-up for ${callId} — no recipient email`);
            return;
          }
          await this.sendEmail(
            to,
            `Follow-up from ${company_name}`,
            renderBrandedEmail({
              eyebrow: 'Follow-up',
              title: `Follow-up from ${company_name}`,
              bodyHtml: `<p>${message}</p>`,
            })
          );
        }
      }

      console.log(`[Automation] Call follow-up sent for call ${callId}`);
    } catch (error) {
      console.error('[Automation] Error sending call follow-up:', error);
    }
  }

  /**
   * Send appointment reminder
   */
   async sendAppointmentReminder(
    tenantId: string,
    appointmentId: string,
    hoursBeforeAppointment: number,
    preloaded?: {
      phone?: string;
      name?: string;
      service?: string;
      scheduled_time?: string | Date;
      company_name?: string;
    }
  ): Promise<void> {
    try {
      let appointment = preloaded;
      if (!appointment) {
        const appointmentResult = await pool.query(
          `SELECT a.phone, a.name, a.service, a.scheduled_time, vt.company_name, vt.phone_number as business_phone
           FROM public.appointments a
           JOIN public.voice_tenants vt ON a.tenant_id = vt.id
           WHERE a.id = $1 AND a.tenant_id = $2`,
          [appointmentId, tenantId]
        );
        if (appointmentResult.rows.length === 0) return;
        appointment = appointmentResult.rows[0];
      }
      const { phone, name, service, scheduled_time, company_name } = appointment;

      // Format appointment time
      const appointmentTime = new Date(scheduled_time);
      const formattedDate = appointmentTime.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      });
      const formattedTime = appointmentTime.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      });

      const reminderType = hoursBeforeAppointment === 24 ? '24-hour' : '1-hour';

      // Email the customer when their email was captured on the call
      const callerEmail = phone ? await this.resolveCallerEmail(tenantId, String(phone)) : null;
      if (callerEmail) {
        await this.sendEmail(
          callerEmail,
          `Reminder: your appointment with ${company_name} — ${formattedDate} at ${formattedTime}`,
          renderBrandedEmail({
            eyebrow: `${reminderType} reminder`,
            title: 'Your Appointment Is Coming Up',
            bodyHtml: `<p>This is your ${reminderType} reminder for your upcoming appointment with <strong>${company_name}</strong>.</p>
             ${renderDetailList([
               { label: 'When', value: `${formattedDate} at ${formattedTime}` },
               { label: 'Service', value: service || 'Appointment' },
               { label: 'Name on booking', value: name || 'Not provided' },
             ])}
             <p>Need to reschedule or cancel? Just call ${company_name} and our receptionist will take care of it.</p>`,
          })
        );
      }

      // Always notify the business so upcoming appointments are never silently missed
      const ownerEmails = await this.getOwnerNotificationEmails(tenantId);
      for (const ownerEmail of ownerEmails) {
        await this.sendEmail(
          ownerEmail,
          `⏰ Upcoming appointment (${reminderType}): ${name || phone || 'Customer'} — ${formattedDate} at ${formattedTime}`,
          renderBrandedEmail({
            eyebrow: `${reminderType} reminder`,
            title: 'Upcoming Appointment',
            bodyHtml: renderDetailList([
              { label: 'Customer', value: name || 'Not provided' },
              { label: 'Phone', value: phone || 'Not provided' },
              { label: 'Service', value: service || 'Appointment' },
              { label: 'When', value: `${formattedDate} at ${formattedTime}` },
            ]),
          })
        );
      }

      // Mark reminder as sent (handled by caller for proper flag tracking)

      console.log(`[Automation] ${reminderType} reminder sent for appointment ${appointmentId}`);
    } catch (error) {
      console.error('[Automation] Error sending appointment reminder:', error);
    }
  }

  /**
   * Send new lead notification
   */
  async sendNewLeadNotification(
    tenantId: string,
    leadId: string
  ): Promise<void> {
    try {
      // Get lead details
      const leadResult = await pool.query(
        `SELECT l.*, vt.company_name
         FROM public.leads l
         JOIN public.voice_tenants vt ON l.tenant_id = vt.id
         WHERE l.id = $1 AND l.tenant_id = $2`,
        [leadId, tenantId]
      );

      if (leadResult.rows.length === 0) return;

      const lead = leadResult.rows[0];
      const { name, phone_number, email, source, score } = lead;

      const ownerEmails = await this.getOwnerNotificationEmails(tenantId);

      const emailSubject = `🎯 New Lead: ${name || phone_number}`;
      const emailBody = renderBrandedEmail({
        eyebrow: 'New lead',
        title: 'New Lead Received',
        bodyHtml: renderDetailList([
          { label: 'Name', value: name || 'Not provided' },
          { label: 'Phone', value: phone_number },
          { label: 'Email', value: email || 'Not provided' },
          { label: 'Source', value: source },
          { label: 'Score', value: `${score}/100` },
        ]),
      });

      for (const ownerEmail of ownerEmails) {
        await this.sendEmail(ownerEmail, emailSubject, emailBody);
      }

      console.log(`[Automation] New lead notification sent for lead ${leadId}`);
    } catch (error) {
      console.error('[Automation] Error sending new lead notification:', error);
    }
  }

  /**
   * Send appointment confirmation
   */
   async sendAppointmentConfirmation(
    tenantId: string,
    appointmentId: string
  ): Promise<void> {
    try {
      const appointmentResult = await pool.query(
        `SELECT a.*, vt.company_name, vt.phone_number as business_phone
         FROM public.appointments a
         JOIN public.voice_tenants vt ON a.tenant_id = vt.id
         WHERE a.id = $1 AND a.tenant_id = $2`,
        [appointmentId, tenantId]
      );

      if (appointmentResult.rows.length === 0) return;

      const appointment = appointmentResult.rows[0];
      const { phone, name, service, scheduled_time, company_name, business_phone } = appointment;
      const startTime = new Date(scheduled_time);
      const formattedDate = startTime.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      const formattedStartTime = startTime.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      });

      // Email the customer when their email was captured on the call
      const callerEmail = phone ? await this.resolveCallerEmail(tenantId, String(phone)) : null;
      if (callerEmail) {
        await this.sendEmail(
          callerEmail,
          `Appointment confirmed with ${company_name} — ${formattedDate} at ${formattedStartTime}`,
          renderBrandedEmail({
            eyebrow: 'Booking confirmed',
            title: 'Your Appointment Is Confirmed',
            bodyHtml: renderDetailList([
              { label: 'Business', value: company_name },
              { label: 'When', value: `${formattedDate} at ${formattedStartTime}` },
              { label: 'Service', value: service || 'Appointment' },
              { label: 'Name on booking', value: name || 'Not provided' },
            ]) + `<p style="margin-top: 16px;">Need to reschedule? Call ${business_phone || company_name} and our receptionist will take care of it.</p>`,
          })
        );
      }

      // Always notify the business of the new booking
      const ownerEmails = await this.getOwnerNotificationEmails(tenantId);
      for (const ownerEmail of ownerEmails) {
        await this.sendEmail(
          ownerEmail,
          `📅 New appointment booked: ${name || phone || 'Customer'} — ${formattedDate} at ${formattedStartTime}`,
          renderBrandedEmail({
            eyebrow: 'New booking',
            title: 'New Appointment Booked',
            bodyHtml: renderDetailList([
              { label: 'Customer', value: name || 'Not provided' },
              { label: 'Phone', value: phone || 'Not provided' },
              { label: 'Service', value: service || 'Appointment' },
              { label: 'When', value: `${formattedDate} at ${formattedStartTime}` },
            ]),
          })
        );
      }

      console.log(`[Automation] Appointment confirmation sent for ${appointmentId}`);
    } catch (error) {
      console.error('[Automation] Error sending appointment confirmation:', error);
    }
  }

  /**
   * Process scheduled reminders
   */
  async processScheduledReminders(): Promise<void> {
    try {
      const now = new Date();
      const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const in1Hour = new Date(now.getTime() + 60 * 60 * 1000);

      const reminders24h = await pool.query(
        `SELECT a.id, a.tenant_id, a.name, a.phone, a.service, a.scheduled_time, vt.company_name
         FROM public.appointments a
         JOIN public.voice_tenants vt ON vt.id = a.tenant_id
         WHERE a.scheduled_time BETWEEN $1 AND $2
         AND a.status = 'booked'
         AND (a.reminder_24h_sent IS NULL OR a.reminder_24h_sent = false)`,
        [in24Hours, new Date(in24Hours.getTime() + 5 * 60 * 1000)]
      );

      const ids24h: string[] = [];
      for (const appointment of reminders24h.rows) {
        await this.sendAppointmentReminder(appointment.tenant_id, appointment.id, 24, appointment);
        ids24h.push(appointment.id);
      }
      if (ids24h.length) {
        await pool.query(
          `UPDATE public.appointments SET reminder_24h_sent = true WHERE id = ANY($1::uuid[])`,
          [ids24h]
        );
      }

      const reminders1h = await pool.query(
        `SELECT a.id, a.tenant_id, a.name, a.phone, a.service, a.scheduled_time, vt.company_name
         FROM public.appointments a
         JOIN public.voice_tenants vt ON vt.id = a.tenant_id
         WHERE a.scheduled_time BETWEEN $1 AND $2
         AND a.status = 'booked'
         AND (a.reminder_1h_sent IS NULL OR a.reminder_1h_sent = false)`,
        [in1Hour, new Date(in1Hour.getTime() + 5 * 60 * 1000)]
      );

      const ids1h: string[] = [];
      for (const appointment of reminders1h.rows) {
        await this.sendAppointmentReminder(appointment.tenant_id, appointment.id, 1, appointment);
        ids1h.push(appointment.id);
      }
      if (ids1h.length) {
        await pool.query(
          `UPDATE public.appointments SET reminder_1h_sent = true WHERE id = ANY($1::uuid[])`,
          [ids1h]
        );
      }

      console.log(`[Automation] Processed ${reminders24h.rows.length + reminders1h.rows.length} reminders`);
    } catch (error) {
      console.error('[Automation] Error processing scheduled reminders:', error);
    }
  }

   /**
    * Send email
    */
   private async sendEmail(
    to: string,
    subject: string,
    html: string
  ): Promise<void> {
    try {
      if (!resend) {
        console.log('[Automation] Resend not configured (RESEND_API_KEY missing), skipping email');
        return;
      }

      const from = process.env.EMAIL_FROM || 'noreply@hallaai.com';
      await resend.emails.send({
        from: `Halla AI <${from}>`,
        to,
        subject,
        html,
        text: stripToPlainText(html),
      });

      console.log(`[Automation] Email sent to ${to}`);
    } catch (error) {
      console.error('[Automation] Error sending email:', error);
    }
  }

  /**
   * Create automation rule
   */
  async createRule(
    tenantId: string,
    name: string,
    trigger: AutomationRule['trigger'],
    action: AutomationRule['action'],
    template: string,
    delay: number = 0
  ): Promise<AutomationRule> {
    try {
      const result = await pool.query(
        `INSERT INTO public.automation_rules (tenant_id, name, "trigger", action, template, delay, enabled)
         VALUES ($1, $2, $3, $4, $5, $6, true)
         RETURNING id, tenant_id, name, "trigger", action, delay, template, enabled, created_at`,
        [tenantId, name, trigger, action, template, delay]
      );

      return result.rows[0];
    } catch (error) {
      console.error('[Automation] Error creating rule:', error);
      throw error;
    }
  }

  /**
   * Get automation rules
   */
  async getRules(tenantId: string): Promise<AutomationRule[]> {
    try {
      const result = await pool.query(
        `SELECT id, tenant_id, name, "trigger", action, delay, template, enabled, created_at
         FROM public.automation_rules
         WHERE tenant_id = $1
         ORDER BY created_at DESC`,
        [tenantId]
      );

      return result.rows;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn('[Automation] getRules failed — returning empty list', { tenantId, error: msg });
      return [];
    }
  }

  /**
   * Toggle automation rule
   */
  async toggleRule(tenantId: string, ruleId: string, enabled: boolean): Promise<void> {
    try {
      await pool.query(
        `UPDATE public.automation_rules
         SET enabled = $1, updated_at = NOW()
         WHERE id = $2 AND tenant_id = $3`,
        [enabled, ruleId, tenantId]
      );
    } catch (error) {
      console.error('[Automation] Error toggling rule:', error);
      throw error;
    }
  }

  /**
   * Trigger lead_created automation rules
   */
  async triggerLeadCreated(
    tenantId: string,
    lead: { name: string; phone: string; interest?: string }
  ): Promise<void> {
    try {
      // Get automation rules for lead_created trigger
      const rulesResult = await pool.query(
        `SELECT id, tenant_id, "trigger", action, template, delay, enabled
         FROM public.automation_rules
         WHERE tenant_id = $1 AND "trigger" = 'lead_created' AND enabled = true`,
        [tenantId]
      );

      if (rulesResult.rows.length === 0) return;

      // Get tenant info
      const tenantResult = await pool.query(
        "SELECT company_name, metadata->>'email' AS email FROM public.voice_tenants WHERE id = $1",
        [tenantId]
      );
      const companyName = tenantResult.rows[0]?.company_name || 'Business';

      for (const rule of rulesResult.rows) {
        let message = rule.template || '';
        message = message.replace(/{{company_name}}/g, companyName);
        message = message.replace(/{{name}}/g, lead.name || 'Unknown');
        message = message.replace(/{{phone}}/g, lead.phone || '');
        message = message.replace(/{{interest}}/g, lead.interest || 'General');

        // Legacy send_sms rules deliver by email to the lead now (SMS retired)
        if (rule.action === 'send_sms' && lead.phone) {
          const leadEmail = await this.resolveCallerEmail(tenantId, lead.phone);
          if (!leadEmail) {
            console.log(`[Automation] Skipping lead follow-up for ${lead.phone} — no email captured`);
            continue;
          }
          const send = () =>
            this.sendEmail(
              leadEmail,
              `Follow-up from ${companyName}`,
              renderBrandedEmail({ eyebrow: 'Follow-up', title: `Follow-up from ${companyName}`, bodyHtml: `<p>${message}</p>` })
            ).catch(console.error);
          const delayMs = (rule.delay || 0) * 60 * 1000;
          if (delayMs > 0) {
            setTimeout(send, delayMs);
          } else {
            await send();
          }
        }

        if (rule.action === 'send_email') {
          const ownerEmails = await this.getOwnerNotificationEmails(tenantId);
          const html = renderBrandedEmail({
            eyebrow: 'New lead',
            title: `New Lead: ${lead.name}`,
            bodyHtml: `<p>${message}</p>`,
          });
          for (const ownerEmail of ownerEmails) {
            await this.sendEmail(ownerEmail, `New Lead: ${lead.name}`, html);
          }
        }
      }

      console.log(`[Automation] Lead created triggers executed for tenant ${tenantId}`);
    } catch (error) {
      console.error('[Automation] Error triggering lead_created:', error);
    }
  }
}

export const automationService = new AutomationService();

// Start reminder scheduler (runs every 5 minutes)
setInterval(() => {
  automationService.processScheduledReminders().catch(console.error);
}, 5 * 60 * 1000);

