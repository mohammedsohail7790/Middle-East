/**
 * Custom Webhooks Service
 * Manages user-defined webhooks for event-driven integrations.
 */

import { createHmac, randomBytes } from 'crypto';
import { logger } from '../logger.js';
import { pool } from '../db/pool.js';
import { assertSafeWebhookUrl, HostResolutionError } from '../../security/ssrf-guard.js';
import { safePostJson } from '../../security/safe-http.js';
import { signWebhookPayload } from '../../security/webhook-signing.js';
import { assertValidKlarosEvents, type KlarosEventType } from '../../security/klaros-event-types.js';

export interface CustomWebhook {
  id: string;
  tenantId: string;
  name: string;
  url: string;
  events: string[];
  /** Present ONLY in the response to create(). Every later read omits it. */
  secret?: string;
  headers: Record<string, string>;
  active: boolean;
  lastTriggeredAt: Date | null;
  lastError: string | null;
  failureCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface KlarosSequenceStep {
  type: KlarosEventType;
  /** Stable external event id; must be identical on every retry (it is the idempotency key). */
  eventId: string;
  data: Record<string, unknown>;
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
    assertValidKlarosEvents(data.events);
    await assertSafeWebhookUrl(data.url);
    const secret = randomBytes(32).toString('hex');

    const result = await pool.query(
      `INSERT INTO public.custom_webhooks (tenant_id, name, url, events, secret, headers)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, tenant_id, name, url, events, secret, headers, active, last_triggered_at, last_error, failure_count, created_at, updated_at`,
      [tenantId, data.name, data.url, data.events, secret, JSON.stringify(data.headers || {})]
    );

    // The signing secret is shown exactly once, here.
    return this.mapRow(result.rows[0], true);
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
    if (data.url !== undefined) {
      await assertSafeWebhookUrl(data.url);
      fields.push(`url = $${i++}`); values.push(data.url);
    }
    if (data.events !== undefined) {
      assertValidKlarosEvents(data.events);
      fields.push(`events = $${i++}`); values.push(data.events);
    }
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
   * Dispatch one canonical Klaros event to all subscribed, active webhooks.
   * See {@link dispatchKlarosSequence} for the delivery guarantees.
   */
  async dispatchKlarosEvent(
    tenantId: string,
    eventType: KlarosEventType,
    eventId: string,
    data: Record<string, unknown>
  ): Promise<void> {
    await this.dispatchKlarosSequence(tenantId, [{ type: eventType, eventId, data }]);
  }

  /**
   * Deliver an ORDERED sequence of Klaros events (e.g. lead.qualified then
   * call.completed) to every subscribed, active webhook.
   *
   * Guarantees, per webhook:
   *  - Order: a step is only attempted once every earlier step it subscribes to
   *    has been delivered, so a retry can never overtake an earlier event.
   *  - Never out of order: if a later step has already been delivered, earlier
   *    undelivered steps are skipped, never sent afterwards (also protects
   *    manual DLQ replays).
   *  - Idempotent: delivered steps are skipped (unique (webhook, event) row).
   *  - No deadlock: on `finalAttempt` a failing step no longer holds back the
   *    steps after it, so the last step is still delivered; the failed step
   *    stays recorded as undelivered.
   *
   * Signed, SSRF-validated on every call, never follows redirects. Throws if any
   * step failed so the bus applies its bounded retry / backoff / DLQ handling.
   * Runs only from the event-bus consumer, never inline with the voice path.
   */
  async dispatchKlarosSequence(
    tenantId: string,
    steps: KlarosSequenceStep[],
    options: { finalAttempt?: boolean } = {}
  ): Promise<void> {
    if (steps.length === 0) return;

    const result = await pool.query(
      `SELECT id, url, secret, events FROM public.custom_webhooks
       WHERE tenant_id = $1 AND active = true AND events && $2::TEXT[]`,
      [tenantId, [...new Set(steps.map((s) => s.type))]]
    );

    let firstError: Error | null = null;

    for (const webhook of result.rows) {
      const subscribed: string[] = webhook.events ?? [];
      const mine = steps.filter((s) => subscribed.includes(s.type));
      try {
        // Resume after the most recent step already delivered; earlier ones must never follow it.
        let start = 0;
        for (let i = mine.length - 1; i >= 0; i--) {
          const existing = await pool.query(
            `SELECT delivered FROM public.webhook_deliveries WHERE webhook_id = $1 AND event_id = $2`,
            [webhook.id, mine[i].eventId]
          );
          if (existing.rows[0]?.delivered) {
            start = i + 1;
            break;
          }
        }
        if (start >= mine.length) continue; // everything already delivered

        // Validated again on EVERY dispatch (never trusted from registration):
        // HTTPS-only, literal host rules, and all resolved addresses checked.
        let target: Awaited<ReturnType<typeof assertSafeWebhookUrl>>;
        try {
          target = await assertSafeWebhookUrl(webhook.url);
        } catch (ssrfErr: any) {
          const reason = String(ssrfErr?.message ?? ssrfErr);
          const transient = ssrfErr instanceof HostResolutionError;
          if (!transient) {
            let host = 'unparseable';
            try { host = new URL(webhook.url).hostname; } catch { /* keep placeholder */ }
            logger.error('KLAROS_WEBHOOK_SSRF_BLOCKED', { webhookId: webhook.id, host, error: reason });
          }
          for (const step of mine.slice(start)) {
            await this.recordDelivery(webhook.id, tenantId, step.type, step.eventId, step.data, null, reason, false);
          }
          // Transient (DNS outage): let the bus retry. Permanent misconfiguration: never retried.
          if (transient) firstError = firstError ?? ssrfErr;
          continue;
        }

        for (let i = start; i < mine.length; i++) {
          const failure = await this.deliverStep(webhook, tenantId, mine[i], target);
          if (!failure) continue;
          firstError = firstError ?? failure;
          if (!options.finalAttempt) break; // keep order: do not send later steps past a failed one
        }
      } catch (err: any) {
        firstError = firstError ?? (err instanceof Error ? err : new Error(String(err)));
      }
    }

    if (firstError) throw firstError;
  }

  /** Delivers one step to one webhook and records the outcome. Returns the failure, or null on success. */
  private async deliverStep(
    webhook: { id: string; secret: string | null },
    tenantId: string,
    step: KlarosSequenceStep,
    target: Awaited<ReturnType<typeof assertSafeWebhookUrl>>
  ): Promise<Error | null> {
    try {
      const body = JSON.stringify({
        id: step.eventId,
        type: step.type,
        timestamp: new Date().toISOString(),
        tenant_id: tenantId,
        data: step.data,
      });
      const timestamp = String(Math.floor(Date.now() / 1000));
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-HallaAI-Timestamp': timestamp,
      };
      if (webhook.secret) {
        headers['X-HallaAI-Signature'] = `sha256=${signWebhookPayload(webhook.secret, timestamp, body)}`;
      }

      // Connects only to the addresses validated by the caller and never follows
      // redirects — a 3xx is recorded as a failed delivery, not chased.
      const response = await safePostJson(target.url, target.addresses, { headers, body, timeoutMs: 10_000 });
      const ok = response.status >= 200 && response.status < 300;
      await this.recordDelivery(webhook.id, tenantId, step.type, step.eventId, step.data, response.status, response.body, ok);
      return ok ? null : new Error(`Webhook ${webhook.id} responded ${response.status}`);
    } catch (err: any) {
      const message = err instanceof Error ? err.message : String(err);
      await this.recordDelivery(webhook.id, tenantId, step.type, step.eventId, step.data, null, message, false).catch(() => {});
      return err instanceof Error ? err : new Error(message);
    }
  }

  private async recordDelivery(
    webhookId: string,
    tenantId: string,
    eventType: string,
    eventId: string,
    payload: Record<string, unknown>,
    responseStatus: number | null,
    responseBody: string | null,
    delivered: boolean
  ): Promise<void> {
    await pool.query(
      `INSERT INTO public.webhook_deliveries
         (webhook_id, tenant_id, event_type, event_id, payload, response_status, response_body, delivered)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
       ON CONFLICT (webhook_id, event_id) WHERE event_id IS NOT NULL DO UPDATE
       SET response_status = excluded.response_status,
           response_body = excluded.response_body,
           delivered = excluded.delivered,
           attempted_at = NOW()`,
      [webhookId, tenantId, eventType, eventId, JSON.stringify(payload), responseStatus, responseBody, delivered]
    );

    if (delivered) {
      await pool.query(
        `UPDATE public.custom_webhooks SET last_triggered_at = NOW(), last_error = NULL, failure_count = 0 WHERE id = $1`,
        [webhookId]
      );
    } else {
      await pool.query(
        `UPDATE public.custom_webhooks SET last_error = $1, failure_count = failure_count + 1 WHERE id = $2`,
        [responseBody ?? 'delivery failed', webhookId]
      );
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

  private mapRow(row: any, includeSecret = false): CustomWebhook {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      url: row.url,
      events: row.events,
      ...(includeSecret ? { secret: row.secret } : {}),
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

