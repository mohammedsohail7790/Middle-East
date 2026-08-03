import { logger } from '../logger.js';
import { sessionRegistry } from './session-registry.js';
import {
  isP1RuntimeSessionEnabled,
  P1_SESSION_HEARTBEAT_STALE_MS,
  P1_RECONNECT_GRACE_MS,
} from './realtime-session.js';
import { logSessionLifecycle } from './session-lifecycle-telemetry.js';
import { flushPartialPersistence } from './session-persistence.js';

/** P1-A — stale heartbeat, orphan transport, and leaked session cleanup. */
export class SessionWatchdog {
  private timer: ReturnType<typeof setInterval> | null = null;
  private metrics = {
    orphanCleanups: 0,
    staleHeartbeats: 0,
    leakedSessions: 0,
  };

  start(
    intervalMs = Number(process.env.P1_WATCHDOG_INTERVAL_MS || 30_000)
  ): void {
    if (this.timer || !isP1RuntimeSessionEnabled()) return;
    this.timer = setInterval(() => this.scan(), intervalMs);
    this.timer.unref?.();
    logger.info('SESSION_WATCHDOG_STARTED', { intervalMs });
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  getMetrics(): typeof this.metrics & { activeSessions: number } {
    return {
      ...this.metrics,
      activeSessions: sessionRegistry.activeCount(),
    };
  }

  private scan(): void {
    const now = Date.now();
    for (const session of sessionRegistry.listActive()) {
      const idleMs = now - session.lastHeartbeatAt;
      const noTransport = !session.hasActiveTransport();
      const inReconnect =
        session.state === 'reconnecting' && noTransport;

      if (idleMs > P1_SESSION_HEARTBEAT_STALE_MS) {
        this.metrics.staleHeartbeats++;
        logger.warn('SESSION_WATCHDOG_STALE_HEARTBEAT', {
          sessionId: session.sessionId,
          tenantId: session.tenantId,
          callSid: session.callSid,
          idleMs,
          state: session.state,
        });
        logSessionLifecycle('SESSION_IDLE', {
          sessionId: session.sessionId,
          tenantId: session.tenantId,
          callSid: session.callSid,
          idleMs,
        });
        sessionRegistry.scheduleTerminateAfterGrace(session, () => {
          this.metrics.leakedSessions++;
        }, Math.min(P1_RECONNECT_GRACE_MS, 5_000));
        continue;
      }

      if (inReconnect && idleMs > P1_RECONNECT_GRACE_MS) {
        this.metrics.orphanCleanups++;
        logSessionLifecycle('SESSION_WATCHDOG_CLEANUP', {
          sessionId: session.sessionId,
          tenantId: session.tenantId,
          callSid: session.callSid,
          idleMs,
          reason: 'reconnect_grace_exceeded',
        });
        sessionRegistry.terminate(session.sessionId);
        continue;
      }

      if (noTransport && session.state === 'active' && idleMs > 5_000) {
        session.detachTransport('orphan_transport');
        flushPartialPersistence(session).catch(() => {});
      }
    }
  }
}

export const sessionWatchdog = new SessionWatchdog();
