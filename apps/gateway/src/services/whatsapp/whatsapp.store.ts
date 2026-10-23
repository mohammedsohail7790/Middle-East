/**
 * WhatsApp persistence: the tenant's number, conversations, and messages. Every query is scoped by tenant_id.
 */

import { voiceDb } from '../voice/tenant-scope.js';
import { encryptCredentials, decryptCredentials } from '../integrations/credential-encryption.js';
import type { StatusUpdate } from './whatsapp.client.js';

export interface WhatsAppNumber {
  id: string;
  tenantId: string;
  phoneNumberId: string;
  wabaId: string | null;
  displayPhone: string | null;
  status: 'connected' | 'disabled' | 'error';
  aiEnabled: boolean;
  lastError: string | null;
}

export interface Conversation {
  id: string;
  tenantId: string;
  customerPhone: string;
  customerName: string | null;
  mode: 'ai' | 'human';
  language: string | null;
  optedOut: boolean;
  needsAttention: boolean;
  lastInboundAt: Date | null;
  lastMessageAt: Date;
}

export interface StoredMessage {
  id: string;
  direction: 'inbound' | 'outbound';
  sender: 'customer' | 'ai' | 'staff' | 'system';
  msgType: string;
  body: string | null;
  templateName: string | null;
  status: string;
  error: string | null;
  createdAt: Date;
}

const NUMBER_COLS = 'id, tenant_id, phone_number_id, waba_id, display_phone, status, ai_enabled, last_error';
const CONV_COLS =
  'id, tenant_id, customer_phone, customer_name, mode, language, opted_out, needs_attention, last_inbound_at, last_message_at';

function mapNumber(r: any): WhatsAppNumber {
  return {
    id: r.id, tenantId: r.tenant_id, phoneNumberId: r.phone_number_id, wabaId: r.waba_id, displayPhone: r.display_phone,
    status: r.status, aiEnabled: r.ai_enabled, lastError: r.last_error,
  };
}
function mapConv(r: any): Conversation {
  return {
    id: r.id, tenantId: r.tenant_id, customerPhone: r.customer_phone, customerName: r.customer_name, mode: r.mode,
    language: r.language, optedOut: r.opted_out, needsAttention: r.needs_attention, lastInboundAt: r.last_inbound_at,
    lastMessageAt: r.last_message_at,
  };
}

export class WhatsAppStore {
  // ── numbers ────────────────────────────────────────────────────────────────
  async findNumberByPhoneNumberId(phoneNumberId: string): Promise<WhatsAppNumber | null> {
    const r = await voiceDb.query(`SELECT ${NUMBER_COLS} FROM public.whatsapp_numbers WHERE phone_number_id = $1`, [phoneNumberId]);
    return r.rows[0] ? mapNumber(r.rows[0]) : null;
  }

  async getNumber(tenantId: string): Promise<WhatsAppNumber | null> {
    const r = await voiceDb.query(`SELECT ${NUMBER_COLS} FROM public.whatsapp_numbers WHERE tenant_id = $1`, [tenantId]);
    return r.rows[0] ? mapNumber(r.rows[0]) : null;
  }

  /** The token for a number: the tenant's own (encrypted) one, else the platform-wide WHATSAPP_ACCESS_TOKEN. Never returned to clients. */
  async getAccessToken(tenantId: string): Promise<string | null> {
    const r = await voiceDb.query(`SELECT access_token_enc FROM public.whatsapp_numbers WHERE tenant_id = $1`, [tenantId]);
    const enc = r.rows[0]?.access_token_enc as string | null | undefined;
    if (enc) {
      try {
        return decryptCredentials<{ token: string }>(enc).token;
      } catch {
        return null;
      }
    }
    return process.env.WHATSAPP_ACCESS_TOKEN?.trim() || null;
  }

  async connectNumber(
    tenantId: string,
    input: { phoneNumberId: string; wabaId?: string; displayPhone?: string; accessToken?: string; aiEnabled?: boolean }
  ): Promise<WhatsAppNumber> {
    const enc = input.accessToken ? encryptCredentials({ token: input.accessToken }) : null;
    const r = await voiceDb.query(
      `INSERT INTO public.whatsapp_numbers (tenant_id, phone_number_id, waba_id, display_phone, access_token_enc, ai_enabled, status)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, TRUE), 'connected')
       ON CONFLICT (tenant_id) DO UPDATE SET
         phone_number_id = EXCLUDED.phone_number_id,
         waba_id = COALESCE(EXCLUDED.waba_id, public.whatsapp_numbers.waba_id),
         display_phone = COALESCE(EXCLUDED.display_phone, public.whatsapp_numbers.display_phone),
         access_token_enc = COALESCE(EXCLUDED.access_token_enc, public.whatsapp_numbers.access_token_enc),
         ai_enabled = COALESCE($6, public.whatsapp_numbers.ai_enabled),
         status = 'connected', last_error = NULL, updated_at = NOW()
       RETURNING ${NUMBER_COLS}`,
      [tenantId, input.phoneNumberId, input.wabaId ?? null, input.displayPhone ?? null, enc, input.aiEnabled ?? null]
    );
    return mapNumber(r.rows[0]);
  }

  async setAiEnabled(tenantId: string, aiEnabled: boolean): Promise<void> {
    await voiceDb.query(`UPDATE public.whatsapp_numbers SET ai_enabled = $2, updated_at = NOW() WHERE tenant_id = $1`, [tenantId, aiEnabled]);
  }

  async recordNumberError(tenantId: string, message: string): Promise<void> {
    await voiceDb.query(
      `UPDATE public.whatsapp_numbers SET status = 'error', last_error = $2, updated_at = NOW() WHERE tenant_id = $1`,
      [tenantId, message.slice(0, 300)]
    );
  }

  async disconnect(tenantId: string): Promise<boolean> {
    const r = await voiceDb.query(`DELETE FROM public.whatsapp_numbers WHERE tenant_id = $1`, [tenantId]);
    return (r.rowCount ?? 0) > 0;
  }

  // ── conversations ──────────────────────────────────────────────────────────
  async upsertConversation(tenantId: string, customerPhone: string, name?: string): Promise<Conversation> {
    const r = await voiceDb.query(
      `INSERT INTO public.whatsapp_conversations (tenant_id, customer_phone, customer_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, customer_phone) DO UPDATE SET
         customer_name = COALESCE(public.whatsapp_conversations.customer_name, EXCLUDED.customer_name)
       RETURNING ${CONV_COLS}`,
      [tenantId, customerPhone, name ?? null]
    );
    return mapConv(r.rows[0]);
  }

  async getConversation(tenantId: string, id: string): Promise<Conversation | null> {
    const r = await voiceDb.query(`SELECT ${CONV_COLS} FROM public.whatsapp_conversations WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
    return r.rows[0] ? mapConv(r.rows[0]) : null;
  }

  async findConversationByPhone(tenantId: string, customerPhone: string): Promise<Conversation | null> {
    const r = await voiceDb.query(
      `SELECT ${CONV_COLS} FROM public.whatsapp_conversations WHERE tenant_id = $1 AND customer_phone = $2`,
      [tenantId, customerPhone]
    );
    return r.rows[0] ? mapConv(r.rows[0]) : null;
  }

  async listConversations(tenantId: string, limit = 50): Promise<(Conversation & { preview: string | null })[]> {
    const r = await voiceDb.query(
      `SELECT c.${CONV_COLS.split(', ').join(', c.')},
              (SELECT body FROM public.whatsapp_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS preview
       FROM public.whatsapp_conversations c
       WHERE c.tenant_id = $1
       ORDER BY c.needs_attention DESC, c.last_message_at DESC
       LIMIT $2`,
      [tenantId, Math.min(Math.max(limit, 1), 200)]
    );
    return r.rows.map((row: any) => ({ ...mapConv(row), preview: row.preview ?? null }));
  }

  async touchInbound(conversationId: string, at: Date): Promise<void> {
    await voiceDb.query(
      `UPDATE public.whatsapp_conversations SET last_inbound_at = GREATEST(COALESCE(last_inbound_at, $2), $2), last_message_at = NOW() WHERE id = $1`,
      [conversationId, at]
    );
  }

  async touchOutbound(conversationId: string): Promise<void> {
    await voiceDb.query(`UPDATE public.whatsapp_conversations SET last_message_at = NOW() WHERE id = $1`, [conversationId]);
  }

  async setMode(tenantId: string, id: string, mode: 'ai' | 'human'): Promise<void> {
    await voiceDb.query(
      `UPDATE public.whatsapp_conversations SET mode = $3, needs_attention = CASE WHEN $3 = 'ai' THEN FALSE ELSE needs_attention END
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id, mode]
    );
  }

  async flagAttention(conversationId: string, flag = true): Promise<void> {
    await voiceDb.query(`UPDATE public.whatsapp_conversations SET needs_attention = $2 WHERE id = $1`, [conversationId, flag]);
  }

  async setOptedOut(conversationId: string, optedOut: boolean): Promise<void> {
    await voiceDb.query(`UPDATE public.whatsapp_conversations SET opted_out = $2 WHERE id = $1`, [conversationId, optedOut]);
  }

  async setLanguage(conversationId: string, language: string): Promise<void> {
    await voiceDb.query(`UPDATE public.whatsapp_conversations SET language = $2 WHERE id = $1`, [conversationId, language]);
  }

  // ── messages ───────────────────────────────────────────────────────────────
  /** Returns false when this wa_message_id was already stored (a webhook retry). */
  async insertInbound(tenantId: string, conversationId: string, m: { waMessageId: string; type: string; body?: string }): Promise<boolean> {
    const r = await voiceDb.query(
      `INSERT INTO public.whatsapp_messages (tenant_id, conversation_id, direction, sender, wa_message_id, msg_type, body, status)
       VALUES ($1, $2, 'inbound', 'customer', $3, $4, $5, 'received')
       ON CONFLICT (wa_message_id) WHERE wa_message_id IS NOT NULL DO NOTHING
       RETURNING id`,
      [tenantId, conversationId, m.waMessageId, m.type, m.body ?? null]
    );
    return (r.rowCount ?? 0) > 0;
  }

  async insertOutbound(
    tenantId: string,
    conversationId: string,
    m: { sender: 'ai' | 'staff' | 'system'; type?: string; body: string; waMessageId?: string; templateName?: string; status?: 'sent' | 'failed'; error?: string }
  ): Promise<void> {
    await voiceDb.query(
      `INSERT INTO public.whatsapp_messages (tenant_id, conversation_id, direction, sender, wa_message_id, msg_type, body, template_name, status, error)
       VALUES ($1, $2, 'outbound', $3, $4, $5, $6, $7, $8, $9)`,
      [tenantId, conversationId, m.sender, m.waMessageId || null, m.type ?? (m.templateName ? 'template' : 'text'), m.body, m.templateName ?? null, m.status ?? 'sent', m.error ?? null]
    );
  }

  async applyStatus(s: StatusUpdate): Promise<void> {
    // Statuses only move forward: a late 'sent' must not overwrite 'read'.
    await voiceDb.query(
      `UPDATE public.whatsapp_messages SET status = $2, error = COALESCE($3, error)
       WHERE wa_message_id = $1
         AND array_position(ARRAY['queued','sent','delivered','read'], status) < array_position(ARRAY['queued','sent','delivered','read'], $2)
         OR (wa_message_id = $1 AND $2 = 'failed')`,
      [s.waMessageId, s.status, s.error ?? null]
    );
  }

  /** Oldest-first, for building the model's context and for the inbox view. */
  async recentMessages(tenantId: string, conversationId: string, limit = 30): Promise<StoredMessage[]> {
    const r = await voiceDb.query(
      `SELECT * FROM (
         SELECT id, direction, sender, msg_type, body, template_name, status, error, created_at
         FROM public.whatsapp_messages WHERE tenant_id = $1 AND conversation_id = $2
         ORDER BY created_at DESC LIMIT $3
       ) t ORDER BY created_at ASC`,
      [tenantId, conversationId, Math.min(Math.max(limit, 1), 200)]
    );
    return r.rows.map((x: any) => ({
      id: x.id, direction: x.direction, sender: x.sender, msgType: x.msg_type, body: x.body,
      templateName: x.template_name, status: x.status, error: x.error, createdAt: x.created_at,
    }));
  }
}

export const whatsappStore = new WhatsAppStore();
