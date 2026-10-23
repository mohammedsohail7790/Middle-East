/**
 * WhatsApp Cloud API (Meta) client + pure helpers: webhook signature check, payload parsing, phone normalisation.
 * Nothing here touches the database.
 */

import crypto from 'node:crypto';
import { logger } from '../logger.js';

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION?.trim() || 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

/** Free-form replies are allowed for 24h after the customer's last message; after that only approved templates. */
export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface InboundMessage {
  waMessageId: string;
  from: string;            // E.164 with leading +
  name?: string;
  type: string;
  text?: string;           // text body, or the title/id of a tapped button
  buttonId?: string;
  mediaId?: string;        // audio / image / document
  timestamp: Date;
}

export interface StatusUpdate {
  waMessageId: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  error?: string;
}

export interface ParsedWebhook {
  phoneNumberId: string;
  messages: InboundMessage[];
  statuses: StatusUpdate[];
}

/** "9715XXXXXXX" / "+971 5X XXX XXXX" -> "+9715XXXXXXXX". Returns null when it can't be a phone number. */
export function normalizePhone(raw: unknown): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}

/** Meta wants digits only, no '+'. */
export function toWaId(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function appSecret(): string | null {
  return process.env.WHATSAPP_APP_SECRET?.trim() || process.env.META_APP_SECRET?.trim() || null;
}

/** Constant-time check of Meta's X-Hub-Signature-256 header over the RAW request body. */
export function verifySignature(rawBody: Buffer | string, header: string | undefined, secret = appSecret()): boolean {
  if (!secret || !header || !header.startsWith('sha256=')) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const given = header.slice('sha256='.length);
  if (given.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(given, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

/** Pulls every message and delivery status out of a webhook body, grouped by receiving phone_number_id. */
export function parseWebhook(body: any): ParsedWebhook[] {
  const out: ParsedWebhook[] = [];
  if (body?.object !== 'whatsapp_business_account' || !Array.isArray(body.entry)) return out;

  for (const entry of body.entry) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value;
      const phoneNumberId = value?.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      const names = new Map<string, string>();
      for (const c of value.contacts ?? []) if (c?.wa_id && c?.profile?.name) names.set(String(c.wa_id), String(c.profile.name));

      const messages: InboundMessage[] = [];
      for (const m of value.messages ?? []) {
        const from = normalizePhone(m?.from);
        if (!from || !m?.id) continue;
        const type = String(m.type || 'unknown');
        const msg: InboundMessage = {
          waMessageId: String(m.id),
          from,
          name: names.get(String(m.from)),
          type,
          timestamp: new Date((Number(m.timestamp) || Date.now() / 1000) * 1000),
        };
        if (type === 'text') msg.text = String(m.text?.body ?? '');
        else if (type === 'interactive') {
          const r = m.interactive?.button_reply ?? m.interactive?.list_reply;
          msg.text = r?.title ? String(r.title) : undefined;
          msg.buttonId = r?.id ? String(r.id) : undefined;
        } else if (type === 'button') {
          msg.text = m.button?.text ? String(m.button.text) : undefined;
          msg.buttonId = m.button?.payload ? String(m.button.payload) : undefined;
        } else if (type === 'audio' || type === 'image' || type === 'document' || type === 'video') {
          msg.mediaId = m[type]?.id ? String(m[type].id) : undefined;
          if (m[type]?.caption) msg.text = String(m[type].caption);
        }
        messages.push(msg);
      }

      const statuses: StatusUpdate[] = [];
      for (const s of value.statuses ?? []) {
        if (!s?.id || !['sent', 'delivered', 'read', 'failed'].includes(s.status)) continue;
        statuses.push({
          waMessageId: String(s.id),
          status: s.status,
          error: s.errors?.[0] ? `${s.errors[0].code ?? ''} ${s.errors[0].title ?? ''}`.trim() : undefined,
        });
      }

      if (messages.length || statuses.length) out.push({ phoneNumberId: String(phoneNumberId), messages, statuses });
    }
  }
  return out;
}

/** STOP-style keywords in English and Arabic. Exact match on the whole (trimmed) message only. */
const OPT_OUT = new Set(['stop', 'unsubscribe', 'cancel subscription', 'إيقاف', 'ايقاف', 'توقف', 'إلغاء الاشتراك', 'الغاء الاشتراك']);
const OPT_IN = new Set(['start', 'subscribe', 'ابدأ', 'اشترك']);
export function optKeyword(text: string | undefined): 'out' | 'in' | null {
  const t = (text ?? '').trim().toLowerCase();
  if (OPT_OUT.has(t)) return 'out';
  if (OPT_IN.has(t)) return 'in';
  return null;
}

export class WhatsAppApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: number) {
    super(message);
  }
  /** 131047 = outside the 24h window, 131026 = undeliverable, 190 = token invalid */
  get isWindowClosed(): boolean {
    return this.code === 131047;
  }
}

async function graph(path: string, token: string, init: { method?: string; body?: unknown } = {}): Promise<any> {
  const res: any = await fetch(`${GRAPH_BASE}/${path}`, {
    method: init.method ?? 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(15_000),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new WhatsAppApiError(json?.error?.message || `Graph API ${res.status}`, res.status, json?.error?.code);
  }
  return json;
}

export interface SendResult { waMessageId: string }

export async function sendText(phoneNumberId: string, token: string, toPhone: string, body: string): Promise<SendResult> {
  const r = await graph(`${phoneNumberId}/messages`, token, {
    body: { messaging_product: 'whatsapp', to: toWaId(toPhone), type: 'text', text: { body: body.slice(0, 4096), preview_url: false } },
  });
  return { waMessageId: String(r?.messages?.[0]?.id ?? '') };
}

/** Up to 3 quick-reply buttons (WhatsApp limit); titles are cut to 20 characters. */
export async function sendButtons(
  phoneNumberId: string,
  token: string,
  toPhone: string,
  body: string,
  buttons: { id: string; title: string }[]
): Promise<SendResult> {
  const r = await graph(`${phoneNumberId}/messages`, token, {
    body: {
      messaging_product: 'whatsapp',
      to: toWaId(toPhone),
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: body.slice(0, 1024) },
        action: { buttons: buttons.slice(0, 3).map((b) => ({ type: 'reply', reply: { id: b.id.slice(0, 256), title: b.title.slice(0, 20) } })) },
      },
    },
  });
  return { waMessageId: String(r?.messages?.[0]?.id ?? '') };
}

/** Approved template. `params` fill the body placeholders {{1}}, {{2}} ... in order. */
export async function sendTemplate(
  phoneNumberId: string,
  token: string,
  toPhone: string,
  name: string,
  languageCode: string,
  params: string[] = [],
  quickReplyPayloads: string[] = []
): Promise<SendResult> {
  const components: any[] = [];
  if (params.length) components.push({ type: 'body', parameters: params.map((text) => ({ type: 'text', text: text.slice(0, 1024) })) });
  quickReplyPayloads.forEach((payload, index) =>
    components.push({ type: 'button', sub_type: 'quick_reply', index: String(index), parameters: [{ type: 'payload', payload }] })
  );
  const r = await graph(`${phoneNumberId}/messages`, token, {
    body: { messaging_product: 'whatsapp', to: toWaId(toPhone), type: 'template', template: { name, language: { code: languageCode }, components } },
  });
  return { waMessageId: String(r?.messages?.[0]?.id ?? '') };
}

/** Confirms the token can see this number; returns what Meta shows for it. Throws WhatsAppApiError otherwise. */
export async function fetchPhoneNumber(phoneNumberId: string, token: string): Promise<{ displayPhone: string; verifiedName?: string }> {
  const r = await graph(`${phoneNumberId}?fields=display_phone_number,verified_name`, token, { method: 'GET' });
  return { displayPhone: String(r?.display_phone_number ?? ''), verifiedName: r?.verified_name ? String(r.verified_name) : undefined };
}

export async function markRead(phoneNumberId: string, token: string, waMessageId: string): Promise<void> {
  try {
    await graph(`${phoneNumberId}/messages`, token, { body: { messaging_product: 'whatsapp', status: 'read', message_id: waMessageId } });
  } catch (err) {
    logger.debug?.('WHATSAPP_MARK_READ_FAILED', { error: String(err) });
  }
}

/** Downloads a media object (voice note, image) into memory. Capped at 16 MB (WhatsApp's own audio limit). */
export async function downloadMedia(mediaId: string, token: string): Promise<{ data: Buffer; mime: string }> {
  const meta = await graph(mediaId, token, { method: 'GET' });
  if (!meta?.url) throw new WhatsAppApiError('No media url', 404);
  const res: any = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new WhatsAppApiError(`Media download ${res.status}`, res.status);
  const data = Buffer.from(await res.arrayBuffer());
  if (data.length > 16 * 1024 * 1024) throw new WhatsAppApiError('Media too large', 413);
  return { data, mime: String(meta.mime_type || res.headers.get('content-type') || 'application/octet-stream') };
}

/** Voice notes are everywhere in the Gulf: transcribe them so the agent can answer them like text. */
export async function transcribeAudio(data: Buffer, mime: string): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;
  const ext = mime.includes('ogg') ? 'ogg' : mime.includes('mpeg') || mime.includes('mp3') ? 'mp3' : mime.includes('mp4') || mime.includes('m4a') ? 'm4a' : 'ogg';
  const form = new FormData();
  form.append('model', process.env.WHATSAPP_TRANSCRIBE_MODEL?.trim() || 'whisper-1');
  form.append('file', new Blob([new Uint8Array(data)], { type: mime }), `voice.${ext}`);
  const res: any = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) return null;
  const json: any = await res.json().catch(() => ({}));
  const text = typeof json?.text === 'string' ? json.text.trim() : '';
  return text || null;
}
