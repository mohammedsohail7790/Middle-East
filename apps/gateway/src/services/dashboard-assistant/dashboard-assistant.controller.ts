import express from 'express';
import { validate } from '../../middleware/validation.js';
import { dashboardAssistantChatSchema } from '../../security/validation-schemas.js';
import { requireVoiceApiAccess } from '../voice/security.js';
import { getTenantId } from '../auth/tenant-context.js';
import { logger } from '../logger.js';
import {
  streamAssistantChat,
  type AssistantMessage,
} from './dashboard-assistant.service.js';

export function createDashboardAssistantRouter(): express.Router {
  const router = express.Router();
  router.use(requireVoiceApiAccess);

  router.post('/chat', validate(dashboardAssistantChatSchema), async (req, res) => {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ success: false, error: 'Tenant required' });
    }

    const body = req.body as {
      messages?: AssistantMessage[];
      page?: string;
      pageTitle?: string;
    };

    const messages = Array.isArray(body.messages) ? body.messages : [];
    const page = typeof body.page === 'string' ? body.page : undefined;
    const pageTitle = typeof body.pageTitle === 'string' ? body.pageTitle : undefined;

    for (const msg of messages) {
      if (!msg || typeof msg.content !== 'string') {
        return res.status(400).json({ success: false, error: 'Invalid message format' });
      }
      if (msg.role !== 'user' && msg.role !== 'assistant') {
        return res.status(400).json({ success: false, error: 'Invalid message role' });
      }
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    let clientGone = false;
    req.on('close', () => {
      clientGone = true;
    });

    const send = (event: string, data: unknown) => {
      if (clientGone || res.writableEnded) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    send('ready', { ok: true });

    try {
      const reply = await streamAssistantChat(
        { tenantId, messages, page, pageTitle },
        (delta) => send('delta', { text: delta }),
        () => clientGone,
        (status) => send('status', { text: status })
      );
      if (clientGone) return;
      send('done', { text: reply });
      res.end();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Assistant error';
      logger.warn('DASHBOARD_ASSISTANT_CHAT_FAILED', { tenantId, error: msg });
      send('error', { error: msg });
      res.end();
    }
  });

  return router;
}
