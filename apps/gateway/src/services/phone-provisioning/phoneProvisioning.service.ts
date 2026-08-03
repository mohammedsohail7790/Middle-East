import { pool } from '../db/pool.js';

/**
 * Phone Provisioning Service
 * Handles Twilio phone number search, purchase, release, and webhook configuration.
 */

import twilio from 'twilio';

import { logger } from '../logger.js';
import { getGatewayPublicHttpsBase } from '../env.js';

function getTwilioClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!sid || !token) {
    throw new Error(
      'Twilio is not configured on the gateway. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.'
    );
  }
  return twilio(sid, token);
}

export function isTwilioConfigured(): boolean {
  return Boolean(process.env.TWILIO_ACCOUNT_SID?.trim() && process.env.TWILIO_AUTH_TOKEN?.trim());
}

export function isGatewayReadyForTwilio(): boolean {
  return Boolean(getGatewayPublicHttpsBase());
}

export interface AvailableNumber {
  phoneNumber: string;
  friendlyName: string;
  voice: boolean;
  sms: boolean;
  mms: boolean;
  monthlyCost: number;
}

export interface PurchasedNumber {
  id: string;
  tenantId: string;
  phoneNumber: string;
  twilioSid: string;
  friendlyName: string;
  capabilities: { voice: boolean; sms: boolean; mms: boolean };
  monthlyCost: number;
  webhookUrl: string;
  status: string;
  purchasedAt: Date;
  aiAgentId?: string | null;
}

export interface TenantNumberStats {
  activeCount: number;
  maxAllowed: number;
  canAddMore: boolean;
  remaining: number;
  twilioConfigured: boolean;
  gatewayReady: boolean;
}

export class PhoneProvisioningService {
  /**
   * Search for available Twilio numbers by area code.
   */
  async searchAvailable(areaCode: string, limit = 10): Promise<AvailableNumber[]> {
    const cleanAreaCode = areaCode.replace(/\D/g, '');
    if (cleanAreaCode.length !== 3) {
      throw new Error('Area code must be exactly 3 digits');
    }

    const available = await getTwilioClient().availablePhoneNumbers('US').local.list({
      areaCode: cleanAreaCode as unknown as number,
      limit: limit as unknown as number,
      smsEnabled: true,
      voiceEnabled: true,
    } as any);

    return available.map((num) => ({
      phoneNumber: num.phoneNumber,
      friendlyName: num.friendlyName,
      voice: (num as any).voice ?? true,
      sms: (num as any).sms ?? true,
      mms: (num as any).mms ?? false,
      monthlyCost: 1.15,
    }));
  }

  /**
   * Get plan-based phone number limits for a tenant.
   */
  async getTenantNumberStats(tenantId: string): Promise<TenantNumberStats> {
    // Get active number count
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM public.tenant_phone_numbers WHERE tenant_id = $1 AND status = 'active'`,
      [tenantId]
    );
    const activeCount = parseInt(countResult.rows[0].count, 10);

    // Get subscription plan
    const subResult = await pool.query(
      `SELECT plan, status FROM public.subscriptions WHERE tenant_id = $1 AND status IN ('active', 'trialing', 'past_due') ORDER BY created_at DESC LIMIT 1`,
      [tenantId]
    );

    const { getMaxPhoneNumbers } = await import('../../config/plan-limits.js');
    let maxAllowed = 1;
    if (subResult.rows.length > 0) {
      maxAllowed = getMaxPhoneNumbers(subResult.rows[0].plan, subResult.rows[0].status);
    }

    return {
      activeCount,
      maxAllowed,
      canAddMore: activeCount < maxAllowed,
      remaining: maxAllowed - activeCount,
      twilioConfigured: isTwilioConfigured(),
      gatewayReady: isGatewayReadyForTwilio(),
    };
  }

  /**
   * Purchase a phone number and assign it to a tenant.
   * Auto-configures the Twilio webhook to point to our gateway.
   */
  async purchaseNumber(tenantId: string, phoneNumber: string): Promise<PurchasedNumber> {
    // Check plan limits
    const stats = await this.getTenantNumberStats(tenantId);
    if (!stats.canAddMore) {
      throw new Error(
        `Phone number limit reached: ${stats.activeCount}/${stats.maxAllowed}. Upgrade plan for more numbers.`
      );
    }

    // Check if already purchased
    const existing = await pool.query(
      `SELECT id FROM public.tenant_phone_numbers WHERE phone_number = $1 AND tenant_id = $2 AND status = 'active'`,
      [phoneNumber, tenantId]
    );
    if (existing.rows.length > 0) {
      throw new Error('This phone number is already assigned to your account');
    }

    // Get the base gateway URL for webhook (same source as onboarding / Twilio streams)
    const baseUrl = getGatewayPublicHttpsBase();
    if (!baseUrl) {
      throw new Error(
        'Gateway public HTTPS URL is not configured. Set RENDER_EXTERNAL_URL, GATEWAY_PUBLIC_URL, or TWILIO_STREAM_WSS_URL (wss://… is converted to https://…).'
      );
    }

    const webhookUrl = `${baseUrl}/api/v1/voice/incoming-call`;
    const smsWebhookUrl = `${baseUrl}/api/v1/sms/webhook`;

    try {
      // Purchase the number via Twilio
      const incomingNumber = await getTwilioClient().incomingPhoneNumbers.create({
        phoneNumber,
        friendlyName: `Call IQ - Tenant ${tenantId.slice(0, 8)}`,
        voiceUrl: webhookUrl,
        voiceMethod: 'POST',
        smsUrl: smsWebhookUrl,
        smsMethod: 'POST',
        statusCallback: `${baseUrl}/api/v1/voice/stream-status`,
        statusCallbackMethod: 'POST',
      });

      // Save to database
      const result = await pool.query(
        `INSERT INTO public.tenant_phone_numbers (tenant_id, phone_number, twilio_sid, friendly_name, capabilities, monthly_cost, webhook_url, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
         RETURNING id, tenant_id, phone_number, twilio_sid, friendly_name, capabilities, monthly_cost, webhook_url, status, purchased_at`,
        [
          tenantId,
          phoneNumber,
          incomingNumber.sid,
          incomingNumber.friendlyName,
          JSON.stringify({
            voice: (incomingNumber as any).voice ?? true,
            sms: (incomingNumber as any).sms ?? true,
            mms: (incomingNumber as any).mms ?? false,
          }),
          1.15,
          webhookUrl,
        ]
      );

      // Sync primary line on voice_tenants (replace placeholder +1000… numbers).
      // phone_number is the canonical Twilio line column (migration 008); there is
      // no separate twilio_phone_number column on this table.
      await pool.query(
        `UPDATE public.voice_tenants
         SET phone_number = $1
         WHERE id = $2
           AND (phone_number IS NULL OR phone_number LIKE '+1000%')`,
        [phoneNumber, tenantId]
      );

      // Log the purchase
      await pool.query(
        `INSERT INTO public.phone_number_logs (tenant_id, action, phone_number, twilio_sid, details)
         VALUES ($1, 'purchased', $2, $3, $4)`,
        [
          tenantId,
          phoneNumber,
          incomingNumber.sid,
          JSON.stringify({ areaCode: phoneNumber.slice(2, 5) }),
        ]
      );

      logger.info('Phone number purchased and assigned', {
        tenantId,
        phoneNumber,
        twilioSid: incomingNumber.sid,
      });

      void import('../dashboard/dashboard-events.js').then(({ publishDashboardPushType }) => {
        publishDashboardPushType(tenantId, 'phone.updated', [], { phoneNumber });
      });

      const row = result.rows[0];
      return {
        id: row.id,
        tenantId: row.tenant_id,
        phoneNumber: row.phone_number,
        twilioSid: row.twilio_sid,
        friendlyName: row.friendly_name,
        capabilities: row.capabilities,
        monthlyCost: Number(row.monthly_cost),
        webhookUrl: row.webhook_url,
        status: row.status,
        purchasedAt: row.purchased_at,
      };
    } catch (error: any) {
      await pool.query(
        `INSERT INTO public.phone_number_logs (tenant_id, action, phone_number, details)
         VALUES ($1, 'failed', $2, $3)`,
        [tenantId, phoneNumber, JSON.stringify({ error: error instanceof Error ? error instanceof Error ? error instanceof Error ? error instanceof Error ? error.message : String(error) : String(error) : String(error) : String(error) })]
      );
      throw error;
    }
  }

  /**
   * Release a phone number (remove from Twilio and database).
   */
  async releaseNumber(tenantId: string, numberId: string): Promise<void> {
    const result = await pool.query(
      `SELECT phone_number, twilio_sid FROM public.tenant_phone_numbers WHERE id = $1 AND tenant_id = $2 AND status = 'active'`,
      [numberId, tenantId]
    );

    if (result.rows.length === 0) {
      throw new Error('Phone number not found or already released');
    }

    const { phone_number: phoneNumber, twilio_sid: twilioSid } = result.rows[0];

    try {
      // Remove from Twilio
      await getTwilioClient().incomingPhoneNumbers(twilioSid).remove();

      // Update status in database
      await pool.query(
        `UPDATE public.tenant_phone_numbers SET status = 'released' WHERE id = $1`,
        [numberId]
      );

      // Log the release
      await pool.query(
        `INSERT INTO public.phone_number_logs (tenant_id, action, phone_number, twilio_sid)
         VALUES ($1, 'released', $2, $3)`,
        [tenantId, phoneNumber, twilioSid]
      );

      logger.info('Phone number released', {
        tenantId,
        phoneNumber,
        twilioSid,
      });

      void import('../dashboard/dashboard-events.js').then(({ publishDashboardPushType }) => {
        publishDashboardPushType(tenantId, 'phone.updated', [], { phoneNumber, released: true });
      });
    } catch (error: any) {
      await pool.query(
        `INSERT INTO public.phone_number_logs (tenant_id, action, phone_number, details)
         VALUES ($1, 'failed', $2, $3)`,
        [tenantId, phoneNumber, JSON.stringify({ action: 'release', error: error instanceof Error ? error instanceof Error ? error instanceof Error ? error instanceof Error ? error.message : String(error) : String(error) : String(error) : String(error) })]
      );
      throw error;
    }
  }

  /**
   * List all active phone numbers for a tenant.
   */
  async listNumbers(tenantId: string): Promise<PurchasedNumber[]> {
    const result = await pool.query(
      `SELECT id, tenant_id, phone_number, twilio_sid, friendly_name, capabilities, monthly_cost, webhook_url, status, purchased_at, ai_agent_id
       FROM public.tenant_phone_numbers
       WHERE tenant_id = $1 AND status = 'active'
       ORDER BY purchased_at ASC`,
      [tenantId]
    );

    return result.rows.map((row: any) => ({
      id: row.id,
      tenantId: row.tenant_id,
      phoneNumber: row.phone_number,
      twilioSid: row.twilio_sid,
      friendlyName: row.friendly_name,
      capabilities: row.capabilities,
      monthlyCost: Number(row.monthly_cost),
      webhookUrl: row.webhook_url,
      status: row.status,
      purchasedAt: row.purchased_at,
      aiAgentId: row.ai_agent_id ?? null,
    }));
  }

  async assignAgent(tenantId: string, numberId: string, aiAgentId: string | null): Promise<void> {
    if (aiAgentId) {
      const agent = await pool.query(
        `SELECT id FROM public.ai_agents WHERE id = $1 AND tenant_id = $2 AND active = true`,
        [aiAgentId, tenantId]
      );
      if (!agent.rows.length) throw new Error('AI agent not found');
    }

    const result = await pool.query(
      `UPDATE public.tenant_phone_numbers
       SET ai_agent_id = $3
       WHERE id = $1 AND tenant_id = $2 AND status = 'active'
       RETURNING id`,
      [numberId, tenantId, aiAgentId]
    );
    if (!result.rows.length) throw new Error('Phone number not found');
  }

  async getNumber(tenantId: string, numberId: string): Promise<PurchasedNumber | null> {
    const result = await pool.query(
      `SELECT id, tenant_id, phone_number, twilio_sid, friendly_name, capabilities, monthly_cost, webhook_url, status, purchased_at
       FROM public.tenant_phone_numbers
       WHERE id = $1 AND tenant_id = $2`,
      [numberId, tenantId]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id,
      tenantId: row.tenant_id,
      phoneNumber: row.phone_number,
      twilioSid: row.twilio_sid,
      friendlyName: row.friendly_name,
      capabilities: row.capabilities,
      monthlyCost: Number(row.monthly_cost),
      webhookUrl: row.webhook_url,
      status: row.status,
      purchasedAt: row.purchased_at,
    };
  }
}

export const phoneProvisioningService = new PhoneProvisioningService();

