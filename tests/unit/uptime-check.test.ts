import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error plain .mjs script with no type declarations
import { PROBES, evaluate, runProbes } from '../../scripts/uptime-check.mjs';

afterEach(() => vi.unstubAllGlobals());

const reply = (status: number, body: unknown = {}) => ({ status, clone: () => ({ json: async () => body }), json: async () => body });
const noWait = async () => {};

describe('what counts as up', () => {
  const probe = (name: string) => PROBES.find((p: { name: string }) => p.name.startsWith(name));

  it('gateway alive needs a 200', () => {
    expect(probe('gateway alive').check({ status: 200 })).toBe(true);
    expect(probe('gateway alive').check({ status: 502 })).toBe(false);
  });

  it('gateway ready needs a 200 and ready:true, so a half-working gateway is caught', () => {
    const ready = probe('gateway ready');
    expect(ready.check({ status: 200, json: { ready: true } })).toBe(true);
    expect(ready.check({ status: 200, json: { ready: false } })).toBe(false);
    expect(ready.check({ status: 503, json: { ready: false } })).toBe(false);
    expect(ready.check({ status: 200, json: undefined })).toBe(false);
  });

  it('the website needs a 200', () => {
    expect(probe('website').check({ status: 200 })).toBe(true);
    expect(probe('website').check({ status: 500 })).toBe(false);
  });
});

describe('the verdict', () => {
  it('is ok only when every probe is ok, and names what is down', () => {
    expect(evaluate([{ name: 'a', ok: true, status: 200, ms: 5 }, { name: 'b', ok: true, status: 200, ms: 7 }]).ok).toBe(true);
    const v = evaluate([{ name: 'a', ok: true, status: 200, ms: 5 }, { name: 'b', ok: false, status: 503, ms: 9 }, { name: 'c', ok: false, status: null, error: 'timed out' }]);
    expect(v.ok).toBe(false);
    expect(v.failed).toEqual(['b', 'c']);
    expect(v.summary).toContain('DOWN b: 503');
    expect(v.summary).toContain('DOWN c: no answer');
    expect(v.summary).toContain('timed out');
  });
});

describe('running the probes', () => {
  const one = [{ name: 'x', url: 'https://example.test/', check: (r: { status: number }) => r.status === 200 }];

  it('passes when the first answer is good', async () => {
    const f = vi.fn(async () => reply(200));
    vi.stubGlobal('fetch', f);
    const r = await runProbes({ probes: one, wait: noWait });
    expect(r[0].ok).toBe(true);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('retries once, so a single dropped request does not raise an alarm', async () => {
    const f = vi.fn().mockRejectedValueOnce(new Error('socket hang up')).mockResolvedValueOnce(reply(200));
    vi.stubGlobal('fetch', f);
    const r = await runProbes({ probes: one, wait: noWait });
    expect(r[0].ok).toBe(true);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('reports down after the retry also fails, with the reason', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(502)));
    const r = await runProbes({ probes: one, wait: noWait });
    expect(r[0]).toMatchObject({ ok: false, status: 502 });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('getaddrinfo ENOTFOUND'); }));
    const e = await runProbes({ probes: one, wait: noWait });
    expect(e[0]).toMatchObject({ ok: false, status: null });
    expect(e[0].error).toMatch(/ENOTFOUND/);
  });

  it('checks every probe even when an earlier one is down', async () => {
    const probes = [
      { name: 'down', url: 'https://a.test/', check: () => false },
      { name: 'up', url: 'https://b.test/', check: () => true },
    ];
    vi.stubGlobal('fetch', vi.fn(async () => reply(200)));
    const r = await runProbes({ probes, wait: noWait });
    expect(r.map((x: { name: string; ok: boolean }) => [x.name, x.ok])).toEqual([['down', false], ['up', true]]);
  });
});
