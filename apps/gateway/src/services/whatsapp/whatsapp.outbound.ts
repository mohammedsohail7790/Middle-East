/**
 * Everything the platform sends on WhatsApp goes through here, so the rules live in one place:
 *  - free-form text only inside the customer's 24h window, otherwise an approved template;
 *  - nothing proactive to someone who opted out, or to a number that never wrote to us unless the tenant attested opt-in;
 *  - consent-capture (Medical Tourism) tenants are never contacted by the WhatsApp automation at all;
 *  - every attempt is stored, success or failure.
 */

import { logger } from '../logger.js';
import { voiceDb } from '../voice/tenant-scope.js';
import { getTenantTimezone } from '../appointments/tenant-timezone.js';
import { channelsService } from '../channels/channels.service.js';
import { whatsappStore, type Conversation } from './whatsapp.store.js';
import {
  SERVICE_WINDOW_MS, WhatsAppApiError, normalizePhone, sendButtons, sendTemplate, sendText,
} from './whatsapp.client.js';

export const TEMPLATE_CONFIRMATION = process.env.WHATSAPP_TEMPLATE_CONFIRM?.trim() || 'appointment_confirmation';
export const TEMPLATE_REMINDER = process.env.WHATSAPP_TEMPLATE_REMINDER?.trim() || 'appointment_reminder';

export type OutboundSender = 'ai' | 'staff' | 'system';
export interface OutboundResult { ok: boolean; reason?: string; usedTemplate?: boolean }

export function isWindowOpen(conv: Pick<Conversation, 'lastInboundAt'>, now = Date.now()): boolean {
  return !!conv.lastInboundAt && now - new Date(conv.lastInboundAt).getTime() < SERVICE_WINDOW_MS;
}

export function languageCodeFor(lang: string | null | undefined): 'ar' | 'en' {
  return (lang ?? '').toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

/** Medical Tourism tenants (consent capture) handle health information on their own consent track: WhatsApp automation stays out. */
export async function isConsentCaptureTenant(tenantId: string): Promise<boolean> {
  try {
    const r = await voiceDb.query(`SELECT metadata->'consent_capture' AS cc FROM public.voice_tenants WHERE id = $1`, [tenantId]);
    return !!r.rows[0]?.cc;
  } catch {
    return true; // can't tell => stay out
  }
}

async function loadSender(tenantId: string): Promise<{ phoneNumberId: string; token: string } | null> {
  const num = await whatsappStore.getNumber(tenantId);
  if (!num || num.status === 'disabled') return null;
  const token = await whatsappStore.getAccessToken(tenantId);
  return token ? { phoneNumberId: num.phoneNumberId, token } : null;
}

async function failed(tenantId: string, conv: Conversation, sender: OutboundSender, body: string, err: unknown, templateName?: string): Promise<OutboundResult> {
  const message = err instanceof Error ? err.message : String(err);
  logger.warn('WHATSAPP_SEND_FAILED', { tenantId, conversationId: conv.id, code: err instanceof WhatsAppApiError ? err.code : undefined, error: message.slice(0, 200) });
  if (err instanceof WhatsAppApiError && (err.code === 190 || err.status === 401)) await whatsappStore.recordNumberError(tenantId, message).catch(() => {});
  await whatsappStore.insertOutbound(tenantId, conv.id, { sender, body, status: 'failed', error: message.slice(0, 300), templateName }).catch(() => {});
  return { ok: false, reason: message };
}

/** A reply inside an ongoing conversation (AI or staff). Fails closed outside the 24h window. */
export async function sendReply(
  tenantId: string,
  conv: Conversation,
  text: string,
  sender: OutboundSender,
  buttons?: { id: string; title: string }[]
): Promise<OutboundResult> {
  if (!isWindowOpen(conv)) return { ok: false, reason: 'window_closed' };
  const s = await loadSender(tenantId);
  if (!s) return { ok: false, reason: 'not_connected' };
  try {
    const r = buttons?.length ? await sendButtons(s.phoneNumberId, s.token, conv.customerPhone, text, buttons) : await sendText(s.phoneNumberId, s.token, conv.customerPhone, text);
    await whatsappStore.insertOutbound(tenantId, conv.id, { sender, body: text, waMessageId: r.waMessageId, type: buttons?.length ? 'interactive' : 'text' });
    await whatsappStore.touchOutbound(conv.id);
    return { ok: true };
  } catch (err) {
    return failed(tenantId, conv, sender, text, err);
  }
}

async function tenantAttestedOptIn(tenantId: string): Promise<boolean> {
  try {
    const c = await channelsService.getConnection(tenantId, 'whatsapp');
    return c?.config?.notifyCallers === true;
  } catch {
    return false;
  }
}

/**
 * Business-initiated message about an appointment. Inside the window it is plain text with buttons; outside it is the approved
 * template. A number that never wrote to us is only contacted when the tenant switched on "notify callers" (their attestation that
 * those customers agreed to WhatsApp updates).
 */
async function sendAppointmentMessage(opts: {
  tenantId: string;
  phone: string;
  name?: string;
  kind: 'confirmation' | 'reminder';
  appointmentId: string;
  businessName: string;
  when: Date;
  service?: string;
}): Promise<OutboundResult> {
  const { tenantId } = opts;
  const phone = normalizePhone(opts.phone);
  if (!phone) return { ok: false, reason: 'bad_phone' };
  if (await isConsentCaptureTenant(tenantId)) return { ok: false, reason: 'restricted_tenant' };
  const s = await loadSender(tenantId);
  if (!s) return { ok: false, reason: 'not_connected' };

  const existing = await whatsappStore.findConversationByPhone(tenantId, phone);
  if (existing?.optedOut) return { ok: false, reason: 'opted_out' };
  if (!existing && !(await tenantAttestedOptIn(tenantId))) return { ok: false, reason: 'no_opt_in' };

  const conv = existing ?? (await whatsappStore.upsertConversation(tenantId, phone, opts.name));
  const tz = await getTenantTimezone(tenantId).catch(() => 'UTC');
  const lang = languageCodeFor(conv.language);
  const locale = lang === 'ar' ? 'ar-AE' : 'en-GB';
  const date = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz }).format(opts.when);
  const time = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: tz }).format(opts.when);
  const who = opts.name?.trim() || (lang === 'ar' ? 'عميلنا الكريم' : 'there');

  const text =
    lang === 'ar'
      ? opts.kind === 'confirmation'
        ? `مرحباً ${who}، تم تأكيد موعدك في ${opts.businessName} يوم ${date} الساعة ${time}.`
        : `مرحباً ${who}، تذكير بموعدك في ${opts.businessName} غداً ${date} الساعة ${time}. هل ما زال مناسباً؟`
      : opts.kind === 'confirmation'
        ? `Hi ${who}, your appointment at ${opts.businessName} is confirmed for ${date} at ${time}.`
        : `Hi ${who}, a reminder of your appointment at ${opts.businessName} on ${date} at ${time}. Does it still work for you?`;

  const buttons =
    opts.kind === 'reminder'
      ? lang === 'ar'
        ? [{ id: `confirm:${opts.appointmentId}`, title: 'تأكيد' }, { id: `reschedule:${opts.appointmentId}`, title: 'تغيير الموعد' }, { id: `cancel:${opts.appointmentId}`, title: 'إلغاء' }]
        : [{ id: `confirm:${opts.appointmentId}`, title: 'Confirm' }, { id: `reschedule:${opts.appointmentId}`, title: 'Reschedule' }, { id: `cancel:${opts.appointmentId}`, title: 'Cancel' }]
      : undefined;

  if (isWindowOpen(conv)) {
    const r = await sendReply(tenantId, conv, text, 'system', buttons);
    return { ...r, usedTemplate: false };
  }

  const template = opts.kind === 'confirmation' ? TEMPLATE_CONFIRMATION : TEMPLATE_REMINDER;
  try {
    const r = await sendTemplate(
      s.phoneNumberId, s.token, phone, template, lang, [who, opts.businessName, date, time],
      opts.kind === 'reminder' ? [`confirm:${opts.appointmentId}`, `reschedule:${opts.appointmentId}`, `cancel:${opts.appointmentId}`] : []
    );
    await whatsappStore.insertOutbound(tenantId, conv.id, { sender: 'system', body: text, waMessageId: r.waMessageId, templateName: template });
    await whatsappStore.touchOutbound(conv.id);
    return { ok: true, usedTemplate: true };
  } catch (err) {
    return failed(tenantId, conv, 'system', text, err, template);
  }
}

async function loadAppointment(tenantId: string, appointmentId: string) {
  const r = await voiceDb.query(
    `SELECT a.id, a.name, a.phone, a.service, a.scheduled_time, a.status, vt.company_name
     FROM public.appointments a JOIN public.voice_tenants vt ON vt.id = a.tenant_id
     WHERE a.id = $1 AND a.tenant_id = $2`,
    [appointmentId, tenantId]
  );
  return r.rows[0] as { id: string; name?: string; phone: string; service?: string; scheduled_time: string | Date; status: string; company_name: string } | undefined;
}

/** Fire-and-forget hook for a fresh booking (any channel). Sends once per appointment. */
export async function notifyAppointmentConfirmed(tenantId: string, appointmentId: string): Promise<OutboundResult> {
  const a = await loadAppointment(tenantId, appointmentId);
  if (!a || a.status !== 'booked' || !a.phone) return { ok: false, reason: 'not_found' };
  const claim = await voiceDb.query(
    `UPDATE public.appointments SET wa_confirmation_sent = TRUE WHERE id = $1 AND tenant_id = $2 AND COALESCE(wa_confirmation_sent, FALSE) = FALSE RETURNING id`,
    [appointmentId, tenantId]
  );
  if (!claim.rowCount) return { ok: false, reason: 'already_sent' };
  const r = await sendAppointmentMessage({ tenantId, phone: a.phone, name: a.name, kind: 'confirmation', appointmentId, businessName: a.company_name, when: new Date(a.scheduled_time), service: a.service });
  // Not sent for a reason that could change (no number yet, opt-in not granted): release the claim so a later attempt can retry.
  if (!r.ok && ['not_connected', 'no_opt_in'].includes(r.reason ?? '')) {
    await voiceDb.query(`UPDATE public.appointments SET wa_confirmation_sent = FALSE WHERE id = $1 AND tenant_id = $2`, [appointmentId, tenantId]).catch(() => {});
  }
  return r;
}

/** Sends the day-before reminder for appointments in the next ~24h window that haven't had one on WhatsApp. Called by the scheduler. */
export async function sendDueWhatsAppReminders(now = new Date()): Promise<number> {
  const from = new Date(now.getTime() + 23 * 60 * 60 * 1000);
  const to = new Date(now.getTime() + 25 * 60 * 60 * 1000);
  const due = await voiceDb.query(
    `SELECT a.id, a.tenant_id FROM public.appointments a
     JOIN public.whatsapp_numbers w ON w.tenant_id = a.tenant_id AND w.status = 'connected'
     WHERE a.status = 'booked' AND a.scheduled_time BETWEEN $1 AND $2 AND COALESCE(a.wa_reminder_24h_sent, FALSE) = FALSE
     LIMIT 200`,
    [from, to]
  );
  let sent = 0;
  for (const row of due.rows) {
    const claim = await voiceDb.query(
      `UPDATE public.appointments SET wa_reminder_24h_sent = TRUE WHERE id = $1 AND COALESCE(wa_reminder_24h_sent, FALSE) = FALSE RETURNING id`,
      [row.id]
    );
    if (!claim.rowCount) continue; // another instance took it
    const a = await loadAppointment(row.tenant_id, row.id);
    if (!a) continue;
    const r = await sendAppointmentMessage({ tenantId: row.tenant_id, phone: a.phone, name: a.name, kind: 'reminder', appointmentId: a.id, businessName: a.company_name, when: new Date(a.scheduled_time), service: a.service });
    if (r.ok) sent += 1;
  }
  return sent;
}
