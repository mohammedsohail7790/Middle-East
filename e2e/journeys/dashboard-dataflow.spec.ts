import {
  test,
  expect,
  DATAFLOW_PAGES,
  assertNoDataLoadError,
  filterHardApiFailures,
} from '../fixtures';

test.describe.configure({ mode: 'serial' });

test.describe('dashboard data flow', () => {

  for (const { path, title, apis } of DATAFLOW_PAGES) {
    test(`${path} loads KPIs/APIs without data errors`, async ({ page, consoleErrors, failedRequests }) => {
      const response = await page.goto(path, { waitUntil: 'domcontentloaded' });
      expect(response?.status() ?? 200).toBeLessThan(400);
      await expect(page.locator('h1').first()).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole('main').getByRole('heading', { name: title }).first()).toBeVisible();

      await page.waitForLoadState('networkidle', { timeout: 45_000 }).catch(() => {});
      await assertNoDataLoadError(page);

      expect(filterHardApiFailures(failedRequests), `5xx on ${path}`).toEqual([]);
      expect(consoleErrors, `console on ${path}`).toEqual([]);
    });
  }

  test('home dashboard shows metric cards', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 45_000 }).catch(() => {});
    await expect(page.getByText(/total calls/i).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/^leads$/i).first()).toBeVisible();
    await expect(page.getByText(/conversion/i).first()).toBeVisible();
    await assertNoDataLoadError(page);
  });

  test('leads pipeline renders columns', async ({ page }) => {
    await page.goto('/dashboard/leads', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('main').getByRole('heading', { name: 'Leads' }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('main').getByText('Lead stages')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('main').locator('.dashboard-kanban-column').first()).toBeVisible({ timeout: 30_000 });
    await assertNoDataLoadError(page);
    await expect(page.getByRole('main').getByText('New', { exact: true }).first()).toBeVisible();
  });

  test('analytics page loads metrics', async ({ page }) => {
    await page.goto('/dashboard/analytics', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 45_000 }).catch(() => {});
    await expect(page.getByRole('heading', { name: /analytics/i })).toBeVisible();
    await assertNoDataLoadError(page);
  });
});
