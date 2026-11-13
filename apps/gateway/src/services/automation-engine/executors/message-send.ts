import type { ExecutorContext, ExecutorResult } from '../types.js';
import { requireApproval, text } from './util.js';

type Channel = 'whatsapp' | 'sms';

/**
 * message.send: params { to, text, senderName, channelOrder }. Tries the channels in order and stops at the first that works.
 * Never messages a number that opted out, never a business on the consent-capture track, and WhatsApp free text only inside its 24-hour window.
 */
export async function messageSend(ctx: ExecutorContext): Promise<ExecutorResult> {
  requireApproval(ctx);
  const { normalizePhone } = await import('../../whatsapp/whatsapp.client.js');
  const phone = normalizePhone(ctx.params.to);
  if (!phone) return { summary: 'There is no phone number to message', skipped: true };
  let body = text(ctx.params.text, 600);
  if (!body) return { summary: 'There was no message to send', skipped: true };
  const sender = text(ctx.params.senderName, 80);
  if (sender) body = `${body}\n- ${sender}`;

  const order: Channel[] = [];
  const asked = Array.isArray(ctx.params.channelOrder) ? ctx.params.channelOrder : ['whatsapp', 'sms'];
  for (const c of asked) if ((c === 'whatsapp' || c === 'sms') && !order.includes(c)) order.push(c);
  if (!order.length) return { summary: 'No way of sending the message is chosen', skipped: true };

  const outbound = await import('../../whatsapp/whatsapp.outbound.js');
  if (await outbound.isConsentCaptureTenant(ctx.tenantId)) return { summary: 'Messaging customers is not available for this business', skipped: true };

  const { whatsappStore } = await import('../../whatsapp/whatsapp.store.js');
  const conv = await whatsappStore.findConversationByPhone(ctx.tenantId, phone);
  if (conv?.optedOut) return { summary: 'The customer opted out of messages, so nothing was sent', skipped: true };

  const soft: string[] = [];
  const hard: string[] = [];
  for (const channel of order) {
    if (channel === 'whatsapp') {
      if (!conv) soft.push('WhatsApp: the customer has not written to this number');
      else if (!outbound.isWindowOpen(conv)) soft.push('WhatsApp: more than 24 hours since the customer last wrote');
      else {
        const r = await outbound.sendReply(ctx.tenantId, conv, body, 'system');
        if (r.ok) return { summary: 'Sent a WhatsApp message', output: { channel: 'whatsapp' } };
        (['window_closed', 'not_connected'].includes(r.reason ?? '') ? soft : hard).push(`WhatsApp: ${r.reason === 'window_closed' || r.reason === 'not_connected' ? 'not available' : 'could not send'}`);
      }
    } else {
      try {
        const { smsService } = await import('../../sms/sms.service.js');
        await smsService.sendSms(ctx.tenantId, phone, body);
        return { summary: 'Sent a text message', output: { channel: 'sms' } };
      } catch {
        hard.push('SMS: could not send');
      }
    }
  }
  if (hard.length) throw new Error(`The message could not be sent. ${[...hard, ...soft].join('; ')}`);
  return { summary: `No message was sent. ${soft.join('; ')}`, skipped: true };
}
