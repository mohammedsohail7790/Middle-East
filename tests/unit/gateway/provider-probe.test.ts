/**
 * The provider-key check: classification of the provider's answers, and the guarantee that the key never leaves it. The network is a
 * stub: this does not prove the real provider's behaviour, and `ok` never proves that credit is available.
 */
import { describe, it, expect, vi } from 'vitest';
// @ts-expect-error plain ES module without type declarations
import { classifyOpenAiResponse, probeOpenAiKey, PROBE_STATUS } from '../../../scripts/lib/provider-probe.mjs';

const body = (code: string) => JSON.stringify({ error: { code, message: 'x' } });

describe('classifyOpenAiResponse', () => {
  it.each([
    [200, '', PROBE_STATUS.OK],
    [401, body('invalid_api_key'), PROBE_STATUS.INVALID_KEY],
    [401, '', PROBE_STATUS.INVALID_KEY],
    [429, body('insufficient_quota'), PROBE_STATUS.QUOTA_EXHAUSTED],
    [429, body('rate_limit_exceeded'), PROBE_STATUS.RATE_LIMITED],
    [429, '', PROBE_STATUS.RATE_LIMITED],
    [404, body('model_not_found'), PROBE_STATUS.MODEL_NOT_AVAILABLE],
    [403, '', PROBE_STATUS.FORBIDDEN],
    [500, '', PROBE_STATUS.PROVIDER_UNAVAILABLE],
    [503, 'not json', PROBE_STATUS.PROVIDER_UNAVAILABLE],
    [418, '', PROBE_STATUS.UNEXPECTED],
  ])('HTTP %s %s -> %s', (status, text, expected) => {
    expect(classifyOpenAiResponse(status, text)).toBe(expected);
  });
});

describe('probeOpenAiKey', () => {
  const fake = (status: number, text = '') => vi.fn(async () => ({ status, text: async () => text }) as unknown as Response);

  it('no key => no_key and no request at all', async () => {
    const f = fake(200);
    expect(await probeOpenAiKey({ key: '', fetchImpl: f })).toEqual({ status: 'no_key', httpStatus: 0 });
    expect(await probeOpenAiKey({ key: undefined, fetchImpl: f })).toEqual({ status: 'no_key', httpStatus: 0 });
    expect(f).not.toHaveBeenCalled();
  });

  it('sends one GET to the model endpoint with the key as a Bearer header, and returns ONLY a status and an HTTP code', async () => {
    const SECRET = 'sk-test-0123456789abcdef-NOT-REAL';
    const f = fake(200, JSON.stringify({ id: 'gpt-realtime', echoed: SECRET }));
    const r = await probeOpenAiKey({ key: SECRET, model: 'gpt-realtime', fetchImpl: f });
    expect(r).toEqual({ status: 'ok', httpStatus: 200 });
    expect(JSON.stringify(r)).not.toContain(SECRET);
    const [url, init] = (f.mock.calls[0] as unknown) as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/models/gpt-realtime');
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${SECRET}`);
    expect(init.body).toBeUndefined();
  });

  it('an invalid key, an exhausted quota and an outage are reported as such', async () => {
    expect((await probeOpenAiKey({ key: 'k', fetchImpl: fake(401, body('invalid_api_key')) })).status).toBe('invalid_key');
    expect((await probeOpenAiKey({ key: 'k', fetchImpl: fake(429, body('insufficient_quota')) })).status).toBe('quota_exhausted');
    expect((await probeOpenAiKey({ key: 'k', fetchImpl: fake(502) })).status).toBe('provider_unavailable');
  });

  it('a network error or timeout is provider_unavailable and does not throw', async () => {
    const boom = vi.fn(async () => { throw new Error('ECONNRESET'); });
    expect(await probeOpenAiKey({ key: 'k', fetchImpl: boom })).toEqual({ status: 'provider_unavailable', httpStatus: 0 });
  });

  it('the script prints no key: its output line is built from the result only', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('scripts/check-provider-key.mjs', 'utf8');
    expect(src).toMatch(/console\.log\(JSON\.stringify\(\{ provider: 'openai', model, \.\.\.result/);
    expect(src).not.toMatch(/console\.(log|error|warn)\([^)]*OPENAI_API_KEY/);
  });
});
