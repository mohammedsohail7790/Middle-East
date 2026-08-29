import { test, expect } from '../fixtures';

test.describe('marketing hero design previews', () => {
  test('consultancy hero renders with no console errors and no canvas', async ({ page, consoleErrors }) => {
    await page.goto('/design-preview/consultancy', { waitUntil: 'load' });
    await expect(page.getByRole('heading', { level: 1, name: /We Don't Sell AI/i })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Book a Diagnostic Call' })).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });

  test('receptionist hero renders with no console errors and no canvas', async ({ page, consoleErrors }) => {
    await page.goto('/design-preview/receptionist', { waitUntil: 'load' });
    await expect(page.getByRole('heading', { level: 1, name: /Never Sleeps/i })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Get My AI Receptionist' })).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });

  test('consultancy hero has no horizontal overflow on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/design-preview/consultancy', { waitUntil: 'load' });
    const scrollWidth = await page.evaluate(() => document.scrollingElement?.scrollWidth ?? 0);
    expect(scrollWidth).toBeLessThanOrEqual(390);
  });
});
