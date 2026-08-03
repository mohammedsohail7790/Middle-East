import WebSocket from 'ws';
import { logger } from '../logger.js';
import { sessionCoordinator } from './session-coordinator.js';

interface HeartbeatConfig {
    pingIntervalMs: number;
    pongTimeoutMs: number;
    missedPongLimit: number;
    inactivityTimeoutMs: number;
}

const DEFAULT_CONFIG: HeartbeatConfig = {
    pingIntervalMs: 15000,
    pongTimeoutMs: 5000,
    missedPongLimit: 3,
    inactivityTimeoutMs: 45000,
};

interface TrackedSocket {
    socket: WebSocket;
    sessionId: string;
    tenantId: string;
    lastPong: number;
    lastActivity: number;
    missedPongs: number;
    pongPending: boolean;
    zombieTimer: NodeJS.Timeout | null;
    /** Twilio Media Streams often ignore WS ping/pong — use message activity only */
    twilioMediaStream: boolean;
}

export class HeartbeatManager {
    private sockets = new Map<WebSocket, TrackedSocket>();
    private pingInterval: NodeJS.Timeout | null = null;
    private config: HeartbeatConfig;

    constructor(config: Partial<HeartbeatConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    trackSocket(
        socket: WebSocket,
        sessionId: string,
        tenantId: string,
        options?: { twilioMediaStream?: boolean }
    ): void {
        if (this.sockets.has(socket)) return;

        const now = Date.now();
        const twilioMediaStream = options?.twilioMediaStream ?? false;
        const tracked: TrackedSocket = {
            socket,
            sessionId,
            tenantId,
            lastPong: now,
            lastActivity: now,
            missedPongs: 0,
            pongPending: false,
            zombieTimer: null,
            twilioMediaStream,
        };

        socket.on('pong', () => {
            const ts = this.sockets.get(socket);
            if (ts) {
                ts.lastPong = Date.now();
                ts.missedPongs = 0;
                ts.pongPending = false;
            }
        });

        socket.on('message', () => {
            const ts = this.sockets.get(socket);
            if (ts) {
                ts.lastActivity = Date.now();
            }
        });

        socket.on('close', () => {
            this.untrackSocket(socket);
        });

        this.sockets.set(socket, tracked);

        logger.debug('HEARTBEAT_TRACK_STARTED', {
            sessionId,
            tenantId,
            trackedCount: this.sockets.size,
        });
    }

    untrackSocket(socket: WebSocket): void {
        const tracked = this.sockets.get(socket);
        if (tracked) {
            if (tracked.zombieTimer) {
                clearTimeout(tracked.zombieTimer);
            }
            this.sockets.delete(socket);

            logger.debug('HEARTBEAT_TRACK_STOPPED', {
                sessionId: tracked.sessionId,
                tenantId: tracked.tenantId,
                trackedCount: this.sockets.size,
            });
        }
    }

    markActivity(socket: WebSocket): void {
        const tracked = this.sockets.get(socket);
        if (tracked) {
            tracked.lastActivity = Date.now();
        }
    }

    private checkZombie(socket: WebSocket): void {
        const tracked = this.sockets.get(socket);
        if (!tracked) return;

        const now = Date.now();
        const inactivityLimit = tracked.twilioMediaStream
            ? 120_000
            : this.config.inactivityTimeoutMs;
        const inactivityDuration = now - tracked.lastActivity;

        if (inactivityDuration > inactivityLimit) {
            logger.warn('HEARTBEAT_INACTIVITY_TIMEOUT', {
                sessionId: tracked.sessionId,
                tenantId: tracked.tenantId,
                inactivityDurationMs: inactivityDuration,
                twilioMediaStream: tracked.twilioMediaStream,
            });
            this.handleZombie(socket, tracked, 'inactivity-timeout');
            return;
        }

        if (tracked.twilioMediaStream) {
            return;
        }

        if (tracked.pongPending) {
            tracked.missedPongs++;
            if (tracked.missedPongs >= this.config.missedPongLimit) {
                logger.warn('HEARTBEAT_ZOMBIE_DETECTED', {
                    sessionId: tracked.sessionId,
                    tenantId: tracked.tenantId,
                    missedPongs: tracked.missedPongs,
                    nodeId: process.env.HOSTNAME || 'unknown',
                });
                this.handleZombie(socket, tracked, 'missed-pongs');
                return;
            }
        }

        tracked.pongPending = true;
        try {
            socket.ping();
        } catch {
            this.handleZombie(socket, tracked, 'ping-failed');
        }
    }

    private async handleZombie(socket: WebSocket, tracked: TrackedSocket, reason: string): Promise<void> {
        logger.warn('HEARTBEAT_ZOMBIE_TERMINATING', {
            sessionId: tracked.sessionId,
            tenantId: tracked.tenantId,
            reason,
        });

        this.untrackSocket(socket);

        try {
            await sessionCoordinator.unregisterSession(tracked.sessionId, `zombie-${reason}`);
        } catch (err) {
            logger.error('HEARTBEAT_ZOMBIE_CLEANUP_ERROR', {
                sessionId: tracked.sessionId,
                error: String(err),
            });
        }

        try {
            socket.close(4001, `Zombie connection: ${reason}`);
        } catch {
            (socket as any)._socket?.destroy();
        }
    }

    start(): void {
        if (this.pingInterval) return;

        this.pingInterval = setInterval(() => {
            const sockets = Array.from(this.sockets.keys());
            for (const socket of sockets) {
                this.checkZombie(socket);
            }

            logger.debug('HEARTBEAT_CYCLE', {
                trackedCount: this.sockets.size,
            });
        }, this.config.pingIntervalMs);

        this.pingInterval.unref();

        logger.info('HEARTBEAT_MANAGER_STARTED', {
            pingIntervalMs: this.config.pingIntervalMs,
            inactivityTimeoutMs: this.config.inactivityTimeoutMs,
            missedPongLimit: this.config.missedPongLimit,
        });
    }

    stop(): void {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }

        for (const [socket, tracked] of this.sockets) {
            if (tracked.zombieTimer) {
                clearTimeout(tracked.zombieTimer);
            }
            try {
                socket.close(4001, 'Server shutting down');
            } catch { /* ignore */ }
        }

        this.sockets.clear();

        logger.info('HEARTBEAT_MANAGER_STOPPED');
    }

    getStats(): { tracked: number; sessions: string[] } {
        return {
            tracked: this.sockets.size,
            sessions: Array.from(this.sockets.values()).map(t => t.sessionId),
        };
    }
}

export const heartbeatManager = new HeartbeatManager();
