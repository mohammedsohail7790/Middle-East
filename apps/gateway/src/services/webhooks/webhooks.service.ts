/**
 * Custom Webhooks Service
 * Manages user-defined webhooks for event-driven integrations.
 */

import { createHmac, randomBytes } from 'crypto';
import { logger } from '../logger.js';
import { pool } from '../db/pool.js';

export interface CustomWebhook {
  id: string;
  tenantId: string;
  name: string;
  url: string;
  events: string[];
  secret: string | null;
  headers: Record<string, string>;
  active: boolean;
  lastTriggeredAt: Date | null;
  lastError: string | null;
  failureCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  tenantId: string;
  eventType: string;
  payload: Record<string, any>;
  responseStatus: number | null;
  responseBody: string | null;
  delivered: boolean;
  attemptedAt: Date;
}

export class CustomWebhooksService {
  /**
   * Create a new custom webhook.
   */
  async create(tenantId: string, data: { name: string; url: string; events: string[]; headers?: Record<string, string> }): Promise<CustomWebhook> {
    const secret = randomBytes(32).toString('hex');

    const result = await pool.query(
      `INSERT INTO public.custom_webhooks (tenant_id, name, url, events, secret, headers)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, tenant_id, name, url, events, secret, headers, active, last_triggered_at, last_error, failure_count, created_at, updated_at`,
      [tenantId, data.name, data.url, JSON.stringify(data.events), secret, JSON.stringify(data.headers || {})]
    );

    return this.mapRow(result.rows[0]);
  }

  /**
   * List active webhooks for a tenant.
   */
  async list(tenantId: string): Promise<CustomWebhook[]> {
    const result = await pool.query(
      `SELECT id, tenant_id, name, url, events, secret, headers, active, last_triggered_at, last_error, failure_count, created_at, updated_at
       FROM public.custom_webhooks
       WHERE tenant_id = $1
       ORDER BY created_at DESC`,
      [tenantId]
    );

    return result.rows.map((row: any) => this.mapRow(row));
  }

  /**
   * Update a webhook.
   */
  async update(tenantId: string, webhookId: string, data: { name?: string; url?: string; events?: string[]; headers?: Record<string, string>; active?: boolean }): Promise<CustomWebhook> {
    const fields: string[] = [];
    const values: any[] = [];
    let i = 1;

    if (data.name !== undefined) { fields.push(`name = $${i++}`); values.push(data.name); }
    if (data.url !== undefined) { fields.push(`url = $${i++}`); values.push(data.url); }
    if (data.events !== undefined) { fields.push(`events = $${i++}`); values.push(JSON.stringify(data.events)); }
    if (data.headers !== undefined) { fields.push(`headers = $${i++}`); values.push(JSON.stringify(data.headers)); }
    if (data.active !== undefined) { fields.push(`active = $${i++}`); values.push(data.active); }
    fields.push(`updated_at = NOW()`);
    values.push(webhookId, tenantId);

    const result = await pool.query(
      `UPDATE public.custom_webhooks
       SET ${fields.join(', ')}
       WHERE id = $${i++} AND tenant_id = $${i++}
       RETURNING id, tenant_id, name, url, events, secret, headers, active, last_triggered_at, last_error, failure_count, created_at, updated_at`,
      values
    );

    if (result.rows.length === 0) throw new Error('Webhook not found');
    return this.mapRow(result.rows[0]);
  }

  /**
   * Delete a webhook.
   */
  async delete(tenantId: string, webhookId: string): Promise<void> {
    await pool.query(
      `DELETE FROM public.custom_webhooks WHERE id = $1 AND tenant_id = $2`,
      [webhookId, tenantId]
    );
  }

  /**
   * Dispatch an event to all matching webhooks.
   */
  async dispatchEvent(tenantId: string, eventType: string, payload: Record<string, any>): Promise<void> {
    const result = await pool.query(
      `SELECT id, url, secret, headers FROM public.custom_webhooks
       WHERE tenant_id = $1 AND active = true AND events @> ARRAY[$2]::TEXT[]`,
      [tenantId, eventType]
    );

    for (const webhook of result.rows) {
      try {
        const body = JSON.stringify({ event: eventType, timestamp: new Date().toISOString(), data: payload });
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          ...(webhook.headers || {}),
        };

        // Sign payload if secret exists
        if (webhook.secret) {
          const signature = createHmac('sha256', webhook.secret).update(body).digest('hex');
          headers['X-HallaAI-Signature'] = `sha256=${signature}`;
        }

        const response = await fetch(webhook.url, {
          method: 'POST',
          headers,
          body,
          signal: AbortSignal.timeout(10000),
        });

        const responseBody = await response.text();

        // Log delivery
        await pool.query(
          `INSERT INTO public.webhook_deliveries (webhook_id, tenant_id, event_type, payload, response_status, response_body, delivered)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [webhook.id, tenantId, eventType, JSON.stringify(payload), response.status, responseBody, response.ok]
        );

        // Update webhook status
        await pool.query(
          `UPDATE public.custom_webhooks 
           SET last_triggered_at = NOW(), last_error = NULL, failure_count = 0
           WHERE id = $1`,
          [webhook.id]
        );
      } catch (error: any) {
        logger.error('Webhook delivery failed', { webhookId: webhook.id, error: error instanceof Error ? error instanceof Error ? error instanceof Error ? error instanceof Error ? error instanceof Error ? error.message : String(error) : String(error) : String(error) : String(error) : String(error) });

        await pool.query(
          `INSERT INTO public.webhook_deliveries (webhook_id, tenant_id, event_type, payload, response_status, response_body, delivered)
           VALUES ($1, $2, $3, $4, $5, $6, false)`,
          [webhook.id, tenantId, eventType, JSON.stringify(payload), null, error instanceof Error ? error instanceof Error ? error instanceof Error ? error instanceof Error ? error instanceof Error ? error.message : String(error) : String(error) : String(error) : String(error) : String(error), false]
        );

        await pool.query(
          `UPDATE public.custom_webhooks 
           SET last_error = $1, failure_count = failure_count + 1
           WHERE id = $2`,
          [error instanceof Error ? error instanceof Error ? error instanceof Error ? error instanceof Error ? error instanceof Error ? error.message : String(error) : String(error) : String(error) : String(error) : String(error), webhook.id]
        );
      }
    }
  }

  /**
   * Get webhook delivery history.
   */
  async getDeliveries(tenantId: string, webhookId: string, limit = 50): Promise<WebhookDelivery[]> {
    const result = await pool.query(
      `SELECT id, webhook_id, tenant_id, event_type, payload, response_status, response_body, delivered, attempted_at
       FROM public.webhook_deliveries
       WHERE tenant_id = $1 AND webhook_id = $2
       ORDER BY attempted_at DESC
       LIMIT $3`,
      [tenantId, webhookId, limit]
    );

    return result.rows.map((row: any) => ({
      id: row.id,
      webhookId: row.webhook_id,
      tenantId: row.tenant_id,
      eventType: row.event_type,
      payload: row.payload,
      responseStatus: row.response_status,
      responseBody: row.response_body,
      delivered: row.delivered,
      attemptedAt: row.attempted_at,
    }));
  }

  private mapRow(row: any): CustomWebhook {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      url: row.url,
      events: row.events,
      secret: row.secret,
      headers: row.headers || {},
      active: row.active,
      lastTriggeredAt: row.last_triggered_at,
      lastError: row.last_error,
      failureCount: row.failure_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const customWebhooksService = new CustomWebhooksService();

