import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));

import { lookup } from 'node:dns/promises';
import {
  assertSafePublicUrl,
  assertSafeWebhookUrl,
  HostResolutionError,
  isUnsafeIp,
  normalizeHostname,
} from '../../../apps/gateway/src/security/ssrf-guard.js';

const dns = lookup as unknown as ReturnType<typeof vi.fn>;
const resolvesTo = (...addresses: string[]) =>
  dns.mockResolvedValue(addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })));

describe('ssrf-guard: literal host rules (no DNS)', () => {
  it.each([
    // IPv4
    'https://127.0.0.1/',
    'https://127.0.0.2/',
    'https://127.255.255.254/',
    'https://10.0.0.1/',
    'https://172.16.0.1/',
    'https://172.31.255.255/',
    'https://192.168.1.1/',
    'https://169.254.1.1/',
    'https://169.254.169.253/',
    'https://169.254.169.254/latest/meta-data',
    'https://100.64.0.1/',
    'https://100.127.255.255/',
    'https://0.0.0.0/',
    'https://192.0.0.1/',
    'https://224.0.0.1/',
    'https://255.255.255.255/',
    // IPv6
    'https://[::1]/',
    'https://[::]/',
    'https://[fc00::1]/',
    'https://[fd00::1]/',
    'https://[fe80::1]/',
    'https://[::ffff:127.0.0.1]/',
    'https://[::ffff:10.0.0.1]/',
    'https://[64:ff9b::7f00:1]/',
    // encodings that WHATWG URL normalises to dotted IPv4
    'https://2130706433/',
    'https://0x7f.0.0.1/',
    'https://127.1/',
    // names
    'https://localhost/',
    'https://localhost./',
    'https://LOCALHOST/',
    'https://foo.localhost/',
    'https://foo.localhost./',
    'https://metadata.google.internal/',
    'https://metadata.google.internal./',
    'https://db.internal/',
    'https://printer.local/',
    'https://intranet/',
    'https://metadata/',
  ])('blocks %s', (url) => {
    expect(() => assertSafePublicUrl(url, { requireHttps: true })).toThrow();
  });

  it('rejects plain http when https is required, allows it otherwise (non-webhook callers)', () => {
    expect(() => assertSafePublicUrl('http://public.example.com/', { requireHttps: true })).toThrow(/https/);
    expect(() => assertSafePublicUrl('http://public.example.com/')).not.toThrow();
    expect(() => assertSafePublicUrl('https://public.example.com/', { requireHttps: true })).not.toThrow();
  });

  it('rejects non-http(s) schemes, malformed URLs and embedded credentials', () => {
    expect(() => assertSafePublicUrl('file:///etc/passwd')).toThrow();
    expect(() => assertSafePublicUrl('gopher://example.com/')).toThrow();
    expect(() => assertSafePublicUrl('not a url')).toThrow(/Invalid URL/);
    expect(() => assertSafePublicUrl('https://user:pass@example.com/', { requireHttps: true })).toThrow(/credentials/);
  });

  it('is not fooled by userinfo that looks like a public host', () => {
    expect(() => assertSafePublicUrl('https://example.com@127.0.0.1/', { requireHttps: true })).toThrow();
  });

  it.each(['https://klaros.example.com/hook', 'https://8.8.8.8/', 'https://[2606:4700:4700::1111]/'])(
    'allows public destination %s',
    (url) => {
      expect(() => assertSafePublicUrl(url, { requireHttps: true })).not.toThrow();
    }
  );

  it('normalizes hostnames (case, brackets, trailing dots)', () => {
    expect(normalizeHostname('LocalHost.')).toBe('localhost');
    expect(normalizeHostname('[::1]')).toBe('::1');
    expect(normalizeHostname('example.com..')).toBe('example.com');
  });

  it('isUnsafeIp treats non-IPs as unsafe and recognises boundary addresses', () => {
    expect(isUnsafeIp('not-an-ip')).toBe(true);
    expect(isUnsafeIp('100.63.255.255')).toBe(false);
    expect(isUnsafeIp('100.64.0.0')).toBe(true);
    expect(isUnsafeIp('172.15.255.255')).toBe(false);
    expect(isUnsafeIp('172.32.0.0')).toBe(false);
    expect(isUnsafeIp('fe80::1%eth0')).toBe(true);
    expect(isUnsafeIp('2606:4700:4700::1111')).toBe(false);
  });
});

describe('ssrf-guard: assertSafeWebhookUrl (DNS resolution)', () => {
  beforeEach(() => {
    dns.mockReset();
  });

  it('allows a hostname that resolves only to public addresses and returns them for pinning', async () => {
    resolvesTo('93.184.216.34', '2606:2800:220:1:248:1893:25c8:1946');
    const target = await assertSafeWebhookUrl('https://klaros.example.com/webhooks/halla');
    expect(target.url.hostname).toBe('klaros.example.com');
    expect(target.addresses).toEqual(['93.184.216.34', '2606:2800:220:1:248:1893:25c8:1946']);
  });

  it('rejects a hostname that resolves to a private address', async () => {
    resolvesTo('10.1.2.3');
    await expect(assertSafeWebhookUrl('https://rebind.example.com/')).rejects.toThrow(/disallowed address/);
  });

  it.each([['127.0.0.1'], ['169.254.169.254'], ['100.64.0.9'], ['::1'], ['fd12::1'], ['::ffff:7f00:1']])(
    'rejects a hostname resolving to %s',
    async (address) => {
      resolvesTo(address);
      await expect(assertSafeWebhookUrl('https://rebind.example.com/')).rejects.toThrow(/disallowed address/);
    }
  );

  it('rejects when ANY resolved address is unsafe (public + private mix)', async () => {
    resolvesTo('93.184.216.34', '192.168.0.10');
    await expect(assertSafeWebhookUrl('https://mixed.example.com/')).rejects.toThrow(/disallowed address/);
  });

  it('does not call DNS for literal-unsafe names (rejected before any lookup)', async () => {
    for (const url of ['https://localhost/', 'https://localhost./', 'https://foo.localhost/', 'https://metadata.google.internal./', 'https://[::1]/']) {
      await expect(assertSafeWebhookUrl(url)).rejects.toThrow();
    }
    expect(dns).not.toHaveBeenCalled();
  });

  it('rejects plain http before any lookup', async () => {
    await expect(assertSafeWebhookUrl('http://public.example.com/')).rejects.toThrow(/https/);
    expect(dns).not.toHaveBeenCalled();
  });

  it('treats an unresolvable host as a retryable HostResolutionError, not a permanent block', async () => {
    dns.mockRejectedValue(Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }));
    await expect(assertSafeWebhookUrl('https://nonexistent.example.com/')).rejects.toBeInstanceOf(HostResolutionError);
    dns.mockResolvedValue([]);
    await expect(assertSafeWebhookUrl('https://empty.example.com/')).rejects.toBeInstanceOf(HostResolutionError);
  });

  it('skips DNS for a public IP literal and pins that address', async () => {
    const target = await assertSafeWebhookUrl('https://8.8.8.8/hook');
    expect(target.addresses).toEqual(['8.8.8.8']);
    expect(dns).not.toHaveBeenCalled();
  });

  it('rejects unusual ports', async () => {
    resolvesTo('93.184.216.34');
    await expect(assertSafeWebhookUrl('https://klaros.example.com:6379/')).rejects.toThrow(/port/);
    await expect(assertSafeWebhookUrl('https://klaros.example.com:8443/')).resolves.toBeTruthy();
    await expect(assertSafeWebhookUrl('https://klaros.example.com:443/')).resolves.toBeTruthy();
  });

  it('surfaces as a 400-mapped error (name ValidationError), not a 500', async () => {
    const err = await assertSafeWebhookUrl('https://localhost/').catch((e) => e);
    expect(err.name).toBe('ValidationError');
  });
});
