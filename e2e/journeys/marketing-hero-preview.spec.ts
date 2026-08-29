import { test, expect } from '../fixtures';

test.describe('marketing hero design previews', () => {
  test('consultancy hero renders with no console errors and no canvas', async ({ page, consoleErrors }) => {
    await page.goto('/design-preview/consultancy', { waitUntil: 'load' });
    await expect(page.getByRole('heading', { name: /^We Don't Sell AI\. We Install It\.$/i })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Book a Diagnostic Call' }).first()).toBeVisible();
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

  test('industries index page lists all 6 industries with no console errors and no canvas', async ({ page, consoleErrors }) => {
    await page.goto('/design-preview/receptionist/industries', { waitUntil: 'load' });
    await expect(page.getByRole('heading', { name: 'Industries We Serve' })).toBeVisible();
    for (const name of ['HVAC', 'Plumbing', 'Electrical', 'Landscaping', 'Home Cleaning', 'Legal Firms']) {
      await expect(page.getByRole('link', { name: new RegExp(name) }).first()).toBeVisible();
    }
    await expect(page.getByText('Property Management')).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });

  test('HVAC industry detail page renders content and FAQ with no console errors', async ({ page, consoleErrors }) => {
    await page.goto('/design-preview/receptionist/industries/hvac', { waitUntil: 'load' });
    await expect(page.getByRole('heading', { name: 'Halla AI for HVAC' })).toBeVisible();
    await expect(page.getByText('Keep Your Schedule Hot. Not Your Customers.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Start Free Trial' })).toHaveAttribute('href', '/signup');
    const firstFaq = page.getByText('How does Halla AI handle seasonal demand spikes?');
    await expect(firstFaq).toBeVisible();
    await firstFaq.click();
    await expect(page.getByText(/The AI scales automatically/)).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });

  test('pricing page renders all 3 plans and the feature table with no console errors', async ({ page, consoleErrors }) => {
    await page.goto('/design-preview/receptionist/pricing', { waitUntil: 'load' });
    await expect(page.getByRole('heading', { name: 'Simple, Honest Pricing' })).toBeVisible();
    await expect(page.getByText('Essential').first()).toBeVisible();
    await expect(page.getByText('Professional').first()).toBeVisible();
    await expect(page.getByText('Enterprise').first()).toBeVisible();
    await expect(page.getByText('Most Popular')).toBeVisible();
    await expect(page.getByText('Full Feature Comparison')).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });

  test('ROI calculator recomputes when inputs change', async ({ page, consoleErrors }) => {
    await page.goto('/design-preview/receptionist/pricing', { waitUntil: 'load' });
    await expect(page.getByText('$3,000')).toBeVisible();
    await page.getByLabel('Monthly Calls You Currently Miss').fill('40');
    await expect(page.getByText('$6,000')).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });
});
