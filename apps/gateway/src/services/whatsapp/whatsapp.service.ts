/**
 * Inbound pipeline: webhook payload -> tenant -> conversation -> (opt-out | button | human | AI) -> reply.
 * Meta retries webhooks and delivers them out of order, so every step is idempotent and per-conversation serialised.
 */

import { logger } from '../logger.js';
import { voiceDb } from '../voice/tenant-scope.js';
import { publishDashboardPushType } from '../dashboard/dashboard-events.js';
import { appointmentService } from '../appointments/appointment.service.js';
import { whatsappStore, type Conversation, type WhatsAppNumber } from './whatsapp.store.js';
import {
  downloadMedia, markRead, optKeyword, transcribeAudio, type InboundMessage, type ParsedWebhook,
} from './whatsapp.client.js';
import { detectLanguage, runAgent } from './whatsapp.agent.js';
import { isConsentCaptureTenant, languageCodeFor, sendReply } from './whatsapp.outbound.js';

const T = {
  optOut: { en: "You won't receive any more messages from us. Reply START to turn them back on.", ar: 'لن تصلك رسائل أخرى منا. أرسل "ابدأ" لإعادة التفعيل.' },
  optIn: { en: "Welcome back, you'll get our messages again.", ar: 'أهلاً بعودتك، ستصلك رسائلنا من جديد.' },
  confirmed: { en: 'Thank you, your appointment is confirmed. See you then!', ar: 'شكراً لك، تم تأكيد موعدك. نراك قريباً!' },
  cancelled: { en: 'Your appointment has been cancelled. Message us any time to book again.', ar: 'تم إلغاء موعدك. راسلنا في أي وقت لحجز موعد جديد.' },
  cantCancel: { en: "I couldn't find that appointment. A team member will help you shortly.", ar: 'لم أجد هذا الموعد. سيساعدك أحد الفريق قريباً.' },
  media: { en: "I can't open images or files here yet. Could you type your request? A team member can also help.", ar: 'لا أستطيع فتح الصور أو الملفات حالياً. هل يمكنك كتابة طلبك؟ يمكن لأحد الفريق مساعدتك أيضاً.' },
  voiceFail: { en: "I couldn't hear that voice note clearly. Could you type it, or send it again?", ar: 'لم أتمكن من سماع الرسالة الصوتية بوضوح. هل يمكنك كتابتها أو إعادة إرسالها؟' },
  reschedule: { en: 'I would like to reschedule my appointment.', ar: 'أرغب في تغيير موعدي.' },
} as const;

const locks = new Map<string, Promise<unknown>>();
/** Run `fn` after every earlier task for the same key finishes. */
function serialise<R>(key: string, fn: () => Promise<R>): Promise<R> {
  const prev = locks.get(key) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  locks.set(key, next);
  void next.finally(() => { if (locks.get(key) === next) locks.delete(key); }).catch(() => {});
  return next;
}

function push(tenantId: string, conversationId: string): void {
  try {
    publishDashboardPushType(tenantId, 'whatsapp.message', [], { conversationId });
  } catch {
    /* never blocks the pipeline */
  }
}

const lang = (conv: Conversation): 'ar' | 'en' => languageCodeFor(conv.language);

async function handleButton(tenantId: string, conv: Conversation, buttonId: string): Promise<'handled' | 'to_agent'> {
  const [action, appointmentId] = buttonId.split(':');
  const l = lang(conv);
  if (!appointmentId) return 'to_agent';
  if (action === 'reschedule') return 'to_agent';
  if (action !== 'confirm' && action !== 'cancel') return 'to_agent';

  // Ownership: the appointment must belong to the number that tapped the button.
  const own = await voiceDb.query(
    `SELECT id FROM public.appointments
     WHERE id = $1 AND tenant_id = $2 AND status = 'booked' AND regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') = $3`,
    [appointmentId, tenantId, conv.customerPhone.replace(/\D/g, '')]
  ).catch(() => ({ rows: [] as any[] }));
  if (!own.rows.length) {
    await whatsappStore.flagAttention(conv.id);
    await sendReply(tenantId, conv, T.cantCancel[l], 'ai');
    return 'handled';
  }
  if (action === 'confirm') {
    await sendReply(tenantId, conv, T.confirmed[l], 'ai');
  } else {
    const r = await appointmentService.cancelAppointment(tenantId, appointmentId, 'Cancelled by customer on WhatsApp');
    await sendReply(tenantId, conv, r.success ? T.cancelled[l] : T.cantCancel[l], 'ai');
    if (!r.success) await whatsappStore.flagAttention(conv.id);
  }
  return 'handled';
}

async function resolveText(num: WhatsAppNumber, m: InboundMessage): Promise<{ text: string; failedVoice?: boolean; unsupported?: boolean }> {
  if (m.type === 'text' || m.type === 'interactive' || m.type === 'button') return { text: m.text ?? '' };
  if (m.type === 'audio' && m.mediaId) {
    try {
      const token = await whatsappStore.getAccessToken(num.tenantId);
      if (token) {
        const { data, mime } = await downloadMedia(m.mediaId, token);
        const text = await transcribeAudio(data, mime);
        if (text) return { text };
      }
    } catch (err) {
      logger.warn('WHATSAPP_VOICE_NOTE_FAILED', { tenantId: num.tenantId, error: String(err).slice(0, 160) });
    }
    return { text: '', failedVoice: true };
  }
  return { text: m.text ?? '', unsupported: true };
}

async function processMessage(num: WhatsAppNumber, m: InboundMessage): Promise<void> {
  const tenantId = num.tenantId;
  let conv = await whatsappStore.upsertConversation(tenantId, m.from, m.name);

  const resolved = await resolveText(num, m);
  const stored = resolved.text || (resolved.failedVoice ? '[voice message]' : `[${m.type}]`);
  const isNew = await whatsappStore.insertInbound(tenantId, conv.id, { waMessageId: m.waMessageId, type: m.type, body: stored });
  if (!isNew) return; // webhook retry
  await whatsappStore.touchInbound(conv.id, m.timestamp);
  conv = (await whatsappStore.getConversation(tenantId, conv.id)) ?? conv; // fresh window timestamp for the reply gate

  const detected = detectLanguage(resolved.text);
  if (detected && detected !== conv.language) {
    await whatsappStore.setLanguage(conv.id, detected);
    conv = { ...conv, language: detected };
  }
  push(tenantId, conv.id);
  const token = await whatsappStore.getAccessToken(tenantId);
  if (token) void markRead(num.phoneNumberId, token, m.waMessageId);
  const l = lang(conv);

  // STOP / START
  const kw = optKeyword(resolved.text);
  if (kw === 'out') {
    await whatsappStore.setOptedOut(conv.id, true);
    await sendReply(tenantId, conv, T.optOut[l], 'system');
    return;
  }
  if (kw === 'in') {
    await whatsappStore.setOptedOut(conv.id, false);
    await sendReply(tenantId, conv, T.optIn[l], 'system');
    return;
  }

  // Human is driving, AI is off for this number, or the tenant is on the consent-capture track: store only, staff replies.
  if (conv.mode === 'human' || !num.aiEnabled || (await isConsentCaptureTenant(tenantId))) {
    await whatsappStore.flagAttention(conv.id);
    push(tenantId, conv.id);
    return;
  }

  if (resolved.failedVoice) {
    await sendReply(tenantId, conv, T.voiceFail[l], 'ai');
    return;
  }
  if (resolved.unsupported) {
    await whatsappStore.flagAttention(conv.id);
    await sendReply(tenantId, conv, T.media[l], 'ai');
    return;
  }

  let customerText = resolved.text;
  if (m.buttonId) {
    const outcome = await handleButton(tenantId, conv, m.buttonId);
    if (outcome === 'handled') { push(tenantId, conv.id); return; }
    if (m.buttonId.startsWith('reschedule:')) customerText = T.reschedule[l];
  }
  if (!customerText.trim()) return;

  const history = await whatsappStore.recentMessages(tenantId, conv.id, 30);
  const result = await runAgent({ tenantId, conv, history, customerText });
  const sent = await sendReply(tenantId, conv, result.reply, 'ai');
  if (!sent.ok) {
    logger.warn('WHATSAPP_REPLY_NOT_SENT', { tenantId, conversationId: conv.id, reason: sent.reason });
    await whatsappStore.flagAttention(conv.id);
  }
  if (result.handoff) {
    await whatsappStore.setMode(tenantId, conv.id, 'human');
    await whatsappStore.flagAttention(conv.id);
    logger.info('WHATSAPP_HANDOFF', { tenantId, conversationId: conv.id, reason: result.handoff.reason });
  }
  push(tenantId, conv.id);
}

/** Entry point for a verified webhook body. Never throws: Meta must always get a 200 or it retries for days. */
export async function processWebhook(parsed: ParsedWebhook[]): Promise<void> {
  for (const group of parsed) {
    try {
      const num = await whatsappStore.findNumberByPhoneNumberId(group.phoneNumberId);
      if (!num) {
        logger.warn('WHATSAPP_UNKNOWN_NUMBER', { phoneNumberId: group.phoneNumberId });
        continue;
      }
      for (const s of group.statuses) await whatsappStore.applyStatus(s).catch(() => {});
      if (num.status === 'disabled') continue;
      for (const m of group.messages) {
        await serialise(`${num.tenantId}:${m.from}`, () => processMessage(num, m)).catch((err) =>
          logger.error('WHATSAPP_MESSAGE_FAILED', { tenantId: num.tenantId, error: String(err).slice(0, 200) })
        );
      }
    } catch (err) {
      logger.error('WHATSAPP_WEBHOOK_GROUP_FAILED', { error: String(err).slice(0, 200) });
    }
  }
}
