import { defineConfig, devices } from '@playwright/test';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

function loadEnvFile(envPath: string) {
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnvFile(resolve('apps/gateway/.env'));
loadEnvFile(resolve('apps/dashboard/.env.local'));
loadEnvFile(resolve('.env.e2e'));

const isProdE2e =
  process.env.PLAYWRIGHT_PROD === '1' ||
  process.env.SMOKE_GATEWAY_URL?.includes('hallaai.com') ||
  process.env.SMOKE_GATEWAY_URL?.includes('calliqlabs.com') ||   // legacy fallback
  process.env.PLAYWRIGHT_BASE_URL?.includes('hallaai.com') ||
  process.env.PLAYWRIGHT_BASE_URL?.includes('calliqlabs.com');   // legacy fallback

// Local E2E: prefer explicit gateway URL from env; default to :3003 only when unset.
if (!isProdE2e) {
  if (!process.env.PLAYWRIGHT_GATEWAY_URL) {
    process.env.PLAYWRIGHT_GATEWAY_URL =
      process.env.NEXT_PUBLIC_GATEWAY_API_URL || 'http://localhost:3003';
  }
  if (!process.env.NEXT_PUBLIC_GATEWAY_API_URL) {
    process.env.NEXT_PUBLIC_GATEWAY_API_URL = process.env.PLAYWRIGHT_GATEWAY_URL;
  }
} else {
  const prodOrigin = (
    process.env.PLAYWRIGHT_BASE_URL ||
    process.env.SMOKE_GATEWAY_URL ||
    'https://www.hallaai.com'
  ).replace(/\/$/, '');
  process.env.PLAYWRIGHT_SKIP_WEBSERVER = process.env.PLAYWRIGHT_SKIP_WEBSERVER ?? '1';
  process.env.PLAYWRIGHT_BASE_URL = prodOrigin;
  process.env.PLAYWRIGHT_GATEWAY_URL = process.env.PLAYWRIGHT_GATEWAY_URL || prodOrigin;
  process.env.NEXT_PUBLIC_GATEWAY_API_URL = prodOrigin;
}

const gatewayUrl = process.env.PLAYWRIGHT_GATEWAY_URL ?? 'http://localhost:3003';
const isRemoteGateway = !/localhost|127\.0\.0\.1/i.test(gatewayUrl);

// When E2E targets production/staging gateway, do not boot a local gateway (avoids prod Redis/DB collisions).
const skipLocalGateway =
  isProdE2e ||
  isRemoteGateway ||
  process.env.PLAYWRIGHT_SKIP_GATEWAY === '1';

if (isRemoteGateway && !process.env.NEXT_PUBLIC_GATEWAY_API_URL) {
  process.env.NEXT_PUBLIC_GATEWAY_API_URL = gatewayUrl;
}

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3000);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

const webServers: NonNullable<import('@playwright/test').PlaywrightTestConfig['webServer']> = [];

if (!process.env.PLAYWRIGHT_SKIP_WEBSERVER) {
  if (!skipLocalGateway) {
    webServers.push({
      command: 'npm run dev -w @halla-ai/gateway',
      url: `${gatewayUrl}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
      cwd: process.cwd(),
      env: {
        ...process.env,
        // Prefer Docker Redis 7 on :6380 for E2E (avoids legacy Windows Redis 3.x on :6379).
        REDIS_URL: process.env.PLAYWRIGHT_REDIS_URL || process.env.E2E_REDIS_URL || 'redis://127.0.0.1:6380',
      },
    });
  }
  webServers.push({
    command: process.env.PLAYWRIGHT_WEB_SERVER_CMD ?? 'npm run dev -w @halla-ai/dashboard',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    cwd: process.cwd(),
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: '1',
      NEXT_PUBLIC_GATEWAY_API_URL:
        process.env.NEXT_PUBLIC_GATEWAY_API_URL ?? gatewayUrl,
    },
  });
}

export default defineConfig({
  globalSetup: './e2e/global-setup.ts',
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 2 : 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'qa/artifacts/playwright-report', open: 'never' }],
    ['json', { outputFile: 'qa/artifacts/test-results.json' }],
  ],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/user.json',
      },
      dependencies: ['setup'],
      testIgnore: /auth\.setup\.ts/,
    },
    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        storageState: 'e2e/.auth/user.json',
      },
      dependencies: ['setup'],
      testIgnore: /auth\.setup\.ts/,
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        storageState: 'e2e/.auth/user.json',
      },
      dependencies: ['setup'],
      testIgnore: /auth\.setup\.ts/,
    },
  ],
  webServer: webServers.length ? webServers : undefined,
  outputDir: 'qa/artifacts/test-output',
});
