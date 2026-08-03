import { Redis, type RedisOptions } from 'ioredis';
import { logger } from './logger.js';

/** TLS only when URL scheme is rediss:// (do not force TLS on redis:// — Railway TCP proxy times out). */
export function redisUsesTls(url: string): boolean {
    if (process.env.REDIS_TLS === 'true') return true;
    if (process.env.REDIS_TLS === 'false') return false;
    return url.startsWith('rediss://');
}

/** Host:port for logs — never log credentials. */
export function redisEndpointForLog(url: string): string {
    try {
        const normalized = url.replace(/^rediss?:\/\//, 'http://');
        const u = new URL(normalized);
        return `${u.hostname}:${u.port || '6379'}`;
    } catch {
        return 'unknown';
    }
}

export type CreateRedisOptions = {
    /** BullMQ requires maxRetriesPerRequest: null */
    bullmq?: boolean;
    /** Log label for connection errors */
    label?: string;
};

/**
 * Render's internal private-network Redis hostnames are bare service IDs
 * with no domain suffix (e.g. "red-xxxx"), reachable only from other
 * services in the same private network — access control there is network
 * isolation, not Redis AUTH, and the `default` user has no password to set.
 * Public/external hostnames always include a domain (a dot).
 */
function isUnauthenticatedNetworkIsolatedHost(url: string): boolean {
    try {
        const normalized = url.replace(/^rediss?:\/\//, 'http://');
        const hostname = new URL(normalized).hostname;
        return Boolean(hostname) && !hostname.includes('.');
    } catch {
        return false;
    }
}

export function redisConnectionOptions(url: string, opts: CreateRedisOptions = {}): RedisOptions {
    const tls = redisUsesTls(url);
    // Railway public proxy: dual-stack DNS (see Railway docs — append ?family=0 to URL or set REDIS_FAMILY=0)
    const family =
        process.env.REDIS_FAMILY === '0' || /[?&]family=0/i.test(url) ? 0 : undefined;

    // Support explicit REDIS_PASSWORD env var in addition to password embedded in the URL.
    // The URL already carries the password when using managed Redis (Railway, Upstash, etc.),
    // but a separate env var is useful for environments where the URL is password-less.
    // Skip it for network-isolated internal hosts (e.g. Render's internal Redis) — that
    // `default` user has no password configured, and supplying one just trips ioredis's
    // own "password supplied but not required" warning for no security benefit.
    const explicitPassword = isUnauthenticatedNetworkIsolatedHost(url)
        ? undefined
        : process.env.REDIS_PASSWORD;

    // HIPAA: warn loudly if Redis has no password in production, unless access is already
    // restricted by network isolation (Render's internal private network).
    if (
        !explicitPassword &&
        !url.match(/:[^@]+@/) &&   // no password in URL
        !isUnauthenticatedNetworkIsolatedHost(url) &&
        (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging')
    ) {
        logger.warn('REDIS_NO_PASSWORD', {
            hint: 'Set REDIS_PASSWORD or include credentials in REDIS_URL. ' +
                  'Unauthenticated Redis exposes PHI cached in sessions and CSRF tokens.',
        });
    }

    return {
        ...(tls ? { tls: {} } : {}),
        ...(family === 0 ? { family: 0 as const } : {}),
        ...(explicitPassword ? { password: explicitPassword } : {}),
        connectTimeout: 30_000,
        keepAlive: 30_000,
        enableReadyCheck: !opts.bullmq,
        maxRetriesPerRequest: opts.bullmq ? null : 3,
        enableOfflineQueue: true,
        retryStrategy: (times) => {
            if (times > 25) return null;
            return Math.min(times * 200, 3_000);
        },
        reconnectOnError: (err) => {
            const msg = String((err as Error).message ?? err);
            return (
                msg.includes('ECONNRESET') ||
                msg.includes('ETIMEDOUT') ||
                msg.includes('ECONNREFUSED') ||
                msg.includes('READONLY')
            );
        },
    };
}

export function createRedisClient(
    url?: string,
    opts: CreateRedisOptions = {}
): Redis {
    const redisUrl = url ?? process.env.REDIS_URL;
    if (!redisUrl) {
        throw new Error('REDIS_URL is not set');
    }

    const label = opts.label ?? 'redis';
    const client = new Redis(redisUrl, redisConnectionOptions(redisUrl, opts));

    client.on('error', (err) => {
        logger.warn('REDIS_CLIENT_ERROR', {
            label,
            endpoint: redisEndpointForLog(redisUrl),
            error: String(err),
        });
    });

    client.on('connect', () => {
        logger.info('REDIS_CLIENT_CONNECTED', {
            label,
            endpoint: redisEndpointForLog(redisUrl),
            tls: redisUsesTls(redisUrl),
        });
    });

    return client;
}
