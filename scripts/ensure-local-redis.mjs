/**
 * Ensures Redis 5+ is reachable for local gateway / Playwright E2E.
 * Tries PLAYWRIGHT_REDIS_URL, then :6380 (Docker), then :6379 (local install).
 * Starts docker-compose.redis.yml when Docker is available.
 */
import { execSync, spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Redis from 'ioredis';

const root = dirname(fileURLToPath(import.meta.url));

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function candidateUrls() {
  const fromEnv = [
    process.env.PLAYWRIGHT_REDIS_URL?.trim(),
    process.env.E2E_REDIS_URL?.trim(),
  ].filter(Boolean);
  const defaults = ['redis://127.0.0.1:6380', 'redis://127.0.0.1:6379'];
  return [...new Set([...fromEnv, ...defaults])];
}

function parseRedisVersion(info) {
  const line = info.split('\n').find((l) => l.startsWith('redis_version:'));
  if (!line) return 0;
  const ver = line.split(':')[1]?.trim() || '0';
  const major = Number.parseInt(ver.split('.')[0] || '0', 10);
  return Number.isFinite(major) ? major : 0;
}

async function probe(url) {
  const client = new Redis(url, {
    maxRetriesPerRequest: 1,
    connectTimeout: 2_000,
    lazyConnect: true,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });
  client.on('error', () => {});

  try {
    await client.connect();
    const info = await client.info('server');
    const major = parseRedisVersion(info);
    if (major < 5) {
      return { ok: false, reason: `Redis ${major}.x at ${url} (need >= 5 for BullMQ)` };
    }
    await client.ping();
    return { ok: true, url, major };
  } catch {
    return { ok: false, reason: `unreachable ${url}` };
  } finally {
    client.disconnect();
  }
}

function hasDocker() {
  const r = spawnSync('docker', ['version'], { stdio: 'ignore' });
  return r.status === 0;
}

function startDockerRedis() {
  const composeFile = resolve(root, '../docker-compose.redis.yml');
  execSync(`docker compose -f "${composeFile}" up -d`, {
    stdio: 'inherit',
    cwd: resolve(root, '..'),
  });
}

async function main() {
  for (const url of candidateUrls()) {
    const result = await probe(url);
    if (result.ok) {
      process.env.PLAYWRIGHT_REDIS_URL = result.url;
      process.env.E2E_REDIS_URL = result.url;
      console.log(`[redis] OK ${result.url} (v${result.major}+)`);
      return;
    }
    console.log(`[redis] Skip: ${result.reason}`);
  }

  if (!hasDocker()) {
    console.error(
      '[redis] No Redis 5+ found. Options:\n' +
        '  1. npm run redis:up (requires Docker Desktop)\n' +
        '  2. Set PLAYWRIGHT_REDIS_URL to Upstash or another Redis 5+ URL\n' +
        '  3. Upgrade local Redis on :6379 to version 5+',
    );
    process.exit(1);
  }

  console.log('[redis] Starting Docker Redis 7 on :6380…');
  startDockerRedis();

  for (let i = 0; i < 40; i++) {
    const result = await probe('redis://127.0.0.1:6380');
    if (result.ok) {
      process.env.PLAYWRIGHT_REDIS_URL = result.url;
      process.env.E2E_REDIS_URL = result.url;
      console.log(`[redis] Ready ${result.url}`);
      return;
    }
    await sleep(500);
  }

  console.error('[redis] Timed out waiting for Docker Redis on :6380');
  process.exit(1);
}

main();
