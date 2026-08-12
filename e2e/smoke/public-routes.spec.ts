import { test, expect, PUBLIC_ROUTES, assertNoSeriousAxeViolations } from '../fixtures';

for (const route of PUBLIC_ROUTES) {
  test.describe(`smoke: ${route}`, () => {
    test(`loads ${route} without console errors or 4xx/5xx`, async ({
      page,
      consoleErrors,
      failedRequests,
    }) => {
      const response = await page.goto(route, { waitUntil: 'load' });
      expect(response?.status(), `HTTP status for ${route}`).toBeLessThan(400);

      await expect(page.locator('body')).toBeVisible();
      await page.waitForTimeout(500);

      expect(consoleErrors, `console errors on ${route}`).toEqual([]);
      expect(failedRequests, `failed requests on ${route}`).toEqual([]);
    });

    test(`axe: no serious/critical violations on ${route}`, async ({ page }) => {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await assertNoSeriousAxeViolations(page);
    });
  });
}

test('landing has primary CTA and nav links', async ({ page }) => {
  await page.goto('/');
  const frame = page.frameLocator('iframe[title*="Halla AI"]');
  await expect(frame.getByRole('link', { name: /sign in/i }).first()).toBeVisible({
    timeout: 15000,
  });
});

test('login page has email and password fields', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByPlaceholder(/company\.com|email/i)).toBeVisible();
  await expect(page.getByPlaceholder(/password/i)).toBeVisible();
});

test('signup page links to login', async ({ page }) => {
  await page.goto('/signup');
  await expect(page.getByRole('link', { name: /sign in|log in/i }).first()).toBeVisible();
});

test('unauthenticated /dashboard redirects to login', async ({ page, context }) => {
  await context.clearCookies();
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await page.waitForURL(/\/(login)?$/, { timeout: 45_000 });
  const url = page.url();
  expect(url.includes('/login') || url.endsWith('/')).toBeTruthy();
});
