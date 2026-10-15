import { beforeEach, describe, expect, it, vi } from 'vitest';

// The limiter must count a request and give the counter an expiry in ONE atomic Redis step. Two separate commands (INCR then PEXPIRE) can leave a counter with no
// expiry if anything fails between them, and that counter then refuses the caller for as long as nobody deletes it.
const redis = vi.hoisted(() => ({
    eval: vi.fn(),
    incr: vi.fn(),
    pexpire: vi.fn(),
    pttl: vi.fn(),
}));

vi.mock('../../../apps/gateway/src/services/voice/redis.client.js', () => ({ voiceRedis: redis }));

import { checkLimit, respond429 } from '../../../apps/gateway/src/security/tiered-rate-limit.js';

describe('rate limiter: counting and expiry are one atomic step', () => {
    beforeEach(() => {
        redis.eval.mockReset();
        redis.incr.mockReset();
        redis.pexpire.mockReset();
        redis.pttl.mockReset();
    });

    it('counts and sets the expiry with a single script call, never as separate commands', async () => {
        redis.eval.mockResolvedValue([1, 60000]);
        const result = await checkLimit('anon:1.2.3.4', 20, 60_000);
        expect(result.allowed).toBe(true);
        expect(redis.eval).toHaveBeenCalledTimes(1);
        const [script, keyCount, key, window] = redis.eval.mock.calls[0];
        expect(keyCount).toBe(1);
        expect(key).toBe('rl:anon:1.2.3.4');
        expect(window).toBe('60000');
        expect(script).toContain("redis.call('INCR'");
        expect(script).toContain("redis.call('PEXPIRE'");
        expect(redis.incr).not.toHaveBeenCalled();
        expect(redis.pexpire).not.toHaveBeenCalled();
    });

    it('repairs a counter that has no expiry: the script gives it one when PTTL is negative', async () => {
        redis.eval.mockResolvedValue([1, 60000]);
        await checkLimit('platform:10.0.0.1', 120, 60_000);
        const script = String(redis.eval.mock.calls[0][0]);
        expect(script).toMatch(/ttl\s*<\s*0/); // a key with no expiry is detected...
        expect(script).toMatch(/PEXPIRE/); // ...and given one on its next request
    });

    it('refuses once the limit is passed, and says how long to wait', async () => {
        redis.eval.mockResolvedValue([21, 42_000]);
        const result = await checkLimit('anon:1.2.3.4', 20, 60_000);
        expect(result.allowed).toBe(false);
        expect(result.retryAfterSec).toBe(42);
        const res: any = { headers: {} as Record<string, string>, statusCode: 200 };
        res.setHeader = (k: string, v: string) => { res.headers[k] = v; };
        res.status = (c: number) => { res.statusCode = c; return res; };
        res.json = () => res;
        respond429(res, result.retryAfterSec!);
        expect(res.statusCode).toBe(429);
        expect(res.headers['Retry-After']).toBe('42');
    });

    it('never reports a wait of zero or less, even if Redis returns no usable time', async () => {
        redis.eval.mockResolvedValue([99, -1]);
        const result = await checkLimit('anon:9.9.9.9', 20, 60_000);
        expect(result.allowed).toBe(false);
        expect(result.retryAfterSec).toBe(60);
    });

    it('falls back to the in-memory limiter when Redis is unavailable, and still enforces the limit', async () => {
        redis.eval.mockRejectedValue(new Error('connection lost'));
        let blocked = 0;
        for (let i = 0; i < 25; i++) {
            const result = await checkLimit('anon:fallback', 20, 60_000);
            if (!result.allowed) blocked += 1;
        }
        expect(blocked).toBe(5);
    });
});
