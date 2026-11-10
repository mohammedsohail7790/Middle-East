/**
 * The provider-key check: classification of the provider's answers, and the guarantee that the key never leaves it. The network is a
 * stub: this does not prove the real provider's behaviour, and `ok` never proves that credit is available.
 */
import { describe, it, expect, vi } from 'vitest';
// @ts-expect-error plain ES module without type declarations
import { classifyOpenAiResponse, probeOpenAiKey, probeRealtimeResponse, PROBE_STATUS } from '../../../scripts/lib/provider-probe.mjs';

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
    expect(src).toMatch(/console\.log\(JSON\.stringify\(\{ check: 'key', provider: 'openai', model, \.\.\.result/);
    expect(src).toMatch(/console\.log\(JSON\.stringify\(\{ check: 'model_response', provider: 'openai', model, \.\.\.r \}\)\)/);
    expect(src).not.toMatch(/console\.(log|error|warn)\([^)]*OPENAI_API_KEY/);
    expect(src).not.toMatch(/JSON\.stringify\(\{[^}]*\bkey\s*[,}]/);
  });
});

/** Fake Realtime socket: replays `events` after the first send; the real provider is NOT contacted (MOCKED). */
function fakeSocket(script: (send: (m: unknown) => void, sent: any[]) => void, opts: { rejectStatus?: number } = {}) {
  const handlers: Record<string, ((...a: any[]) => void)[]> = {};
  const sent: any[] = [];
  const emit = (n: string, ...a: any[]) => (handlers[n] ?? []).forEach((h) => h(...a));
  const ws: any = {
    on: (n: string, h: (...a: any[]) => void) => { (handlers[n] ??= []).push(h); return ws; },
    send: (m: string) => { sent.push(JSON.parse(m)); script((e) => emit('message', JSON.stringify(e)), sent); },
    close: vi.fn(),
  };
  setTimeout(() => (opts.rejectStatus ? emit('unexpected-response', {}, { statusCode: opts.rejectStatus }) : emit('message', JSON.stringify({ type: 'session.created' }))), 0);
  return { ws, sent };
}

describe('probeRealtimeResponse (MOCKED socket)', () => {
  const run = (script: Parameters<typeof fakeSocket>[0], opts?: Parameters<typeof fakeSocket>[1]) => {
    const s = fakeSocket(script, opts);
    const factory = vi.fn(async () => s.ws);
    return probeRealtimeResponse({ key: 'k-secret-not-real', wsFactory: factory, timeoutMs: 500 }).then((r: unknown) => ({ r, s, factory }));
  };

  it('no key => no_key and no socket', async () => {
    const factory = vi.fn();
    expect(await probeRealtimeResponse({ key: '', wsFactory: factory })).toEqual({ status: 'no_key', httpStatus: 0, responded: false });
    expect(factory).not.toHaveBeenCalled();
  });

  it('a completed text answer => ok + responded, one request only, text-only, and the text/key never returned', async () => {
    const { r, s, factory } = await run((send) => { send({ type: 'response.output_text.delta', delta: 'OK' }); send({ type: 'response.done', response: { status: 'completed' } }); });
    expect(r).toEqual({ status: 'ok', httpStatus: 200, responded: true });
    expect(s.sent).toHaveLength(1);
    expect(s.sent[0].response.output_modalities).toEqual(['text']);
    expect(JSON.stringify(r)).not.toMatch(/k-secret|"OK"/);
    expect((factory.mock.calls[0] as unknown as any[])[1].headers.Authorization).toBe('Bearer k-secret-not-real');
    expect(s.ws.close).toHaveBeenCalled();
  });

  it('completed with no text is NOT a proven answer', async () => {
    const { r } = await run((send) => send({ type: 'response.done', response: { status: 'completed', output: [] } }));
    expect(r).toMatchObject({ status: 'unexpected', responded: false });
  });

  it.each([
    ['insufficient_quota', 'quota_exhausted'],
    ['invalid_api_key', 'invalid_key'],
    ['model_not_found', 'model_not_available'],
  ])('an in-session error %s => %s', async (code, expected) => {
    const { r } = await run((send) => send({ type: 'error', error: { code } }));
    expect(r).toMatchObject({ status: expected, responded: false });
  });

  it('a failed response carries its provider code', async () => {
    const { r } = await run((send) => send({ type: 'response.done', response: { status: 'failed', status_details: { error: { code: 'insufficient_quota' } } } }));
    expect(r).toMatchObject({ status: 'quota_exhausted', responded: false });
  });

  it.each([[401, 'invalid_key'], [403, 'forbidden'], [404, 'model_not_available']])('handshake rejected with HTTP %s => %s', async (status, expected) => {
    const { r } = await run(() => undefined, { rejectStatus: status as number });
    expect(r).toMatchObject({ status: expected, httpStatus: status, responded: false });
  });

  it('silence => provider_unavailable after the timeout, never hangs', async () => {
    const { r } = await run(() => undefined);
    expect(r).toMatchObject({ status: 'provider_unavailable', responded: false });
  });
});
