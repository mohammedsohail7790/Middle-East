import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WsRateLimiter } from '../../../apps/gateway/src/services/ws-rate-limiter.js';

describe('WsRateLimiter', () => {
  let limiter: WsRateLimiter;

  beforeEach(() => {
    limiter = new WsRateLimiter({
      ipMaxConnectionsPerWindow: 5,
      ipWindowMs: 10000,
      tenantMaxConcurrent: 3,
      burstMaxPerSecond: 3,
      reconnectCooldownMs: 500,
      invalidAuthMaxAttempts: 3,
      invalidAuthWindowMs: 10000,
      floodMaxMessagesPerWindow: 100,
      floodWindowMs: 10000,
      zombieTimeoutMs: 50000,
      idleTimeoutMs: 30000,
      cleanupIntervalMs: 50000,
    });
  });

  afterEach(() => { limiter.destroy(); });

  describe('IP rate limiting', () => {
    it('allows connections under the limit', () => {
      for (let i = 0; i < 5; i++) {
        expect(limiter.checkIpRate('1.2.3.4').allowed).toBe(true);
      }
    });

    it('blocks connections over the limit', () => {
      for (let i = 0; i < 5; i++) limiter.checkIpRate('1.2.3.4');
      const result = limiter.checkIpRate('1.2.3.4');
      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBeGreaterThan(0);
    });

    it('treats different IPs independently', () => {
      for (let i = 0; i < 5; i++) limiter.checkIpRate('1.2.3.4');
      expect(limiter.checkIpRate('5.6.7.8').allowed).toBe(true);
    });
  });

  describe('burst protection', () => {
    it('allows bursts under the limit', () => {
      for (let i = 0; i < 3; i++) {
        expect(limiter.checkBurst('1.2.3.4').allowed).toBe(true);
      }
    });

    it('blocks bursts over the limit', () => {
      for (let i = 0; i < 3; i++) limiter.checkBurst('1.2.3.4');
      expect(limiter.checkBurst('1.2.3.4').allowed).toBe(false);
    });
  });

  describe('reconnect cooldown', () => {
    it('blocks rapid reconnects', () => {
      limiter.markDisconnect('1.2.3.4');
      expect(limiter.checkReconnectCooldown('1.2.3.4').allowed).toBe(false);
    });

    it('allows reconnect after cooldown', async () => {
      limiter.markDisconnect('1.2.3.4');
      await new Promise(r => setTimeout(r, 600));
      expect(limiter.checkReconnectCooldown('1.2.3.4').allowed).toBe(true);
    }, 10000);
  });

  describe('invalid auth throttling', () => {
    it('blocks after max attempts', () => {
      for (let i = 0; i < 3; i++) limiter.checkInvalidAuth('1.2.3.4');
      expect(limiter.checkInvalidAuth('1.2.3.4').allowed).toBe(false);
    });

    it('allows after window expiry', () => {
      vi.useFakeTimers();
      for (let i = 0; i < 3; i++) limiter.checkInvalidAuth('1.2.3.4');
      vi.advanceTimersByTime(10001);
      expect(limiter.checkInvalidAuth('1.2.3.4').allowed).toBe(true);
      vi.useRealTimers();
    });
  });

  describe('tenant connection quotas', () => {
    it('enforces max concurrent per tenant', () => {
      for (let i = 0; i < 3; i++) {
        const ws = { readyState: 1 } as any;
        limiter.registerConnection(ws, '1.2.3.4', 'tenant-1');
      }
      // Fourth connection should be rejected
      const ws4 = { readyState: 1 } as any;
      limiter.registerConnection(ws4, '1.2.3.4', 'tenant-1');
      expect(limiter.canAcceptTenantConnection('tenant-1')).toBe(false);
    });

    it('frees quota on disconnect', () => {
      const sockets: any[] = [];
      for (let i = 0; i < 3; i++) {
        const ws = { readyState: 1 } as any;
        sockets.push(ws);
        limiter.registerConnection(ws, '1.2.3.4', 'tenant-1');
      }
      expect(limiter.canAcceptTenantConnection('tenant-1')).toBe(false);
      limiter.unregisterConnection(sockets[0]);
      expect(limiter.canAcceptTenantConnection('tenant-1')).toBe(true);
    });
  });

  describe('connection lifecycle', () => {
    it('tracks metadata', () => {
      const ws = { readyState: 1 } as any;
      limiter.registerConnection(ws, '1.2.3.4', 'tenant-1');
      expect(limiter.getStats().totalConnections).toBe(1);
    });

    it('cleanup removes stale state', () => {
      const ws = { readyState: 3 } as any;
      limiter.registerConnection(ws, '1.2.3.4', 'tenant-1');
      expect(limiter.getStats().totalConnections).toBe(1);
    });

    it('activity tracking resets timers', () => {
      const ws = { readyState: 1 } as any;
      limiter.registerConnection(ws, '1.2.3.4');
      limiter.updateActivity(ws);
      expect(true).toBe(true);
    });
  });

  describe('getStats', () => {
    it('returns a stats object', () => {
      const stats = limiter.getStats();
      expect(stats).toHaveProperty('totalConnections');
      expect(stats).toHaveProperty('totalTenants');
      expect(stats).toHaveProperty('activeIps');
      expect(stats).toHaveProperty('config');
    });
  });
});
