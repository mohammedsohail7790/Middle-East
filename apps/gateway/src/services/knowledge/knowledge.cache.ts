import type { Redis } from 'ioredis';
import { createHash } from 'crypto';
import { createRedisClient } from '../redis-connection.js';
import { logger } from '../logger.js';
import { scanKeys, deleteByPattern } from '../redis-scan.js';

const CACHE_PREFIX = 'calliq:kb:cache:';
const CACHE_TTL = 300;

interface CachedResult {
    results: Array<{ content: string; category: string }>;
    cachedAt: number;
    hitCount: number;
}

export class KnowledgeCache {
    private redis: Redis;

    constructor(redisUrl?: string) {
        const url = redisUrl || process.env.REDIS_URL;
        if (!url) {
            logger.warn('KNOWLEDGE_CACHE_NO_REDIS', { message: 'Redis not configured, cache disabled' });
            this.redis = null as any;
            return;
        }
        this.redis = createRedisClient(url, { label: 'knowledge-cache' });
    }

    private cacheKey(query: string, tenantId: string): string {
        const hash = createHash('sha256').update(`${tenantId}:${query.toLowerCase().trim()}`).digest('hex');
        return `${CACHE_PREFIX}${hash}`;
    }

    async get(query: string, tenantId: string): Promise<CachedResult | null> {
        if (!this.redis) return null;

        try {
            const raw = await this.redis.get(this.cacheKey(query, tenantId));
            if (!raw) return null;

            const parsed: CachedResult = JSON.parse(raw);
            parsed.hitCount = (parsed.hitCount || 0) + 1;

            await this.redis.setex(this.cacheKey(query, tenantId), CACHE_TTL, JSON.stringify(parsed));

            logger.debug('KNOWLEDGE_CACHE_HIT', {
                tenantId,
                query: query.slice(0, 50),
                hitCount: parsed.hitCount,
            });

            return parsed;
        } catch {
            return null;
        }
    }

    async set(query: string, tenantId: string, results: Array<{ content: string; category: string }>): Promise<void> {
        if (!this.redis) return;

        try {
            const cached: CachedResult = {
                results,
                cachedAt: Date.now(),
                hitCount: 0,
            };

            await this.redis.setex(this.cacheKey(query, tenantId), CACHE_TTL, JSON.stringify(cached));
        } catch {
            // Cache write failure is non-critical
        }
    }

    async invalidate(tenantId: string, category?: string): Promise<void> {
        if (!this.redis) return;

        try {
            if (category) {
                // For category-specific invalidation, we need to check each key
                const { keys } = await scanKeys({
                    pattern: `${CACHE_PREFIX}*`,
                    batchSize: 100,
                    timeoutMs: 10000,
                });
                
                if (keys.length === 0) return;

                const matching: string[] = [];
                for (const key of keys) {
                    const raw = await this.redis.get(key);
                    if (!raw) continue;
                    try {
                        const parsed = JSON.parse(raw);
                        const hasCategory = parsed.results?.some((r: any) => r.category === category);
                        if (hasCategory) matching.push(key);
                    } catch { /* skip */ }
                }
                
                if (matching.length > 0) {
                    await this.redis.del(...matching);
                }

                logger.debug('KNOWLEDGE_CACHE_INVALIDATED', {
                    tenantId,
                    category,
                    keysRemoved: matching.length,
                });
            } else {
                // For full invalidation, use deleteByPattern
                const { deleted, durationMs } = await deleteByPattern({
                    pattern: `${CACHE_PREFIX}*`,
                    batchSize: 100,
                    timeoutMs: 10000,
                });

                logger.debug('KNOWLEDGE_CACHE_INVALIDATED', {
                    tenantId,
                    keysRemoved: deleted,
                    durationMs,
                });
            }
        } catch (err) {
            logger.debug('KNOWLEDGE_CACHE_INVALIDATE_ERROR', { error: String(err) });
        }
    }

    async getStats(): Promise<{ size: number }> {
        if (!this.redis) return { size: 0 };
        
        try {
            const { keys } = await scanKeys({
                pattern: `${CACHE_PREFIX}*`,
                batchSize: 100,
                timeoutMs: 5000,
            });
            
            return { size: keys.length };
        } catch (error) {
            logger.error('KNOWLEDGE_CACHE_STATS_ERROR', {
                error: error instanceof Error ? error.message : String(error),
            });
            return { size: 0 };
        }
    }

    destroy(): void {
        if (this.redis) {
            this.redis.disconnect();
        }
    }
}

export const knowledgeCache = new KnowledgeCache();
