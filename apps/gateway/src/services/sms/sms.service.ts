/**
 * SMS Service
 * Handles SMS sending, receiving, and conversation management via Twilio
 */

import twilio from 'twilio';

import { billingService } from '../billing/billing.service.js';
import { voiceDb } from '../voice/tenant-scope.js';

const pool = voiceDb;

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

export interface SmsMessage {
  id: string;
  tenantId: string;
  phoneNumber: string;
  direction: 'inbound' | 'outbound';
  message: string;
  status: string;
  twilioSid?: string;
  createdAt: Date;
  deliveredAt?: Date;
}

export interface SmsConversation {
  id: string;
  tenantId: string;
  phoneNumber: string;
  customerName?: string;
  lastMessageAt: Date;
  unreadCount: number;
  status: 'active' | 'archived';
  messages: SmsMessage[];
}

export interface SmsTemplate {
  id: string;
  tenantId: string;
  name: string;
  content: string;
  trigger: string;
  enabled: boolean;
}

export class SmsService {
  /**
   * Send SMS message
   */
  async sendSms(
    tenantId: string,
    to: string,
    message: string,
    from?: string
  ): Promise<SmsMessage> {
    try {
      const summary = await billingService.getFeatureSummary(tenantId);
      if (!summary.plan || summary.plan === 'none') {
        throw new Error('No active subscription. SMS summaries require an active plan.');
      }

      // Get tenant's phone number if not provided
      if (!from) {
        const tenantResult = await pool.query(
          'SELECT phone_number FROM public.voice_tenants WHERE id = $1',
          [tenantId]
        );
        from = tenantResult.rows[0]?.phone_number;
      }

      if (!from) {
        throw new Error('No phone number configured for tenant');
      }

      // Send via Twilio
      const twilioMessage = await twilioClient.messages.create({
        body: message,
        to,
        from,
      });

      // Store in database
      const result = await pool.query(
        `INSERT INTO public.sms_messages (
          tenant_id, phone_number, direction, message, status, twilio_sid
        ) VALUES ($1, $2, 'outbound', $3, $4, $5)
        RETURNING id, tenant_id, phone_number, direction, message, status, twilio_sid, created_at`,
        [tenantId, to, message, twilioMessage.status, twilioMessage.sid]
      );

      // Update conversation
      await this.updateConversation(tenantId, to);

      console.log(`[SMS] Sent message to ${to}: ${twilioMessage.sid}`);

      const { publishDashboardPushType } = await import('../dashboard/dashboard-events.js');
      publishDashboardPushType(tenantId, 'sms.outbound', [], { to, sid: twilioMessage.sid });

      return this.mapToSmsMessage(result.rows[0]);
    } catch (error) {
      console.error('[SMS] Error sending message:', error);
      throw error;
    }
  }

  /**
   * Receive SMS message (webhook handler)
   */
  async receiveSms(
    tenantId: string,
    from: string,
    body: string,
    twilioSid: string
  ): Promise<SmsMessage> {
    try {
      // Store incoming message
      const result = await pool.query(
        `INSERT INTO public.sms_messages (
          tenant_id, phone_number, direction, message, status, twilio_sid
        ) VALUES ($1, $2, 'inbound', $3, 'received', $4)
        RETURNING id, tenant_id, phone_number, direction, message, status, twilio_sid, created_at`,
        [tenantId, from, body, twilioSid]
      );

      // Update conversation
      await this.updateConversation(tenantId, from, true);

      console.log(`[SMS] Received message from ${from}`);

      // Check for auto-reply
      await this.checkAutoReply(tenantId, from, body);

      const { publishDashboardPushType } = await import('../dashboard/dashboard-events.js');
      publishDashboardPushType(tenantId, 'sms.inbound', [], { from, twilioSid });

      return this.mapToSmsMessage(result.rows[0]);
    } catch (error) {
      console.error('[SMS] Error receiving message:', error);
      throw error;
    }
  }

  /**
   * Get conversation with messages
   */
  async getConversation(
    tenantId: string,
    phoneNumber: string
  ): Promise<SmsConversation | null> {
    try {
      // Get conversation
      const convResult = await pool.query(
        `SELECT id, tenant_id, phone_number, customer_name, last_message_at, unread_count, status
         FROM public.sms_conversations
         WHERE tenant_id = $1 AND phone_number = $2`,
        [tenantId, phoneNumber]
      );

      if (convResult.rows.length === 0) {
        return null;
      }

      const conv = convResult.rows[0];

      // Get messages
      const messagesResult = await pool.query(
        `SELECT id, tenant_id, phone_number, direction, message, status, twilio_sid, created_at, delivered_at
         FROM public.sms_messages
         WHERE tenant_id = $1 AND phone_number = $2
         ORDER BY created_at DESC
         LIMIT 100`,
        [tenantId, phoneNumber]
      );

      return {
        id: conv.id,
        tenantId: conv.tenant_id,
        phoneNumber: conv.phone_number,
        customerName: conv.customer_name,
        lastMessageAt: conv.last_message_at,
        unreadCount: conv.unread_count,
        status: conv.status,
        messages: messagesResult.rows.map(this.mapToSmsMessage),
      };
    } catch (error) {
      console.error('[SMS] Error getting conversation:', error);
      throw error;
    }
  }

  /**
   * Get all conversations for tenant
   */
  async getConversations(
    tenantId: string,
    limit: number = 50,
    search?: string
  ): Promise<SmsConversation[]> {
    try {
      const term = search?.trim();
      const pattern = term ? `%${term}%` : null;
      const result = await pool.query(
        `SELECT
           c.id,
           c.tenant_id,
           c.phone_number,
           c.customer_name,
           c.last_message_at,
           c.unread_count,
           c.status,
           m.id AS msg_id,
           m.direction AS msg_direction,
           m.message AS msg_body,
           m.status AS msg_status,
           m.twilio_sid AS msg_twilio_sid,
           m.created_at AS msg_created_at,
           m.delivered_at AS msg_delivered_at
         FROM public.sms_conversations c
         LEFT JOIN LATERAL (
           SELECT id, direction, message, status, twilio_sid, created_at, delivered_at
           FROM public.sms_messages
           WHERE tenant_id = c.tenant_id AND phone_number = c.phone_number
           ORDER BY created_at DESC
           LIMIT 1
         ) m ON true
         WHERE c.tenant_id = $1
           AND (
             $3::text IS NULL
             OR c.phone_number ILIKE $3
             OR c.customer_name ILIKE $3
           )
         ORDER BY c.last_message_at DESC
         LIMIT $2`,
        [tenantId, limit, pattern]
      );

      return result.rows.map((conv: Record<string, unknown>) => ({
        id: conv.id,
        tenantId: conv.tenant_id,
        phoneNumber: conv.phone_number,
        customerName: conv.customer_name,
        lastMessageAt: conv.last_message_at,
        unreadCount: conv.unread_count,
        status: conv.status,
        messages: conv.msg_id
          ? [
              this.mapToSmsMessage({
                id: conv.msg_id,
                tenant_id: conv.tenant_id,
                phone_number: conv.phone_number,
                direction: conv.msg_direction,
                message: conv.msg_body,
                status: conv.msg_status,
                twilio_sid: conv.msg_twilio_sid,
                created_at: conv.msg_created_at,
                delivered_at: conv.msg_delivered_at,
              }),
            ]
          : [],
      }));
    } catch (error) {
      console.error('[SMS] Error getting conversations:', error);
      throw error;
    }
  }

  /**
   * Mark conversation as read
   */
  async markAsRead(tenantId: string, phoneNumber: string): Promise<void> {
    try {
      await pool.query(
        `UPDATE public.sms_conversations
         SET unread_count = 0
         WHERE tenant_id = $1 AND phone_number = $2`,
        [tenantId, phoneNumber]
      );
      const { publishDashboardPush } = await import('../dashboard/dashboard-events.js');
      publishDashboardPush(tenantId, {
        type: 'sms.inbound',
        scopes: ['sms'],
        meta: { markRead: true, phoneNumber },
      });
    } catch (error) {
      console.error('[SMS] Error marking as read:', error);
      throw error;
    }
  }

  /**
   * Send SMS from template
   */
  async sendFromTemplate(
    tenantId: string,
    to: string,
    templateId: string,
    variables?: Record<string, string>
  ): Promise<SmsMessage> {
    try {
      // Get template
      const templateResult = await pool.query(
        'SELECT content FROM public.sms_templates WHERE id = $1 AND tenant_id = $2',
        [templateId, tenantId]
      );

      if (templateResult.rows.length === 0) {
        throw new Error('Template not found');
      }

      let message = templateResult.rows[0].content;

      // Replace variables
      if (variables) {
        Object.entries(variables).forEach(([key, value]) => {
          message = message.replace(new RegExp(`{{${key}}}`, 'g'), value);
        });
      }

      return await this.sendSms(tenantId, to, message);
    } catch (error) {
      console.error('[SMS] Error sending from template:', error);
      throw error;
    }
  }

  /**
   * Create SMS template
   */
  async createTemplate(
    tenantId: string,
    name: string,
    content: string,
    trigger: string
  ): Promise<SmsTemplate> {
    try {
      const result = await pool.query(
        `INSERT INTO public.sms_templates (tenant_id, name, content, trigger)
         VALUES ($1, $2, $3, $4)
         RETURNING id, tenant_id, name, content, trigger, enabled`,
        [tenantId, name, content, trigger]
      );

      return result.rows[0];
    } catch (error) {
      console.error('[SMS] Error creating template:', error);
      throw error;
    }
  }

  /**
   * Get templates
   */
  async getTemplates(tenantId: string): Promise<SmsTemplate[]> {
    try {
      const result = await pool.query(
        'SELECT id, tenant_id, name, content, trigger, enabled FROM public.sms_templates WHERE tenant_id = $1',
        [tenantId]
      );

      return result.rows;
    } catch (error) {
      console.error('[SMS] Error getting templates:', error);
      throw error;
    }
  }

  /**
   * Update conversation metadata
   */
  private async updateConversation(
    tenantId: string,
    phoneNumber: string,
    incrementUnread: boolean = false
  ): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO public.sms_conversations (tenant_id, phone_number, last_message_at, unread_count)
         VALUES ($1, $2, NOW(), $3)
         ON CONFLICT (tenant_id, phone_number)
         DO UPDATE SET 
           last_message_at = NOW(),
           unread_count = CASE 
             WHEN $3 THEN sms_conversations.unread_count + 1 
             ELSE sms_conversations.unread_count 
           END`,
        [tenantId, phoneNumber, incrementUnread]
      );
    } catch (error) {
      console.error('[SMS] Error updating conversation:', error);
    }
  }

  /**
   * Check for auto-reply triggers
   */
  private async checkAutoReply(
    tenantId: string,
    phoneNumber: string,
    message: string
  ): Promise<void> {
    try {
      const lowerMessage = message.toLowerCase();

      // Check for common keywords
      if (lowerMessage.includes('hours') || lowerMessage.includes('open')) {
        // Send business hours
        const tenantResult = await pool.query(
          'SELECT company_name FROM public.voice_tenants WHERE id = $1',
          [tenantId]
        );
        
        const businessName = tenantResult.rows[0]?.company_name || 'Our business';
        await this.sendSms(
          tenantId,
          phoneNumber,
          `${businessName} is open Monday-Friday 9AM-5PM. How can we help you?`
        );
      }
    } catch (error) {
      console.error('[SMS] Error checking auto-reply:', error);
    }
  }

  /**
   * Map database row to SmsMessage
   */
  private mapToSmsMessage(row: any): SmsMessage {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      phoneNumber: row.phone_number,
      direction: row.direction,
      message: row.message,
      status: row.status,
      twilioSid: row.twilio_sid,
      createdAt: row.created_at,
      deliveredAt: row.delivered_at,
    };
  }
}

export const smsService = new SmsService();

