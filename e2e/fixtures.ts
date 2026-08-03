import { test as base, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { hasE2eAuth } from './helpers/supabase-auth';

export const PUBLIC_ROUTES = ['/', '/login', '/signup', '/forgot-password'] as const;

export const VIEWPORTS = {
  mobile: { width: 375, height: 667 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1440, height: 900 },
} as const;

type ConsoleIssue = { type: string; text: string };

export const test = base.extend<{
  consoleErrors: ConsoleIssue[];
  failedRequests: { url: string; status: number }[];
}>({
  consoleErrors: async ({ page }, use) => {
    const errors: ConsoleIssue[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (isIgnoredConsoleError(text)) return;
        errors.push({ type: msg.type(), text });
      }
    });
    await use(errors);
  },
  failedRequests: async ({ page }, use) => {
    const failed: { url: string; status: number }[] = [];
    page.on('response', (res) => {
      const url = res.url();
      if (!url.startsWith('http')) return;
      const status = res.status();
      if (status >= 400 && !isIgnoredFailedRequest(url, status)) {
        failed.push({ url, status });
      }
    });
    await use(failed);
  },
});

export { expect };

export async function assertNoSeriousAxeViolations(page: import('@playwright/test').Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical'
  );
  expect(serious, formatAxeViolations(serious)).toEqual([]);
}

function formatAxeViolations(
  violations: { id: string; impact?: string; help: string; nodes: unknown[] }[]
) {
  return violations.map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.length} nodes`).join('\n');
}

function isIgnoredConsoleError(text: string): boolean {
  const ignores = [
    'favicon.ico',
    'Failed to load resource',
    'net::ERR_',
    'Hydration failed',
    'Download the React DevTools',
    'Open Next.js Dev Tools',
  ];
  return ignores.some((s) => text.includes(s));
}

function isIgnoredFailedRequest(url: string, status: number): boolean {
  if (url.includes('favicon')) return true;
  if (url.includes('supabase.co') && (status === 401 || status === 403)) return true;
  // Realtime WS may fail in CI without live gateway session
  if (url.includes('/ws/') || url.includes('realtime')) return true;
  // Degraded OpenAI check — not a dashboard data-flow failure
  if (url.includes('/health/realtime') && status === 503) return true;
  if (url.includes('/billing/account-state') && status === 500) return true;
  return false;
}

export function filterHardApiFailures(failed: { url: string; status: number }[]) {
  return failed.filter(
    (r) =>
      r.url.includes('/api/v1') &&
      r.status >= 500 &&
      !r.url.includes('/analytics/conversion-funnel') &&
      !r.url.includes('/billing/account-state') &&
      !r.url.includes('/billing/invoices') &&
      !r.url.includes('/health/realtime')
  );
}

export const GATEWAY_URL =
  process.env.PLAYWRIGHT_GATEWAY_URL ||
  (process.env.NEXT_PUBLIC_GATEWAY_API_URL?.includes('localhost')
    ? process.env.NEXT_PUBLIC_GATEWAY_API_URL
    : 'http://localhost:3003');

export const DATAFLOW_PAGES = [
  { path: '/dashboard', title: /good morning|good afternoon|good evening|total calls/i, apis: ['/dashboard/metrics', '/dashboard/call-volume'] },
  { path: '/dashboard/calls', title: /calls/i, apis: ['/calls'] },
  { path: '/dashboard/leads', title: /leads/i, apis: ['/leads'] },
  { path: '/dashboard/calendar', title: /calendar/i, apis: ['/calendar/events'] },
  { path: '/dashboard/analytics', title: /analytics/i, apis: ['/analytics/metrics', '/analytics/call-volume'] },
  { path: '/dashboard/agent', title: /ai agent|agent/i, apis: ['/ai-config'] },
] as const;

export function getE2eCredentials(): { email: string; password: string } | null {
  const email = (process.env.E2E_TEST_EMAIL || process.env.SMOKE_TEST_EMAIL || '').trim();
  const password = (process.env.E2E_TEST_PASSWORD || process.env.SMOKE_TEST_PASSWORD || '').trim();
  if (!email || !password) return null;
  return { email, password };
}

export function hasAuthCredentials(): boolean {
  return hasE2eAuth();
}

export function hasGatewayApiKey(): boolean {
  return Boolean(process.env.E2E_TENANT_ID?.trim() && process.env.VOICE_INTERNAL_API_KEY?.trim());
}

/** Fail if dashboard shows the standard data-load error banner. */
export async function assertNoDataLoadError(page: import('@playwright/test').Page) {
  const alert = page.getByRole('alert').filter({ hasText: /could not load data/i });
  await expect(alert, 'dashboard should not show data-load errors').toHaveCount(0);
}

/** Wait for gateway API calls to finish; returns statuses for matching paths. */
/** Navigate and wait for a matching API response (listener registered before goto). */
export async function gotoAndWaitForApi(
  page: import('@playwright/test').Page,
  path: string,
  urlPart: string,
  options?: { timeout?: number; method?: string }
) {
  const timeout = options?.timeout ?? 45_000;
  const method = options?.method?.toUpperCase();
  const [response] = await Promise.all([
    page.waitForResponse(
      (res) => {
        if (!res.url().includes(urlPart)) return false;
        if (method && res.request().method() !== method) return false;
        return res.status() < 500;
      },
      { timeout }
    ),
    page.goto(path, { waitUntil: 'domcontentloaded' }),
  ]);
  return response;
}

export async function waitForApis(
  page: import('@playwright/test').Page,
  pathFragments: string[],
  timeoutMs = 30_000
): Promise<Map<string, number>> {
  const statuses = new Map<string, number>();
  const handler = (res: import('@playwright/test').Response) => {
    const url = res.url();
    if (!url.includes('/api/v1')) return;
    for (const frag of pathFragments) {
      if (url.includes(frag)) statuses.set(frag, res.status());
    }
  };
  page.on('response', handler);
  await page.waitForLoadState('networkidle', { timeout: timeoutMs }).catch(() => {});
  page.off('response', handler);
  return statuses;
}

/** Sign in via /login; lands on /dashboard or /onboarding. */
export async function loginAsTestUser(page: import('@playwright/test').Page) {
  const creds = getE2eCredentials();
  if (!creds) {
    throw new Error('E2E_TEST_EMAIL and E2E_TEST_PASSWORD (or SMOKE_TEST_*) are required');
  }
  await page.goto('/login', { waitUntil: 'load' });
  await page.getByPlaceholder(/company\.com|email/i).fill(creds.email);
  await page.getByPlaceholder(/password/i).fill(creds.password);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 45_000 });
}
