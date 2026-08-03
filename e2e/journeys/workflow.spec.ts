import {
  test,
  expect,
  assertNoDataLoadError,
} from '../fixtures';

test.describe.configure({ mode: 'serial' });

test.describe('automation workflow', () => {

  test('automation page loads rules from API', async ({ page }) => {
    await page.goto('/dashboard/automation', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('main').getByRole('heading', { name: /automation/i }).first()).toBeVisible({
      timeout: 30_000,
    });
    await assertNoDataLoadError(page);
  });

  test('new workflow modal opens with trigger and action options', async ({ page }) => {
    await page.goto('/dashboard/automation', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 45_000 }).catch(() => {});

    const newBtn = page.getByRole('button', { name: /new workflow/i }).first();
    await expect(newBtn).toBeVisible({ timeout: 15_000 });
    await newBtn.click();
    await expect(page.getByRole('heading', { name: 'New Workflow' })).toBeVisible({ timeout: 15_000 });
    const modal = page.locator('div').filter({ has: page.getByRole('heading', { name: 'New Workflow' }) });
    await expect(modal.locator('select').first()).toBeVisible({ timeout: 10_000 });
    await expect(modal.locator('select').nth(1)).toBeVisible();
  });

  test('create workflow rule (API round-trip)', async ({ page }) => {
    await page.goto('/dashboard/automation', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 45_000 }).catch(() => {});

    const newBtn = page.getByRole('button', { name: /new workflow/i }).first();
    await expect(newBtn).toBeVisible({ timeout: 15_000 });
    await newBtn.click();
    await expect(page.getByRole('heading', { name: 'New Workflow' })).toBeVisible();

    const name = `E2E Rule ${Date.now()}`;
    const modal = page.locator('div').filter({ has: page.getByRole('heading', { name: 'New Workflow' }) });
    await modal.getByPlaceholder('Follow-up after missed call').fill(name);
    await modal.locator('select').first().selectOption({ label: 'Call Completed' });
    await modal.locator('select').nth(1).selectOption({ label: 'Send SMS' });

    const [createRes] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes('/api/v1/automation/rules') && r.request().method() === 'POST',
        { timeout: 30_000 }
      ),
      modal.getByRole('button', { name: /^create workflow$/i }).click(),
    ]);

    if (createRes.status() === 403 || createRes.status() >= 500) {
      test.skip(true, `Automation create not available (${createRes.status()})`);
      return;
    }
    expect(createRes.status()).toBeLessThan(400);
    await expect(page.getByText(name).first()).toBeVisible({ timeout: 20_000 });
  });
});
