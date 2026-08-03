import type { IncomingMessage } from 'http';
import type { Socket } from 'net';
import { logger } from '../services/logger.js';
import type { RealtimeGateway } from '../services/realtime/realtime.gateway.js';
import { aiConfigWebSocketManager } from '../services/ai-config/ai-config.websocket.js';
import { isAllowedVoiceWebSocketSource } from '../services/voice/security.js';
import { wsRateLimiter } from '../services/ws-rate-limiter.js';

function getClientIp(request: IncomingMessage): string {
    const forwarded = request.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
        return forwarded.split(',')[0].trim();
    }
    return request.socket.remoteAddress || 'unknown';
}

function wsRateLimitCheck(request: IncomingMessage, socket: Socket, path: string, tenantId?: string): boolean {
    const ip = getClientIp(request);

    const ipCheck = wsRateLimiter.checkIpRate(ip);
    if (!ipCheck.allowed) {
        logger.warn('WS_UPGRADE_IP_RATE_LIMITED', { ip, path, retryAfterMs: ipCheck.retryAfterMs });
        try {
            socket.write(
                'HTTP/1.1 429 Too Many Requests\r\nContent-Type: text/plain\r\nRetry-After: '
                + Math.ceil((ipCheck.retryAfterMs || 60000) / 1000)
                + '\r\nConnection: close\r\n\r\nRate limited. Try again later.\r\n'
            );
        } catch { /* ignore */ }
        try { socket.destroy(); } catch { /* ignore */ }
        return false;
    }

    const burstCheck = wsRateLimiter.checkBurst(ip);
    if (!burstCheck.allowed) {
        logger.warn('WS_UPGRADE_BURST_LIMITED', { ip, path });
        try {
            socket.write('HTTP/1.1 429 Too Many Requests\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\nBurst limit exceeded. Slow down.\r\n');
        } catch { /* ignore */ }
        try { socket.destroy(); } catch { /* ignore */ }
        return false;
    }

    const reconnectCheck = wsRateLimiter.checkReconnectCooldown(ip);
    if (!reconnectCheck.allowed) {
        logger.warn('WS_UPGRADE_RECONNECT_COOLDOWN', { ip, path, retryAfterMs: reconnectCheck.retryAfterMs });
        try {
            socket.write(
                'HTTP/1.1 429 Too Many Requests\r\nContent-Type: text/plain\r\nRetry-After: '
                + Math.ceil((reconnectCheck.retryAfterMs || 2000) / 1000)
                + '\r\nConnection: close\r\n\r\nReconnecting too fast. Wait.\r\n'
            );
        } catch { /* ignore */ }
        try { socket.destroy(); } catch { /* ignore */ }
        return false;
    }

    if (tenantId && !wsRateLimiter.canAcceptTenantConnection(tenantId)) {
        logger.warn('WS_UPGRADE_TENANT_LIMIT', { tenantId, ip, path });
        try {
            socket.write('HTTP/1.1 503 Service Unavailable\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\nTenant connection limit reached.\r\n');
        } catch { /* ignore */ }
        try { socket.destroy(); } catch { /* ignore */ }
        return false;
    }

    return true;
}

export function attachWebSocketUpgradeHandler(
    server: import('http').Server,
    realtimeGateway: RealtimeGateway
): void {
    server.on('upgrade', (request, socket, head) => {
        logger.info('WS_UPGRADE_REQUEST', {
            url: request.url,
            ip: getClientIp(request),
            origin: request.headers.origin,
        });

        try {
            if (realtimeGateway.canHandleUpgrade(request)) {
                const tenantId = realtimeGateway.extractTenantId(request);
                if (!wsRateLimitCheck(request, socket as Socket, '/ws/realtime/', tenantId)) return;
                const origin = request.headers.origin as string | undefined;
                const ip =
                    (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
                    || request.socket.remoteAddress;
                if (!isAllowedVoiceWebSocketSource(origin, ip, request)) {
                    logger.warn('WS_UPGRADE_ORIGIN_BLOCKED', { origin, ip, path: request.url });
                    try {
                        socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\nForbidden\r\n');
                    } catch { /* ignore */ }
                    try { socket.destroy(); } catch { /* ignore */ }
                    return;
                }
                realtimeGateway.upgrade(request, socket as Socket, head);
                return;
            }

            if (aiConfigWebSocketManager.canHandleUpgrade(request)) {
                const tenantId = aiConfigWebSocketManager.extractTenantId(request);
                if (!wsRateLimitCheck(request, socket as Socket, '/ws/ai-config/', tenantId || undefined)) return;
                void aiConfigWebSocketManager.upgrade(request, socket as Socket, head);
                return;
            }

            console.warn('WS upgrade rejected — unrecognised path:', request.url);
            try { socket.destroy(); } catch { /* ignore */ }
        } catch (error) {
            console.error('Fatal error in upgrade handler:', error);
            logger.error('Fatal error in WebSocket upgrade handler', { error: String(error), url: request.url });
            try { socket.destroy(); } catch { /* ignore */ }
        }
    });
}
