import { voiceRedis } from './redis.client.js';
import { logger } from '../logger.js';

export class ConcurrencyGuard {
    private maxGlobal = Number(process.env.VOICE_MAX_GLOBAL_CONCURRENT_CALLS || 300);
    private maxTenant = Number(process.env.VOICE_MAX_TENANT_CONCURRENT_CALLS || 25);
    /**
     * TTL for concurrency keys.
     * Acts as a safety net for ghost slots left by crashes — keys auto-expire
     * even if release() was never called.  Default 120s covers the longest
     * plausible call + cleanup time.
     */
    private keyTtlSeconds = Number(process.env.VOICE_CONCURRENCY_KEY_TTL_SECONDS || 120);

    async tryAcquire(tenantId: string): Promise<boolean> {
        const globalKey = 'voice:concurrency:global';
        const tenantKey = `voice:concurrency:tenant:${tenantId}`;

        // Atomic check-and-increment — prevents race conditions between
        // concurrent acquire() calls on the same tenant.
        const lua = `
            local globalKey = KEYS[1]
            local tenantKey = KEYS[2]
            local maxGlobal = tonumber(ARGV[1])
            local maxTenant = tonumber(ARGV[2])
            local ttl = tonumber(ARGV[3])

            local globalCount = tonumber(redis.call("GET", globalKey) or "0")
            local tenantCount = tonumber(redis.call("GET", tenantKey) or "0")

            if globalCount >= maxGlobal or tenantCount >= maxTenant then
                return 0
            end

            redis.call("INCR", globalKey)
            redis.call("INCR", tenantKey)
            -- Refresh TTL on every acquire so active calls never silently expire
            redis.call("EXPIRE", globalKey, ttl)
            redis.call("EXPIRE", tenantKey, ttl)
            return 1
        `;

        const result = await voiceRedis.eval(
            lua, 2,
            globalKey, tenantKey,
            this.maxGlobal, this.maxTenant, this.keyTtlSeconds
        );
        return result === 1;
    }

    async release(tenantId: string): Promise<void> {
        const globalKey = 'voice:concurrency:global';
        const tenantKey = `voice:concurrency:tenant:${tenantId}`;

        // Decrement with floor at 0 — prevents negative counters caused by
        // double-release calls or crashes that skipped acquire.
        const lua = `
            local globalKey = KEYS[1]
            local tenantKey = KEYS[2]
            local ttl = tonumber(ARGV[1])

            local globalCount = tonumber(redis.call("GET", globalKey) or "0")
            local tenantCount = tonumber(redis.call("GET", tenantKey) or "0")

            if globalCount > 0 then
                redis.call("DECR", globalKey)
                redis.call("EXPIRE", globalKey, ttl)
            end
            if tenantCount > 0 then
                redis.call("DECR", tenantKey)
                redis.call("EXPIRE", tenantKey, ttl)
            end
            return 1
        `;
        await voiceRedis.eval(lua, 2, globalKey, tenantKey, this.keyTtlSeconds);
    }

    /**
     * Force-reset the counters to zero for a given tenant.
     * Used by the session watchdog when it detects orphaned sessions after a
     * gateway crash — prevents ghost slots from blocking legitimate calls for
     * the full TTL window.
     */
    async forceReset(tenantId: string): Promise<void> {
        const tenantKey = `voice:concurrency:tenant:${tenantId}`;
        try {
            await voiceRedis.del(tenantKey);
            // Leave global key intact — other tenants may still have live calls
            logger.info('CONCURRENCY_FORCE_RESET', { tenantId });
        } catch (err) {
            logger.warn('CONCURRENCY_FORCE_RESET_FAILED', { tenantId, error: String(err) });
        }
    }

    async getCurrentCounts(tenantId: string): Promise<{ global: number; tenant: number }> {
        const [g, t] = await Promise.all([
            voiceRedis.get('voice:concurrency:global'),
            voiceRedis.get(`voice:concurrency:tenant:${tenantId}`),
        ]);
        return {
            global: Math.max(0, parseInt(g || '0', 10)),
            tenant: Math.max(0, parseInt(t || '0', 10)),
        };
    }
}

export const concurrencyGuard = new ConcurrencyGuard();
