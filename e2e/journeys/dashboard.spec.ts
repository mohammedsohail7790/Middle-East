import { test, expect, assertNoSeriousAxeViolations, filterHardApiFailures } from '../fixtures';

test.describe.configure({ mode: 'serial' });

const DASHBOARD_ROUTES = [
  '/dashboard',
  '/dashboard/calls',
  '/dashboard/leads',
  '/dashboard/agent',
  '/dashboard/calendar',
  '/dashboard/channels/sms',
  '/dashboard/channels/whatsapp',
  '/dashboard/channels/web-chat',
  '/dashboard/channels/instagram',
  '/dashboard/channels/facebook',
  '/dashboard/analytics',
  '/dashboard/quality',
  '/dashboard/automation',
  '/dashboard/crm/pipeline',
  '/dashboard/crm/contacts',
  '/dashboard/crm/companies',
  '/dashboard/crm/deals',
  '/dashboard/team',
  '/dashboard/integrations',
  '/dashboard/phone-numbers',
  '/dashboard/knowledge',
  '/dashboard/billing',
  '/dashboard/settings',
] as const;

test.describe('authenticated dashboard journeys', () => {
  for (const route of DASHBOARD_ROUTES) {
    test(`loads ${route} without console errors`, async ({ page, consoleErrors, failedRequests }) => {
      const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
      expect(response?.status() ?? 200).toBeLessThan(400);
      await expect(page.locator('main').first()).toBeVisible({ timeout: 30_000 });
      // Page shell loaded (data may still be fetching)
      await expect(page.locator('h1').first()).toBeVisible({ timeout: 15_000 });
      expect(consoleErrors, `console errors on ${route}`).toEqual([]);
      expect(filterHardApiFailures(failedRequests), `failed requests on ${route}`).toEqual([]);
    });
  }

  test('sidebar navigation: dashboard → calls → leads', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'load' });
    await page.getByRole('link', { name: 'Calls' }).click();
    await expect(page).toHaveURL(/\/dashboard\/calls/);
    await page.getByRole('link', { name: 'Leads' }).click();
    await expect(page).toHaveURL(/\/dashboard\/leads/);
  });

  test('axe: dashboard home has no serious violations', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 20_000 });
    await assertNoSeriousAxeViolations(page);
  });
});
