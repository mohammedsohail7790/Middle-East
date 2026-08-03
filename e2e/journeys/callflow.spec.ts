import {
  test,
  expect,
  assertNoDataLoadError,
  gotoAndWaitForApi,
  GATEWAY_URL,
  filterHardApiFailures,
} from '../fixtures';

test.describe('call flow (dashboard + gateway)', () => {
  test('gateway health is reachable', async ({ request }) => {
    const res = await request.get(`${GATEWAY_URL}/health`);
    expect(res.ok()).toBeTruthy();
  });

  test.describe('authenticated call UI', () => {

    test('calls page loads list from API', async ({ page, failedRequests }) => {
      await gotoAndWaitForApi(page, '/dashboard/calls', '/api/v1/calls', { method: 'GET' });
      await assertNoDataLoadError(page);
      await expect(page.getByRole('main').getByRole('heading', { name: /calls/i }).first()).toBeVisible();
      expect(filterHardApiFailures(failedRequests)).toEqual([]);
    });

    test('calls search and tabs work', async ({ page }) => {
      await page.goto('/dashboard/calls', { waitUntil: 'domcontentloaded' });
      await assertNoDataLoadError(page);
      await page.getByRole('tab', { name: 'Completed' }).click();
      await page.getByRole('tab', { name: 'All' }).click();
      await page.getByPlaceholder(/search by call id or transcript/i).fill('test');
    });

    test('phone numbers page loads for routing', async ({ page }) => {
      await page.goto('/dashboard/phone-numbers', { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('main').getByRole('heading', { name: /phone/i }).first()).toBeVisible({ timeout: 30_000 });
      await assertNoDataLoadError(page);
    });

    test('AI agent config loads for live call settings', async ({ page }) => {
      await gotoAndWaitForApi(page, '/dashboard/agent', '/api/v1/ai-config');
      await assertNoDataLoadError(page);
      await expect(page.getByText('Agent Name', { exact: true })).toBeVisible();
    });

    test('simulator page loads when present', async ({ page }) => {
      await page.goto('/dashboard/simulator', { waitUntil: 'domcontentloaded' });
      expect(page.url()).toMatch(/simulator|dashboard/);
    });
  });
});
