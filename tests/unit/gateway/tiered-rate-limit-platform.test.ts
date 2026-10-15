import { describe, it, expect, vi } from 'vitest';

// No Redis: the limiter falls back to its in-memory buckets.
vi.mock('../../../apps/gateway/src/services/voice/redis.client.js', () => ({
    voiceRedis: {
        eval: vi.fn().mockRejectedValue(new Error('no redis')),
    },
}));

import {
    isPlatformServerRoute,
    tieredRateLimitMiddleware,
} from '../../../apps/gateway/src/security/tiered-rate-limit.js';

function call(path: string, ip: string, method = 'POST') {
    const req: any = { originalUrl: `/api/v1${path}`, path, method, ip, headers: {}, header: () => undefined };
    const res: any = { headers: {} as Record<string, string>, statusCode: 200 };
    res.setHeader = (k: string, v: string) => { res.headers[k] = v; };
    res.status = (c: number) => { res.statusCode = c; return res; };
    res.json = () => res;
    const next = vi.fn();
    return tieredRateLimitMiddleware(req, res, next).then(() => ({ res, next }));
}

describe('Klaros platform routes rate limit', () => {
    it('recognises only the Klaros server-to-server routes', () => {
        expect(isPlatformServerRoute('/platform/klaros/provision')).toBe(true);
        expect(isPlatformServerRoute('/platform/klaros/phone')).toBe(true);
        expect(isPlatformServerRoute('/platform/other')).toBe(false);
        expect(isPlatformServerRoute('/calls')).toBe(false);
    });

    it('is not throttled by the 20/min anonymous bucket (shared Klaros egress IP)', async () => {
        let blocked = 0;
        for (let i = 0; i < 40; i++) {
            const { res } = await call('/platform/klaros/provision', '10.0.0.1');
            if (res.statusCode === 429) blocked += 1;
        }
        expect(blocked).toBe(0);
    });

    it('still has a ceiling of its own', async () => {
        let blocked = 0;
        for (let i = 0; i < 130; i++) {
            const { res } = await call('/platform/klaros/phone', '10.0.0.2');
            if (res.statusCode === 429) blocked += 1;
        }
        expect(blocked).toBeGreaterThan(0);
    });

    it('leaves the anonymous limit for other unauthenticated routes unchanged', async () => {
        let blocked = 0;
        for (let i = 0; i < 40; i++) {
            const { res } = await call('/some/public/route', '10.0.0.3');
            if (res.statusCode === 429) blocked += 1;
        }
        expect(blocked).toBeGreaterThan(0);
    });
});
