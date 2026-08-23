import { pool } from '../db/pool.js';

/**
 * Slack Service
 * Handles Slack integration and notifications
 */

import fetch from 'node-fetch';
import { getDashboardBaseUrl } from '../integrations/oauth-redirect.js';

export interface SlackConnection {
  id: string;
  tenantId: string;
  webhookUrl: string;
  channel: string;
  enabled: boolean;
  createdAt: Date;
}

export interface SlackNotificationSettings {
  newLead: boolean;
  newCall: boolean;
  appointmentBooked: boolean;
  missedCall: boolean;
}

export class SlackService {
  /**
   * Save Slack webhook
   */
  async saveWebhook(
    tenantId: string,
    webhookUrl: string,
    channel: string
  ): Promise<SlackConnection> {
    try {
      const result = await pool.query(
        `INSERT INTO public.slack_connections (tenant_id, webhook_url, channel, enabled)
         VALUES ($1, $2, $3, true)
         ON CONFLICT (tenant_id)
         DO UPDATE SET
           webhook_url = $2,
           channel = $3,
           enabled = true,
           updated_at = NOW()
         RETURNING id, tenant_id, webhook_url, channel, enabled, created_at`,
        [tenantId, webhookUrl, channel]
      );

      console.log(`[Slack] Webhook saved for tenant ${tenantId}`);

      return this.mapToSlackConnection(result.rows[0]);
    } catch (error) {
      console.error('[Slack] Error saving webhook:', error);
      throw error;
    }
  }

  /**
   * Get Slack connection
   */
  async getConnection(tenantId: string): Promise<SlackConnection | null> {
    try {
      const result = await pool.query(
        `SELECT id, tenant_id, webhook_url, channel, enabled, created_at
         FROM public.slack_connections
         WHERE tenant_id = $1`,
        [tenantId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapToSlackConnection(result.rows[0]);
    } catch (error) {
      console.error('[Slack] Error getting connection:', error);
      throw error;
    }
  }

  /**
   * Toggle Slack notifications
   */
  async toggleNotifications(tenantId: string, enabled: boolean): Promise<void> {
    try {
      await pool.query(
        `UPDATE public.slack_connections
         SET enabled = $1, updated_at = NOW()
         WHERE tenant_id = $2`,
        [enabled, tenantId]
      );

      console.log(`[Slack] Notifications ${enabled ? 'enabled' : 'disabled'} for tenant ${tenantId}`);
    } catch (error) {
      console.error('[Slack] Error toggling notifications:', error);
      throw error;
    }
  }

  /**
   * Send Slack message
   */
  private async sendMessage(webhookUrl: string, message: any): Promise<void> {
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        throw new Error(`Slack API error: ${response.statusText}`);
      }

      console.log('[Slack] Message sent successfully');
    } catch (error) {
      console.error('[Slack] Error sending message:', error);
      throw error;
    }
  }

  /**
   * Send new lead notification
   */
  async sendNewLeadNotification(
    tenantId: string,
    leadData: {
      name?: string;
      phone: string;
      email?: string;
      source: string;
      score: number;
    }
  ): Promise<void> {
    try {
      const connection = await this.getConnection(tenantId);
      if (!connection || !connection.enabled) {
        return;
      }

      const message = {
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '🎯 New Lead Received',
              emoji: true,
            },
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Name:*\n${leadData.name || 'Not provided'}`,
              },
              {
                type: 'mrkdwn',
                text: `*Phone:*\n${leadData.phone}`,
              },
              {
                type: 'mrkdwn',
                text: `*Email:*\n${leadData.email || 'Not provided'}`,
              },
              {
                type: 'mrkdwn',
                text: `*Source:*\n${leadData.source}`,
              },
              {
                type: 'mrkdwn',
                text: `*Score:*\n${leadData.score}/100`,
              },
            ],
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: 'View in Dashboard',
                  emoji: true,
                },
                url: `${getDashboardBaseUrl()}/leads`,
                style: 'primary',
              },
            ],
          },
        ],
      };

      await this.sendMessage(connection.webhookUrl, message);
    } catch (error) {
      console.error('[Slack] Error sending new lead notification:', error);
    }
  }

  /**
   * Send new call notification
   */
  async sendNewCallNotification(
    tenantId: string,
    callData: {
      from: string;
      duration: number;
      disposition?: string;
      sentiment?: string;
    }
  ): Promise<void> {
    try {
      const connection = await this.getConnection(tenantId);
      if (!connection || !connection.enabled) {
        return;
      }

      const sentimentEmoji = callData.sentiment === 'positive' ? '😊' : 
                            callData.sentiment === 'negative' ? '😞' : '😐';

      const message = {
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '📞 New Call Received',
              emoji: true,
            },
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*From:*\n${callData.from}`,
              },
              {
                type: 'mrkdwn',
                text: `*Duration:*\n${Math.floor(callData.duration / 60)}m ${callData.duration % 60}s`,
              },
              {
                type: 'mrkdwn',
                text: `*Disposition:*\n${callData.disposition || 'Not set'}`,
              },
              {
                type: 'mrkdwn',
                text: `*Sentiment:*\n${sentimentEmoji} ${callData.sentiment || 'Unknown'}`,
              },
            ],
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: 'View Call',
                  emoji: true,
                },
                url: `${getDashboardBaseUrl()}/calls`,
                style: 'primary',
              },
            ],
          },
        ],
      };

      await this.sendMessage(connection.webhookUrl, message);
    } catch (error) {
      console.error('[Slack] Error sending new call notification:', error);
    }
  }

  /**
   * Send appointment booked notification
   */
  async sendAppointmentBookedNotification(
    tenantId: string,
    appointmentData: {
      customerName?: string;
      customerPhone: string;
      appointmentTime: Date;
      service: string;
    }
  ): Promise<void> {
    try {
      const connection = await this.getConnection(tenantId);
      if (!connection || !connection.enabled) {
        return;
      }

      const formattedDate = appointmentData.appointmentTime.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      const formattedTime = appointmentData.appointmentTime.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      });

      const message = {
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '📅 New Appointment Booked',
              emoji: true,
            },
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Customer:*\n${appointmentData.customerName || 'Not provided'}`,
              },
              {
                type: 'mrkdwn',
                text: `*Phone:*\n${appointmentData.customerPhone}`,
              },
              {
                type: 'mrkdwn',
                text: `*Service:*\n${appointmentData.service}`,
              },
              {
                type: 'mrkdwn',
                text: `*Date & Time:*\n${formattedDate} at ${formattedTime}`,
              },
            ],
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: 'View Appointment',
                  emoji: true,
                },
                url: `${getDashboardBaseUrl()}/calendar`,
                style: 'primary',
              },
            ],
          },
        ],
      };

      await this.sendMessage(connection.webhookUrl, message);
    } catch (error) {
      console.error('[Slack] Error sending appointment booked notification:', error);
    }
  }

  /**
   * Send missed call notification
   */
  async sendMissedCallNotification(
    tenantId: string,
    callData: {
      from: string;
      time: Date;
    }
  ): Promise<void> {
    try {
      const connection = await this.getConnection(tenantId);
      if (!connection || !connection.enabled) {
        return;
      }

      const message = {
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '⚠️ Missed Call',
              emoji: true,
            },
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*From:*\n${callData.from}`,
              },
              {
                type: 'mrkdwn',
                text: `*Time:*\n${callData.time.toLocaleString()}`,
              },
            ],
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: 'Call Back',
                  emoji: true,
                },
                url: `${getDashboardBaseUrl()}/calls`,
                style: 'danger',
              },
            ],
          },
        ],
      };

      await this.sendMessage(connection.webhookUrl, message);
    } catch (error) {
      console.error('[Slack] Error sending missed call notification:', error);
    }
  }

  /**
   * Test Slack connection
   */
  async testConnection(webhookUrl: string): Promise<boolean> {
    try {
      const message = {
        text: '✅ Slack integration test successful! Call IQ is now connected.',
      };

      await this.sendMessage(webhookUrl, message);
      return true;
    } catch (error) {
      console.error('[Slack] Error testing connection:', error);
      return false;
    }
  }

  /**
   * Disconnect Slack
   */
  async disconnect(tenantId: string): Promise<void> {
    try {
      await pool.query(
        'DELETE FROM public.slack_connections WHERE tenant_id = $1',
        [tenantId]
      );

      console.log(`[Slack] Disconnected for tenant ${tenantId}`);
    } catch (error) {
      console.error('[Slack] Error disconnecting:', error);
      throw error;
    }
  }

  /**
   * Map database row to SlackConnection
   */
  private mapToSlackConnection(row: any): SlackConnection {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      webhookUrl: row.webhook_url,
      channel: row.channel,
      enabled: row.enabled,
      createdAt: row.created_at,
    };
  }
}

export const slackService = new SlackService();

