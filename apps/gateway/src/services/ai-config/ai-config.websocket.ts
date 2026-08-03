import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { logger } from '../logger.js';
import { voiceRedis } from '../voice/redis.client.js';
import {
  AI_CONFIG_PUSH_CHANNEL,
  type AiConfigPushMessage,
} from './ai-config-events.js';

interface ConfigSubscriber {
  ws: WebSocket;
  tenantId: string;
}

export class AIConfigWebSocketManager {
  private subscriptions = new Map<string, Set<ConfigSubscriber>>();
  private wss: WebSocketServer;
  private redisFanoutStarted = false;

  constructor() {
    this.wss = new WebSocketServer({ noServer: true });
    this.startRedisFanout();
  }

  private startRedisFanout(): void {
    if (this.redisFanoutStarted) return;
    this.redisFanoutStarted = true;

    const sub = voiceRedis.duplicate();
    sub.on('error', (err) => {
      logger.warn('AI_CONFIG_WS_REDIS_SUB_ERROR', { error: String(err) });
    });

    void sub
      .subscribe(AI_CONFIG_PUSH_CHANNEL)
      .then(() => {
        logger.info('AI_CONFIG_WS_REDIS_FANOUT_READY');
      })
      .catch((err) => {
        logger.warn('AI_CONFIG_WS_REDIS_FANOUT_FAILED', { error: String(err) });
      });

    sub.on('message', (_channel, raw) => {
      try {
        const payload = JSON.parse(raw) as AiConfigPushMessage;
        if (!payload.tenantId || payload.config === undefined) return;
        this.deliverConfigUpdate(payload.tenantId, payload.config);
      } catch {
        /* ignore malformed */
      }
    });
  }

  canHandleUpgrade(request: IncomingMessage): boolean {
    return request.url?.startsWith('/ws/ai-config/') ?? false;
  }

  extractTenantId(request: IncomingMessage): string | null {
    const match = request.url?.match(/\/ws\/ai-config\/([a-zA-Z0-9\-_]+)/);
    return match ? match[1] : null;
  }

  async upgrade(request: IncomingMessage, socket: any, head: Buffer): Promise<void> {
    const tenantId = this.extractTenantId(request);

    if (!tenantId) {
      logger.warn('AI_CONFIG_WS_INVALID_TENANT', { url: request.url });
      socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }

    const url = new URL(request.url || '', 'http://localhost');
    const token = url.searchParams.get('token') || '';
    const requireToken =
      process.env.NODE_ENV === 'production' ||
      process.env.AI_CONFIG_WS_REQUIRE_TOKEN === 'true';

    if (requireToken || token) {
      const { verifyWsSessionToken } = await import('../auth/ws-session-tokens.js');
      const ok = await verifyWsSessionToken(token, { tenantId }, { consumeNonce: false });
      if (!ok) {
        logger.warn('AI_CONFIG_WS_AUTH_FAILED', { tenantId });
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }
    }

    this.wss.handleUpgrade(request, socket, head, (ws) => {
      this.onConnection(ws, tenantId);
    });
  }

  private onConnection(ws: WebSocket, tenantId: string): void {
    logger.info('AI_CONFIG_WS_CONNECTED', { tenantId });

    const subscriber: ConfigSubscriber = { ws, tenantId };

    // Add to subscriptions
    if (!this.subscriptions.has(tenantId)) {
      this.subscriptions.set(tenantId, new Set());
    }
    this.subscriptions.get(tenantId)!.add(subscriber);

    // Send initial config state
    this.sendInitialState(ws, tenantId);

    ws.on('close', () => {
      logger.info('AI_CONFIG_WS_DISCONNECTED', { tenantId });
      this.subscriptions.get(tenantId)?.delete(subscriber);
    });

    ws.on('error', (error) => {
      logger.error('AI_CONFIG_WS_ERROR', { tenantId, error: String(error) });
    });
  }

  private async sendInitialState(ws: WebSocket, tenantId: string): Promise<void> {
    try {
      const cached = await voiceRedis.get(`ai_config:${tenantId}`);
      if (cached) {
        ws.send(JSON.stringify({ type: 'config_state', config: JSON.parse(cached) }));
        return;
      }
      const { aiConfigService } = await import('./ai-config.service.js');
      const { toDashboardConfig } = await import('./ai-config.dto.js');
      const config = await aiConfigService.getConfig(tenantId);
      const dashboardConfig = toDashboardConfig(config);
      await voiceRedis.setex(`ai_config:${tenantId}`, 300, JSON.stringify(dashboardConfig));
      ws.send(JSON.stringify({ type: 'config_state', config: dashboardConfig }));
    } catch (error) {
      logger.error('AI_CONFIG_WS_INITIAL_STATE_ERROR', { tenantId, error: String(error) });
    }
  }

  /** Publish to Redis — each instance (including this one) delivers via the fanout subscriber. */
  async broadcastConfigUpdate(tenantId: string, config: any): Promise<void> {
    const { publishAiConfigUpdate } = await import('./ai-config-events.js');
    publishAiConfigUpdate(tenantId, config);
  }

  deliverConfigUpdate(tenantId: string, config: unknown): void {
    const subscribers = this.subscriptions.get(tenantId);
    if (!subscribers || subscribers.size === 0) return;

    const message = JSON.stringify({
      type: 'config_updated',
      config,
      timestamp: new Date().toISOString(),
    });

    const deadSubscribers: ConfigSubscriber[] = [];

    subscribers.forEach((subscriber) => {
      if (subscriber.ws.readyState === WebSocket.OPEN) {
        subscriber.ws.send(message, (error) => {
          if (error) {
            logger.warn('AI_CONFIG_WS_SEND_ERROR', { tenantId, error: String(error) });
            deadSubscribers.push(subscriber);
          }
        });
      } else {
        deadSubscribers.push(subscriber);
      }
    });

    deadSubscribers.forEach((sub) => subscribers.delete(sub));

    logger.info('AI_CONFIG_WS_BROADCAST', { tenantId, subscriberCount: subscribers.size });
  }
}

export const aiConfigWebSocketManager = new AIConfigWebSocketManager();
