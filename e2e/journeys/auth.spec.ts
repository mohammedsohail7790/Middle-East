import { test, expect, hasAuthCredentials, loginAsTestUser } from '../fixtures';

test.describe('auth journeys', () => {
  test('login form validation — empty submit stays on page', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'load' });
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByPlaceholder(/company\.com|email/i)).toBeVisible();
  });

  test('navigate login → signup → forgot password', async ({ page, consoleErrors }) => {
    await page.goto('/login', { waitUntil: 'load' });
    await page.getByRole('link', { name: 'Create an account' }).click();
    await expect(page).toHaveURL(/\/signup/);
    await page.goto('/forgot-password', { waitUntil: 'load' });
    await expect(page.getByRole('heading', { name: /reset your password/i })).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });

  test('authenticated dashboard access', async ({ page }) => {
    test.skip(!hasAuthCredentials(), 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run');
    await loginAsTestUser(page);
    expect(page.url()).toMatch(/\/(dashboard|onboarding)/);
    if (page.url().includes('/dashboard')) {
      await expect(page.locator('main').first()).toBeVisible({ timeout: 15_000 });
    }
  });
});
