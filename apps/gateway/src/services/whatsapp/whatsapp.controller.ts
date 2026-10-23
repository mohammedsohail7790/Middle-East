/**
 * WhatsApp HTTP surface.
 *  - Meta webhook (public, signature-checked, raw body): mounted directly in index.ts BEFORE the JSON parser.
 *  - Management API for the dashboard (authenticated, tenant from the JWT): connect a number, list/read conversations,
 *    reply as staff, hand a conversation back to the AI.
 */

import crypto from 'node:crypto';

import { Router } from 'express';
import { asyncHandler } from '../../middleware/index.js';
import { validate, type ValidationSchema } from '../../middleware/validation.js';
import { resolveTenantId } from '../../middleware/resolve-tenant-id.js';
import { logger } from '../logger.js';
import { channelsService } from '../channels/channels.service.js';
import { publishDashboardPushType } from '../dashboard/dashboard-events.js';
import { whatsappStore } from './whatsapp.store.js';
import { WhatsAppApiError, fetchPhoneNumber, appSecret, parseWebhook, verifySignature } from './whatsapp.client.js';
import { isWindowOpen, sendReply } from './whatsapp.outbound.js';
import { processWebhook } from './whatsapp.service.js';

// ── public webhook ───────────────────────────────────────────────────────────

/** GET: Meta's one-time subscription handshake. */
export function verifyWhatsAppWebhook(req: any, res: any): void {
  const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim();
  const given = String(req.query['hub.verify_token'] ?? '');
  const ok =
    !!expected && req.query['hub.mode'] === 'subscribe' &&
    given.length === expected.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!ok) { res.sendStatus(403); return; }
  res.status(200).type('text/plain').send(String(req.query['hub.challenge'] ?? ''));
}

/** POST: `req.body` is the raw Buffer (express.raw). Always answers fast; the work happens after the response. */
export function handleWhatsAppWebhook(req: any, res: any): void {
  const raw: Buffer | undefined = Buffer.isBuffer(req.body) ? req.body : undefined;
  if (!appSecret()) {
    logger.error('WHATSAPP_WEBHOOK_NO_APP_SECRET', {});
    res.sendStatus(503);
    return;
  }
  if (!raw || !verifySignature(raw, req.header('x-hub-signature-256'))) {
    logger.warn('WHATSAPP_WEBHOOK_BAD_SIGNATURE', {});
    res.sendStatus(401);
    return;
  }
  let body: unknown;
  try {
    body = JSON.parse(raw.toString('utf8'));
  } catch {
    res.sendStatus(400);
    return;
  }
  res.sendStatus(200);
  void processWebhook(parseWebhook(body)).catch((err) => logger.error('WHATSAPP_WEBHOOK_FAILED', { error: String(err).slice(0, 200) }));
}

// ── management API ───────────────────────────────────────────────────────────

const connectSchema: ValidationSchema = {
  allowOnlyBody: ['phoneNumberId', 'wabaId', 'accessToken', 'aiEnabled', 'notifyCallers'],
  body: {
    phoneNumberId: { type: 'string', required: true, maxLength: 40 },
    wabaId: { type: 'string', maxLength: 40 },
    accessToken: { type: 'string', maxLength: 1000 },
    aiEnabled: { type: 'boolean' },
    notifyCallers: { type: 'boolean' },
  },
};
const settingsSchema: ValidationSchema = {
  allowOnlyBody: ['aiEnabled', 'notifyCallers'],
  body: { aiEnabled: { type: 'boolean' }, notifyCallers: { type: 'boolean' } },
};
const replySchema: ValidationSchema = { allowOnlyBody: ['text'], body: { text: { type: 'string', required: true, maxLength: 4000 } } };
const modeSchema: ValidationSchema = { allowOnlyBody: ['mode'], body: { mode: { type: 'string', required: true, enum: ['ai', 'human'] } } };

function webhookUrl(): string {
  const base = process.env.PUBLIC_GATEWAY_URL?.trim() || process.env.TWILIO_STREAM_WSS_URL?.replace(/^wss:/, 'https:') || 'https://gateway.hallaai.com';
  return `${base.replace(/\/$/, '')}/api/v1/channels/whatsapp/webhook`;
}

export function createWhatsAppRouter(): Router {
  const router = Router();

  router.get('/', asyncHandler(async (req: any, res: any) => {
    const tenantId = resolveTenantId(req);
    const [num, conn] = await Promise.all([whatsappStore.getNumber(tenantId), channelsService.getConnection(tenantId, 'whatsapp')]);
    res.json({
      success: true,
      data: {
        connected: !!num && num.status === 'connected',
        number: num,
        notifyCallers: conn?.config?.notifyCallers === true,
        webhookUrl: webhookUrl(),
        platformReady: !!appSecret() && !!process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim(),
      },
    });
  }));

  router.put('/connect', validate(connectSchema), asyncHandler(async (req: any, res: any) => {
    const tenantId = resolveTenantId(req);
    const { phoneNumberId, wabaId, accessToken, aiEnabled, notifyCallers } = req.body;
    const token = accessToken?.trim() || process.env.WHATSAPP_ACCESS_TOKEN?.trim();
    if (!token) return res.status(400).json({ error: 'Provide an access token (or set WHATSAPP_ACCESS_TOKEN on the gateway).' });

    // A phone_number_id can serve one tenant only: otherwise one business could read another's customers.
    const taken = await whatsappStore.findNumberByPhoneNumberId(phoneNumberId.trim());
    if (taken && taken.tenantId !== tenantId) return res.status(409).json({ error: 'That WhatsApp number is already connected to another account.' });

    let info;
    try {
      info = await fetchPhoneNumber(phoneNumberId.trim(), token);
    } catch (err) {
      const msg = err instanceof WhatsAppApiError ? err.message : 'Could not reach WhatsApp';
      return res.status(400).json({ error: `WhatsApp rejected these details: ${msg}` });
    }
    const num = await whatsappStore.connectNumber(tenantId, {
      phoneNumberId: phoneNumberId.trim(), wabaId, displayPhone: info.displayPhone, accessToken: accessToken?.trim(), aiEnabled,
    });
    const prev = await channelsService.getConnection(tenantId, 'whatsapp');
    await channelsService.upsertConnection(tenantId, 'whatsapp', {
      status: 'connected',
      config: { ...(prev?.config ?? {}), displayPhone: info.displayPhone, verifiedName: info.verifiedName, ...(notifyCallers !== undefined ? { notifyCallers } : {}) },
    });
    res.json({ success: true, data: { number: num, webhookUrl: webhookUrl() } });
  }));

  router.patch('/settings', validate(settingsSchema), asyncHandler(async (req: any, res: any) => {
    const tenantId = resolveTenantId(req);
    if (typeof req.body.aiEnabled === 'boolean') await whatsappStore.setAiEnabled(tenantId, req.body.aiEnabled);
    if (typeof req.body.notifyCallers === 'boolean') {
      const prev = await channelsService.getConnection(tenantId, 'whatsapp');
      await channelsService.upsertConnection(tenantId, 'whatsapp', { status: prev?.status ?? 'connected', config: { ...(prev?.config ?? {}), notifyCallers: req.body.notifyCallers } });
    }
    res.json({ success: true });
  }));

  router.delete('/', asyncHandler(async (req: any, res: any) => {
    const tenantId = resolveTenantId(req);
    await whatsappStore.disconnect(tenantId);
    await channelsService.deleteConnection(tenantId, 'whatsapp');
    res.json({ success: true });
  }));

  router.get('/conversations', asyncHandler(async (req: any, res: any) => {
    const tenantId = resolveTenantId(req);
    const rows = await whatsappStore.listConversations(tenantId, Number(req.query.limit) || 50);
    res.json({ success: true, data: rows.map((c) => ({ ...c, windowOpen: isWindowOpen(c) })) });
  }));

  router.get('/conversations/:id/messages', asyncHandler(async (req: any, res: any) => {
    const tenantId = resolveTenantId(req);
    const conv = await whatsappStore.getConversation(tenantId, req.params.id);
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });
    const messages = await whatsappStore.recentMessages(tenantId, conv.id, 100);
    res.json({ success: true, data: { conversation: { ...conv, windowOpen: isWindowOpen(conv) }, messages } });
  }));

  router.post('/conversations/:id/messages', validate(replySchema), asyncHandler(async (req: any, res: any) => {
    const tenantId = resolveTenantId(req);
    const conv = await whatsappStore.getConversation(tenantId, req.params.id);
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });
    const r = await sendReply(tenantId, conv, req.body.text.trim(), 'staff');
    if (!r.ok) {
      const closed = r.reason === 'window_closed';
      return res.status(closed ? 409 : 502).json({
        error: closed ? 'The 24-hour reply window has closed. WhatsApp only allows an approved template until the customer writes again.' : `Could not send: ${r.reason}`,
        code: r.reason,
      });
    }
    // A staff reply means a person is handling it now: stop the AI from answering over them.
    await whatsappStore.setMode(tenantId, conv.id, 'human');
    await whatsappStore.flagAttention(conv.id, false);
    publishDashboardPushType(tenantId, 'whatsapp.message', [], { conversationId: conv.id });
    res.json({ success: true });
  }));

  router.post('/conversations/:id/mode', validate(modeSchema), asyncHandler(async (req: any, res: any) => {
    const tenantId = resolveTenantId(req);
    const conv = await whatsappStore.getConversation(tenantId, req.params.id);
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });
    await whatsappStore.setMode(tenantId, conv.id, req.body.mode);
    if (req.body.mode === 'ai') await whatsappStore.flagAttention(conv.id, false);
    publishDashboardPushType(tenantId, 'whatsapp.message', [], { conversationId: conv.id });
    res.json({ success: true });
  }));

  return router;
}
