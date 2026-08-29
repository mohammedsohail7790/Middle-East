import { test, expect } from '../fixtures';

test.describe('marketing hero design previews', () => {
  test('consultancy hero renders with no console errors and no canvas', async ({ page, consoleErrors }) => {
    await page.goto('/design-preview/consultancy', { waitUntil: 'load' });
    await expect(page.getByRole('heading', { name: /^We Don't Sell AI\. We Install It\.$/i })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Book a Diagnostic Call' })).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });

  test('receptionist hero renders with no console errors and no canvas', async ({ page, consoleErrors }) => {
    await page.goto('/design-preview/receptionist', { waitUntil: 'load' });
    await expect(page.getByRole('heading', { name: /^Your Business Deserves an AI That Never Sleeps$/i })).toBeVisible();
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

  test('consultancy page renders all sections with no console errors and no canvas', async ({ page, consoleErrors }) => {
    await page.goto('/design-preview/consultancy', { waitUntil: 'load' });
    await expect(page.getByText('Process Mapping').first()).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Three systems. One connected operating layer.' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Operations Automation' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Every engagement starts the same way' })).toBeVisible();
    await expect(page.getByText('Connected systems, not one-off tools')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: "Let's map out where AI can move the needle in your business" }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Book Your Diagnostic Call' })).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });

  test('consultancy page has no horizontal overflow on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/design-preview/consultancy', { waitUntil: 'load' });
    const scrollWidth = await page.evaluate(() => document.scrollingElement?.scrollWidth ?? 0);
    expect(scrollWidth).toBeLessThanOrEqual(390);
  });
});
