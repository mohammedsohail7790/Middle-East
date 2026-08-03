import { mkdirSync, writeFileSync } from 'fs';
import { test as setup, expect } from '@playwright/test';
import { fetchSupabaseSession, hasE2eAuth, injectSupabaseSession } from './helpers/supabase-auth';

const authFile = 'e2e/.auth/user.json';

setup('authenticate', async ({ page, baseURL }) => {
  mkdirSync('e2e/.auth', { recursive: true });
  const origin = (baseURL || 'http://localhost:3000').replace(/\/$/, '');

  if (!hasE2eAuth()) {
    writeFileSync(authFile, JSON.stringify({ cookies: [], origins: [] }));
    return;
  }

  const session = await fetchSupabaseSession();
  if (!session?.access_token) {
    writeFileSync(authFile, JSON.stringify({ cookies: [], origins: [] }));
    setup.skip(true, 'Supabase sign-in failed — set E2E_TEST_PASSWORD or SUPABASE_SERVICE_ROLE_KEY');
    return;
  }

  await injectSupabaseSession(page, session, origin);
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  setup.skip(page.url().includes('/onboarding'), 'Complete onboarding for test user first');
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.locator('main').first()).toBeVisible({ timeout: 30_000 });
  await page.context().storageState({ path: authFile });
});
