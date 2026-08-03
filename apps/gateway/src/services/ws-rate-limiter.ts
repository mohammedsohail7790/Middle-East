import WebSocket from 'ws';
import { logger } from './logger.js';
import { productionTelemetry } from './voice/production-telemetry.js';

interface FloodState {
  messageCount: number;
  windowStart: number;
}

interface IpRateState {
  count: number;
  windowStart: number;
}

interface WsRateLimiterConfig {
  ipMaxConnectionsPerWindow: number;
  ipWindowMs: number;
  tenantMaxConcurrent: number;
  burstMaxPerSecond: number;
  reconnectCooldownMs: number;
  invalidAuthMaxAttempts: number;
  invalidAuthWindowMs: number;
  floodMaxMessagesPerWindow: number;
  floodWindowMs: number;
  zombieTimeoutMs: number;
  idleTimeoutMs: number;
  cleanupIntervalMs: number;
}

const DEFAULT_CONFIG: WsRateLimiterConfig = {
  ipMaxConnectionsPerWindow: 20,
  ipWindowMs: 60000,
  tenantMaxConcurrent: Number(process.env.VOICE_MAX_TENANT_CONCURRENT_CALLS) || 25,
  burstMaxPerSecond: 5,
  reconnectCooldownMs: 2000,
  invalidAuthMaxAttempts: 5,
  invalidAuthWindowMs: 60000,
  floodMaxMessagesPerWindow: 6000,
  floodWindowMs: 60000,
  zombieTimeoutMs: 60000,
  idleTimeoutMs: 45000,
  cleanupIntervalMs: 30000,
};

export class WsRateLimiter {
  private config: WsRateLimiterConfig;
  private ipState = new Map<string, IpRateState>();
  private tenantConnections = new Map<string, Set<WebSocket>>();
  private reconnectTracker = new Map<string, number>();
  private invalidAuthTracker = new Map<string, { count: number; windowStart: number }>();
  private floodState = new Map<WebSocket, FloodState>();
  private zombieTimers = new Map<WebSocket, NodeJS.Timeout>();
  private idleTimers = new Map<WebSocket, NodeJS.Timeout>();
  private connectionMetadata = new Map<WebSocket, {
    ip: string;
    tenantId?: string;
    connectedAt: number;
    lastActivity: number;
    messageCount: number;
  }>();
  private cleanupInterval: NodeJS.Timeout;

  constructor(config?: Partial<WsRateLimiterConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cleanupInterval = setInterval(() => this.cleanup(), this.config.cleanupIntervalMs);
  }

  checkIpRate(ip: string): { allowed: boolean; retryAfterMs?: number } {
    const now = Date.now();
    let state = this.ipState.get(ip);

    if (!state || now - state.windowStart > this.config.ipWindowMs) {
      state = { count: 0, windowStart: now };
      this.ipState.set(ip, state);
    }

    state.count++;

    if (state.count > this.config.ipMaxConnectionsPerWindow) {
      const retryAfterMs = this.config.ipWindowMs - (now - state.windowStart);
      logger.warn('WS_RATE_IP_LIMIT_EXCEEDED', { ip, count: state.count, retryAfterMs });
      return { allowed: false, retryAfterMs };
    }

    return { allowed: true };
  }

  checkBurst(ip: string): { allowed: boolean } {
    const now = Date.now();
    const key = `burst:${ip}`;
    const state = this.ipState.get(key);

    if (!state || now - state.windowStart > 1000) {
      this.ipState.set(key, { count: 1, windowStart: now });
      return { allowed: true };
    }

    state.count++;
    if (state.count > this.config.burstMaxPerSecond) {
      logger.warn('WS_BURST_LIMIT_EXCEEDED', { ip, count: state.count });
      return { allowed: false };
    }

    return { allowed: true };
  }

  checkReconnectCooldown(ip: string): { allowed: boolean; retryAfterMs?: number } {
    const lastDisconnect = this.reconnectTracker.get(ip);
    if (!lastDisconnect) return { allowed: true };

    const elapsed = Date.now() - lastDisconnect;
    if (elapsed < this.config.reconnectCooldownMs) {
      const retryAfterMs = this.config.reconnectCooldownMs - elapsed;
      logger.warn('WS_RECONNECT_COOLDOWN', { ip, elapsed, retryAfterMs });
      return { allowed: false, retryAfterMs };
    }

    return { allowed: true };
  }

  markDisconnect(ip: string): void {
    this.reconnectTracker.set(ip, Date.now());
  }

  checkInvalidAuth(ip: string): { allowed: boolean } {
    const now = Date.now();
    let state = this.invalidAuthTracker.get(ip);

    if (!state || now - state.windowStart > this.config.invalidAuthWindowMs) {
      state = { count: 0, windowStart: now };
      this.invalidAuthTracker.set(ip, state);
    }

    state.count++;

    if (state.count > this.config.invalidAuthMaxAttempts) {
      logger.warn('WS_INVALID_AUTH_THROTTLED', { ip, count: state.count });
      return { allowed: false };
    }

    return { allowed: true };
  }

  registerConnection(socket: WebSocket, ip: string, tenantId?: string): void {
    this.connectionMetadata.set(socket, {
      ip,
      tenantId,
      connectedAt: Date.now(),
      lastActivity: Date.now(),
      messageCount: 0,
    });

    if (tenantId) {
      let connections = this.tenantConnections.get(tenantId);
      if (!connections) {
        connections = new Set();
        this.tenantConnections.set(tenantId, connections);
      }
      connections.add(socket);
    }

    this.startTimers(socket, ip);

    productionTelemetry.incrementCounter('ws_connections_active');
  }

  private startTimers(socket: WebSocket, ip: string): void {
    const zombieTimer = setTimeout(() => {
      const meta = this.connectionMetadata.get(socket);
      if (meta && Date.now() - meta.lastActivity > this.config.zombieTimeoutMs) {
        logger.warn('WS_ZOMBIE_SOCKET_CLOSED', { ip });
        productionTelemetry.incrementCounter('ws_zombie_closed');
        try { socket.close(1001, 'Zombie connection'); } catch { /* ignore */ }
      }
    }, this.config.zombieTimeoutMs);
    this.zombieTimers.set(socket, zombieTimer);

    const idleTimer = setTimeout(() => {
      const meta = this.connectionMetadata.get(socket);
      if (meta && Date.now() - meta.lastActivity > this.config.idleTimeoutMs) {
        logger.warn('WS_IDLE_SOCKET_CLOSED', { ip });
        productionTelemetry.incrementCounter('ws_idle_closed');
        try { socket.close(1000, 'Idle timeout'); } catch { /* ignore */ }
      }
    }, this.config.idleTimeoutMs);
    this.idleTimers.set(socket, idleTimer);
  }

  updateActivity(socket: WebSocket): void {
    const meta = this.connectionMetadata.get(socket);
    if (!meta) return;

    meta.lastActivity = Date.now();
    meta.messageCount++;

    this.resetTimers(socket);
    this.checkFlood(socket);
  }

  private resetTimers(socket: WebSocket): void {
    const existingZombie = this.zombieTimers.get(socket);
    if (existingZombie) clearTimeout(existingZombie);

    const existingIdle = this.idleTimers.get(socket);
    if (existingIdle) clearTimeout(existingIdle);

    const meta = this.connectionMetadata.get(socket);
    if (meta) {
      this.startTimers(socket, meta.ip);
    }
  }

  private checkFlood(socket: WebSocket): void {
    const now = Date.now();
    let state = this.floodState.get(socket);

    if (!state || now - state.windowStart > this.config.floodWindowMs) {
      state = { messageCount: 0, windowStart: now };
      this.floodState.set(socket, state);
    }

    state.messageCount++;

    if (state.messageCount > this.config.floodMaxMessagesPerWindow) {
      logger.warn('WS_FLOOD_DETECTED', {
        messageCount: state.messageCount,
        windowMs: this.config.floodWindowMs,
      });
      productionTelemetry.incrementCounter('ws_flood_closed');
      try { socket.close(1008, 'Message rate exceeded'); } catch { /* ignore */ }
    }
  }

  canAcceptTenantConnection(tenantId: string): boolean {
    const connections = this.tenantConnections.get(tenantId);
    if (!connections) return true;
    const activeCount = this.countActiveConnections(connections);
    return activeCount < this.config.tenantMaxConcurrent;
  }

  private countActiveConnections(connections: Set<WebSocket>): number {
    let count = 0;
    for (const ws of connections) {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        count++;
      }
    }
    return count;
  }

  unregisterConnection(socket: WebSocket): void {
    const meta = this.connectionMetadata.get(socket);
    if (!meta) return;

    if (meta.tenantId) {
      const connections = this.tenantConnections.get(meta.tenantId);
      if (connections) {
        connections.delete(socket);
        if (connections.size === 0) {
          this.tenantConnections.delete(meta.tenantId);
        }
      }
    }

    const zombieTimer = this.zombieTimers.get(socket);
    if (zombieTimer) clearTimeout(zombieTimer);

    const idleTimer = this.idleTimers.get(socket);
    if (idleTimer) clearTimeout(idleTimer);

    this.connectionMetadata.delete(socket);
    this.floodState.delete(socket);
    this.zombieTimers.delete(socket);
    this.idleTimers.delete(socket);

    productionTelemetry.incrementCounter('ws_connections_closed');
  }

  getTenantConnectionCount(tenantId: string): number {
    const connections = this.tenantConnections.get(tenantId);
    if (!connections) return 0;
    return this.countActiveConnections(connections);
  }

  getStats(): Record<string, any> {
    return {
      totalConnections: this.connectionMetadata.size,
      totalTenants: this.tenantConnections.size,
      activeIps: this.ipState.size,
      reconnectTracked: this.reconnectTracker.size,
      invalidAuthTracked: this.invalidAuthTracker.size,
      floodTracked: this.floodState.size,
      zombieTimers: this.zombieTimers.size,
      idleTimers: this.idleTimers.size,
      config: this.config,
    };
  }

  private cleanup(): void {
    const now = Date.now();

    for (const [ip, state] of this.ipState) {
      if (now - state.windowStart > this.config.ipWindowMs * 2) {
        this.ipState.delete(ip);
      }
    }

    for (const [ip, ts] of this.reconnectTracker) {
      if (now - ts > this.config.reconnectCooldownMs * 10) {
        this.reconnectTracker.delete(ip);
      }
    }

    for (const [ip, state] of this.invalidAuthTracker) {
      if (now - state.windowStart > this.config.invalidAuthWindowMs * 2) {
        this.invalidAuthTracker.delete(ip);
      }
    }

    for (const [socket] of this.connectionMetadata) {
      if (socket.readyState !== WebSocket.OPEN && socket.readyState !== WebSocket.CONNECTING) {
        this.unregisterConnection(socket);
      }
    }

    productionTelemetry.incrementCounter('ws_rate_limiter_cleanup');
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    for (const timer of this.zombieTimers.values()) clearTimeout(timer);
    for (const timer of this.idleTimers.values()) clearTimeout(timer);
    this.ipState.clear();
    this.tenantConnections.clear();
    this.reconnectTracker.clear();
    this.invalidAuthTracker.clear();
    this.floodState.clear();
    this.zombieTimers.clear();
    this.idleTimers.clear();
    this.connectionMetadata.clear();
  }
}

export const wsRateLimiter = new WsRateLimiter();
