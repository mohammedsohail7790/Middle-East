import { test, expect, PUBLIC_ROUTES, VIEWPORTS } from '../fixtures';
import fs from 'fs';
import path from 'path';

const screenshotDir = path.join('qa', 'artifacts', 'screenshots');

for (const [name, viewport] of Object.entries(VIEWPORTS)) {
  test.describe(`responsive: ${name}`, () => {
    test.use({ viewport });

    for (const route of PUBLIC_ROUTES) {
      test(`screenshot ${route} @ ${name}`, async ({ page }, testInfo) => {
        await page.goto(route, { waitUntil: 'load' });
        await expect(page.locator('body')).toBeVisible();
        const safeRoute = route === '/' ? 'home' : route.replace(/\//g, '_').slice(1);
        const outDir = path.join(screenshotDir, testInfo.project.name);
        fs.mkdirSync(outDir, { recursive: true });
        await page.screenshot({
          path: path.join(outDir, `${safeRoute}-${name}.png`),
          fullPage: true,
        });
      });
    }
  });
}
