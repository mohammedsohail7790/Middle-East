import type { Redis } from 'ioredis';
import { createRedisClient } from '../redis-connection.js';
import { logger } from '../logger.js';
import { scanKeys } from '../redis-scan.js';

const SESSION_PREFIX = 'calliq:session:';
const HEARTBEAT_PREFIX = 'calliq:heartbeat:';
const LOCK_PREFIX = 'calliq:lock:';
const INSTANCE_ID = process.env.HOSTNAME || `pod_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const SESSION_TTL = 300;
const HEARTBEAT_TTL = 15;
const LOCK_TTL = 30;
/** Do not treat brand-new calls as zombies before first coordinator heartbeat cycle */
const SESSION_START_GRACE_MS = 120_000;
const ZOMBIE_HEARTBEAT_MS = 90_000;
const ORPHAN_HEARTBEAT_MS = 180_000;

export interface DistributedSession {
    sessionId: string;
    tenantId: string;
    callSid: string;
    streamSid: string;
    instanceId: string;
    nodeId: string;
    startTime: number;
    lastHeartbeat: number;
    status: 'active' | 'zombie' | 'orphan' | 'closing' | 'closed';
    reconnectCount: number;
    metadata: Record<string, string>;
}

export class SessionCoordinator {
    private redis: Redis;
    private heartbeatTimer: NodeJS.Timeout | null = null;
    private cleanupTimer: NodeJS.Timeout | null = null;
    private readonly nodeId: string;

    constructor(redisUrl?: string) {
        if (!redisUrl && !process.env.REDIS_URL) {
            throw new Error('REDIS_URL is required for SessionCoordinator');
        }
        this.redis = createRedisClient(redisUrl, { label: 'session-coordinator' });
        this.nodeId = INSTANCE_ID;
    }

    async registerSession(sessionId: string, data: Omit<DistributedSession, 'lastHeartbeat' | 'instanceId' | 'nodeId' | 'status' | 'reconnectCount'>): Promise<void> {
        const session: DistributedSession = {
            ...data,
            sessionId,
            instanceId: this.nodeId,
            nodeId: this.nodeId,
            lastHeartbeat: Date.now(),
            status: 'active',
            reconnectCount: 0,
        };

        await this.redis.setex(
            `${SESSION_PREFIX}${sessionId}`,
            SESSION_TTL,
            JSON.stringify(session)
        );

        await this.redis.sadd(`${SESSION_PREFIX}tenant:${data.tenantId}`, sessionId);
        await this.redis.sadd(`${SESSION_PREFIX}instance:${this.nodeId}`, sessionId);

        await this.sendHeartbeat(sessionId);

        logger.info('SESSION_COORD_REGISTERED', {
            sessionId,
            tenantId: data.tenantId,
            nodeId: this.nodeId,
            callSid: data.callSid,
        });
    }

    async unregisterSession(sessionId: string, reason?: string): Promise<void> {
        try {
            const session = await this.getSession(sessionId);
            if (session) {
                session.status = 'closed';
                await this.redis.setex(
                    `${SESSION_PREFIX}${sessionId}`,
                    60,
                    JSON.stringify(session)
                );
                await this.redis.srem(`${SESSION_PREFIX}tenant:${session.tenantId}`, sessionId);
                await this.redis.srem(`${SESSION_PREFIX}instance:${this.nodeId}`, sessionId);
                await this.redis.del(`${HEARTBEAT_PREFIX}${sessionId}`);
                await this.releaseLock(sessionId);
            } else {
                await this.redis.del(`${SESSION_PREFIX}${sessionId}`);
                await this.redis.del(`${HEARTBEAT_PREFIX}${sessionId}`);
            }

            logger.info('SESSION_COORD_UNREGISTERED', {
                sessionId,
                nodeId: this.nodeId,
                reason: reason || 'normal',
            });
        } catch (err) {
            logger.error('SESSION_COORD_UNREGISTER_ERROR', {
                sessionId,
                error: String(err),
            });
        }
    }

    async getSession(sessionId: string): Promise<DistributedSession | null> {
        const raw = await this.redis.get(`${SESSION_PREFIX}${sessionId}`);
        return raw ? JSON.parse(raw) : null;
    }

    async sendHeartbeat(sessionId: string): Promise<void> {
        const now = Date.now();
        await Promise.all([
            this.redis.setex(`${HEARTBEAT_PREFIX}${sessionId}`, HEARTBEAT_TTL, String(now)),
            this.redis.expire(`${SESSION_PREFIX}${sessionId}`, SESSION_TTL),
        ]);
    }

    async getActiveSessionsForTenant(tenantId: string): Promise<string[]> {
        return this.redis.smembers(`${SESSION_PREFIX}tenant:${tenantId}`);
    }

    async getActiveSessionsForInstance(instanceId?: string): Promise<string[]> {
        return this.redis.smembers(`${SESSION_PREFIX}instance:${instanceId || this.nodeId}`);
    }

    async getGlobalActiveCount(): Promise<number> {
        try {
            const { keys } = await scanKeys({
                pattern: `${SESSION_PREFIX}*`,
                batchSize: 100,
                timeoutMs: 5000,
            });
            
            const sessionKeys = keys.filter(k => 
                !k.includes(':tenant:') && 
                !k.includes(':instance:')
            );
            
            return sessionKeys.length;
        } catch (error) {
            logger.error('SESSION_COORDINATOR_COUNT_ERROR', {
                error: error instanceof Error ? error.message : String(error),
            });
            return 0;
        }
    }

    async acquireLock(sessionId: string, ttl: number = LOCK_TTL): Promise<boolean> {
        const result = await this.redis.set(
            `${LOCK_PREFIX}${sessionId}`,
            this.nodeId,
            'PX',
            ttl * 1000,
            'NX'
        );
        return result === 'OK';
    }

    async releaseLock(sessionId: string): Promise<void> {
        const lockKey = `${LOCK_PREFIX}${sessionId}`;
        const owner = await this.redis.get(lockKey);
        if (owner === this.nodeId) {
            await this.redis.del(lockKey);
        }
    }

    async extendLock(sessionId: string, ttl: number = LOCK_TTL): Promise<boolean> {
        const lockKey = `${LOCK_PREFIX}${sessionId}`;
        const owner = await this.redis.get(lockKey);
        if (owner === this.nodeId) {
            await this.redis.pexpire(lockKey, ttl * 1000);
            return true;
        }
        return false;
    }

    async detectZombieSessions(): Promise<DistributedSession[]> {
        const zombies: DistributedSession[] = [];
        const instanceSessions = await this.getActiveSessionsForInstance();

        for (const sessionId of instanceSessions) {
            const hb = await this.redis.get(`${HEARTBEAT_PREFIX}${sessionId}`);
            const session = await this.getSession(sessionId);

            if (!session) {
                await this.redis.srem(`${SESSION_PREFIX}instance:${this.nodeId}`, sessionId);
                continue;
            }

            const now = Date.now();
            const sessionAgeMs = now - (session.startTime || now);
            const hbAgeMs = hb ? now - parseInt(hb, 10) : null;

            // Missing Redis heartbeat right after register — normal until first 15s cycle
            if (hbAgeMs === null && sessionAgeMs < SESSION_START_GRACE_MS) {
                continue;
            }

            if (
                hbAgeMs !== null &&
                hbAgeMs > ZOMBIE_HEARTBEAT_MS &&
                session.status === 'active'
            ) {
                session.status = 'zombie';
                logger.warn('SESSION_COORD_ZOMBIE_DETECTED', {
                    sessionId,
                    tenantId: session.tenantId,
                    heartbeatAgeMs: hbAgeMs,
                    sessionAgeMs,
                    nodeId: this.nodeId,
                });
                await this.redis.setex(
                    `${SESSION_PREFIX}${sessionId}`,
                    SESSION_TTL,
                    JSON.stringify(session)
                );
                continue;
            }

            if (
                sessionAgeMs > SESSION_START_GRACE_MS &&
                (hbAgeMs === null || hbAgeMs > ORPHAN_HEARTBEAT_MS)
            ) {
                session.status = 'orphan';
                logger.error('SESSION_COORD_ORPHAN_DETECTED', {
                    sessionId,
                    tenantId: session.tenantId,
                    heartbeatAgeMs: hbAgeMs,
                    sessionAgeMs,
                    nodeId: this.nodeId,
                });
                zombies.push(session);
                await this.redis.setex(
                    `${SESSION_PREFIX}${sessionId}`,
                    60,
                    JSON.stringify(session)
                );
            }
        }

        return zombies;
    }

    async adoptOrphanSessions(): Promise<DistributedSession[]> {
        const adopted: DistributedSession[] = [];
        
        try {
            const { keys } = await scanKeys({
                pattern: `${SESSION_PREFIX}*`,
                batchSize: 100,
                timeoutMs: 10000,
            });
            
            const sessionKeys = keys.filter(k =>
                !k.includes(':tenant:') &&
                !k.includes(':instance:') &&
                !k.includes(':lock:')
            );

            const sessionPipeline = this.redis.pipeline();
            for (const key of sessionKeys) sessionPipeline.get(key);
            const sessionResults = await sessionPipeline.exec();

            for (let i = 0; i < sessionKeys.length; i++) {
                const key = sessionKeys[i];
                const raw = sessionResults?.[i]?.[1] as string | null;
                if (!raw) continue;

                try {
                    const session: DistributedSession = JSON.parse(raw);
                    if (session.instanceId === this.nodeId) continue;

                    const hb = await this.redis.get(`${HEARTBEAT_PREFIX}${session.sessionId}`);
                    if (hb) continue;

                    const hbAge = hb ? Date.now() - parseInt(hb, 10) : Infinity;
                    if (hbAge < 30000) continue;

                    const acquired = await this.acquireLock(session.sessionId);
                    if (!acquired) continue;

                    try {
                        session.instanceId = this.nodeId;
                        session.status = 'active';
                        session.reconnectCount = (session.reconnectCount || 0) + 1;
                        await this.redis.setex(
                            `${SESSION_PREFIX}${session.sessionId}`,
                            SESSION_TTL,
                            JSON.stringify(session)
                        );
                        await this.redis.sadd(`${SESSION_PREFIX}instance:${this.nodeId}`, session.sessionId);

                        logger.info('SESSION_COORD_ADOPTED', {
                            sessionId: session.sessionId,
                            tenantId: session.tenantId,
                            previousInstance: session.nodeId,
                            nodeId: this.nodeId,
                            reconnectCount: session.reconnectCount,
                        });

                        adopted.push(session);
                    } finally {
                        await this.releaseLock(session.sessionId);
                    }
                } catch (error) {
                    logger.error('SESSION_ADOPTION_ERROR', {
                        key,
                        error: error instanceof Error ? error.message : String(error),
                    });
                }
            }

            return adopted;
        } catch (error) {
            logger.error('ADOPT_ORPHAN_SESSIONS_ERROR', {
                error: error instanceof Error ? error.message : String(error),
            });
            return adopted;
        }
    }

    startHeartbeat(intervalMs: number = 15000): void {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
        }

        this.heartbeatTimer = setInterval(async () => {
            try {
                const sessions = await this.getActiveSessionsForInstance();
                for (const sessionId of sessions) {
                    await this.sendHeartbeat(sessionId);
                }
                logger.debug('SESSION_HEARTBEAT_SENT', {
                    nodeId: this.nodeId,
                    sessionCount: sessions.length,
                });
            } catch (err) {
                logger.error('SESSION_HEARTBEAT_CYCLE_ERROR', { error: String(err) });
            }
        }, intervalMs);

        this.heartbeatTimer.unref();
    }

    startCleanup(intervalMs: number = 30000): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }

        this.cleanupTimer = setInterval(async () => {
            try {
                const stale = await this.detectZombieSessions();
                for (const entry of stale) {
                    if (entry.status !== 'orphan') {
                        continue;
                    }
                    logger.warn('SESSION_COORD_CLEANING_ORPHAN', {
                        sessionId: entry.sessionId,
                        tenantId: entry.tenantId,
                        status: entry.status,
                    });
                    await this.unregisterSession(entry.sessionId, 'orphan-cleanup');
                }
            } catch (err) {
                logger.error('SESSION_COORD_CLEANUP_ERROR', { error: String(err) });
            }
        }, intervalMs);

        this.cleanupTimer.unref();
    }

    stop(): void {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
        this.redis.disconnect();
        logger.info('SESSION_COORDINATOR_STOPPED', { nodeId: this.nodeId });
    }
}

export const sessionCoordinator = new SessionCoordinator();
