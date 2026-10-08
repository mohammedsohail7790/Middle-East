/**
 * Redis credentials must never reach a log line or an error message.
 *
 * Incident (staging, 2026-10-08): REDIS_URL held a pasted `redis-cli --tls -u redis://default:<password>@host:6379`
 * command. `new Redis(url)` threw a Node ERR_INVALID_URL TypeError whose `input` property is the raw value, and Node
 * printed it (password included) on the uncaught exception.
 *
 * Real: createRedisClient + ioredis against a tiny in-process RESP server (so "the connection still works" is a real
 * AUTH + PING round trip). Substituted: the logger (captured), and the TLS server (a TLS-enabled URL is only used to
 * check what gets logged).
 */
import net from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';

const logs = vi.hoisted(() => [] as Array<{ level: string; message: string; context: unknown }>);
vi.mock('../../../apps/gateway/src/services/logger.js', () => {
  const rec = (level: string) => (message: string, context?: unknown) => { logs.push({ level, message, context }); };
  return { logger: { info: rec('info'), warn: rec('warn'), error: rec('error'), debug: rec('debug') } };
});

import { createRedisClient, redactRedisUrls } from '../../../apps/gateway/src/services/redis-connection.js';

const PASSWORD = 'Sup3rSecretRedisPassw0rd';
const INCIDENT_VALUE = `redis-cli --tls -u redis://default:${PASSWORD}@delicate-quagga-212874.upstash.io:6379`;

const everythingLogged = () => JSON.stringify(logs);

/** Minimal RESP server: accepts AUTH <user> <password>, answers INFO (ready check), PING, and +OK to the rest. */
async function startFakeRedis(password: string) {
  let authenticated = false;
  const sockets = new Set<net.Socket>();
  const server = net.createServer((sock) => {
    sockets.add(sock);
    sock.on('close', () => sockets.delete(sock));
    sock.on('error', () => undefined);
    sock.on('data', (buf) => {
      const text = buf.toString();
      let out = '';
      for (const m of text.matchAll(/\*\d+\r\n\$\d+\r\n(\w+)\r\n/g)) {
        const cmd = m[1].toUpperCase();
        if (cmd === 'AUTH') { authenticated = text.includes(password); out += authenticated ? '+OK\r\n' : '-WRONGPASS invalid username-password pair\r\n'; }
        else if (cmd === 'PING') out += '+PONG\r\n';
        else if (cmd === 'INFO') { const body = 'redis_version:7.0.0\r\nloading:0\r\n'; out += `$${body.length}\r\n${body}\r\n`; }
        else out += '+OK\r\n';
      }
      if (out) sock.write(out);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as net.AddressInfo).port;
  return {
    port,
    isAuthenticated: () => authenticated,
    close: () => new Promise<void>((resolve) => { sockets.forEach((s) => s.destroy()); server.close(() => resolve()); }),
  };
}

afterEach(() => { logs.length = 0; });

describe('redactRedisUrls', () => {
  it('replaces redis:// and rediss:// URLs anywhere in a string', () => {
    const text = `failed: rediss://default:${PASSWORD}@host.example.com:6379 and redis://u:${PASSWORD}@10.0.0.1:6379 end`;
    const out = redactRedisUrls(text);
    expect(out).not.toContain(PASSWORD);
    expect(out).not.toContain('host.example.com');
    expect(out).toContain('redis://<redacted>');
    expect(out).toContain('failed:');
  });
  it('leaves text without a Redis URL unchanged', () => {
    expect(redactRedisUrls('read ECONNRESET')).toBe('read ECONNRESET');
  });
});

describe('createRedisClient with a malformed REDIS_URL (the incident)', () => {
  it('throws, and the error never carries the pasted value, the password or the host', () => {
    let caught: Error | undefined;
    try { createRedisClient(INCIDENT_VALUE, { label: 'cache' }); } catch (e) { caught = e as Error; }
    expect(caught).toBeInstanceOf(Error);
    const everything = [
      caught!.message,
      caught!.stack ?? '',
      JSON.stringify(caught, Object.getOwnPropertyNames(caught)),
      String((caught as { cause?: unknown }).cause ?? ''),
      ...Object.values(caught as unknown as Record<string, unknown>).map(String),
    ].join('\n');
    expect(everything).not.toContain(PASSWORD);
    expect(everything).not.toContain('upstash');
    expect(everything).not.toContain('redis://default');
    expect(Object.keys(caught as object)).not.toContain('input'); // the property Node prints for ERR_INVALID_URL
    expect(caught!.message).toContain('Invalid Redis URL');
    expect(everythingLogged()).not.toContain(PASSWORD);
  });
});

describe('createRedisClient with a valid REDIS_URL', () => {
  it('still connects and authenticates (real AUTH + PING), and logs only host:port and the TLS state', async () => {
    const fake = await startFakeRedis(PASSWORD);
    const client = createRedisClient(`redis://default:${PASSWORD}@127.0.0.1:${fake.port}`, { label: 'cache' });
    try {
      await new Promise<void>((resolve, reject) => { client.once('ready', () => resolve()); client.once('error', reject); });
      expect(await client.ping()).toBe('PONG');
      expect(fake.isAuthenticated()).toBe(true);

      const connected = logs.find((l) => l.message === 'REDIS_CLIENT_CONNECTED');
      expect(connected?.context).toEqual({ label: 'cache', endpoint: `127.0.0.1:${fake.port}`, tls: false });
      const all = everythingLogged();
      expect(all).not.toContain(PASSWORD);
      expect(all).not.toContain('redis://');
      expect(all).not.toContain('default:');
    } finally {
      client.disconnect();
      await fake.close();
    }
  });

  it('logs tls: true for a rediss:// URL without logging the URL or password', () => {
    const client = createRedisClient(`rediss://default:${PASSWORD}@127.0.0.1:1`, { label: 'cache' });
    try {
      client.emit('connect'); // the TLS server itself is not under test; this exercises the log call
      const connected = logs.filter((l) => l.message === 'REDIS_CLIENT_CONNECTED').pop();
      expect(connected?.context).toEqual({ label: 'cache', endpoint: '127.0.0.1:1', tls: true });
      const all = everythingLogged();
      expect(all).not.toContain(PASSWORD);
      expect(all).not.toContain('rediss://');
    } finally {
      client.disconnect();
    }
  });

  it('redacts a Redis URL that appears inside a runtime client error', () => {
    const client = createRedisClient(`rediss://default:${PASSWORD}@127.0.0.1:1`, { label: 'cache' });
    try {
      client.emit('error', new Error(`boom rediss://default:${PASSWORD}@some-host.example.com:6379 exploded`));
      const errorLog = logs.filter((l) => l.message === 'REDIS_CLIENT_ERROR' && JSON.stringify(l.context).includes('boom')).pop();
      expect(errorLog).toBeDefined();
      const all = everythingLogged();
      expect(all).not.toContain(PASSWORD);
      expect(all).not.toContain('some-host.example.com');
      expect(all).toContain('redis://<redacted>');
    } finally {
      client.disconnect();
    }
  });
});
