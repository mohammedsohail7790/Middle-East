#!/usr/bin/env node
/**
 * Renders the two 1200x630 link-preview images (WhatsApp, LinkedIn, X) used by the marketing pages.
 *
 *   node scripts/make-share-images.mjs
 *
 * Output: apps/dashboard/public/og-halla-receptionist.png and og-halla-consultancy.png
 * Uses the site's own palette and fonts (needs network for Google Fonts). Set CHROMIUM_PATH to reuse an installed Chromium.
 */
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'dashboard', 'public');

const cards = [
  {
    file: 'og-halla-receptionist.png',
    kicker: 'Halla AI · AI Receptionist',
    headline: 'Every call and WhatsApp message answered, in Arabic and English.',
    sub: 'Live in 15 minutes · 14-day free trial · No credit card',
  },
  {
    file: 'og-halla-consultancy.png',
    kicker: 'Halla AI · Consultancy',
    headline: 'Custom software and AI automation for small and mid-sized businesses.',
    sub: 'Fixed price · Fixed timeline · In writing',
  },
];

const html = (c) => `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600&family=Plus+Jakarta+Sans:wght@500;700&family=Cairo:wght@600&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;background:#121417;color:#F5F5F7;font-family:'Plus Jakarta Sans',sans-serif;position:relative;overflow:hidden}
.frame{position:absolute;inset:36px;border:1px solid rgba(197,160,89,.38)}
.rule{position:absolute;left:84px;top:84px;width:72px;height:3px;background:#C5A059}
.kicker{position:absolute;left:84px;top:112px;font-size:24px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#C5A059}
h1{position:absolute;left:84px;top:178px;width:960px;font-family:'Cormorant Garamond',Georgia,serif;font-weight:600;font-size:82px;line-height:1.06;letter-spacing:-.01em}
.sub{position:absolute;left:84px;bottom:112px;font-size:28px;font-weight:500;color:#B9B9BF}
.brand{position:absolute;right:84px;bottom:100px;display:flex;align-items:baseline;gap:14px}
.brand b{font-family:'Cormorant Garamond',Georgia,serif;font-size:44px;font-weight:600;color:#F5F5F7}
.brand b i{font-style:normal;color:#C5A059}
.brand span{font-family:'Cairo',sans-serif;font-size:28px;font-weight:600;color:#C5A059}
</style></head><body>
<div class="frame"></div><div class="rule"></div>
<div class="kicker">${c.kicker}</div>
<h1>${c.headline}</h1>
<div class="sub">${c.sub}</div>
<div class="brand"><b>Halla <i>AI</i></b><span>هالا</span></div>
</body></html>`;

async function loadChromium() {
  const require = createRequire(import.meta.url);
  for (const name of ['playwright', 'playwright-core', '@playwright/test']) {
    try {
      const mod = await import(pathToFileURL(require.resolve(name, { paths: [process.cwd()] })).href);
      const c = mod.chromium ?? mod.default?.chromium;
      if (c) return c;
    } catch {
      /* try the next one */
    }
  }
  throw new Error('Playwright is not installed.');
}

const chromium = await loadChromium();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
for (const c of cards) {
  await page.setContent(html(c), { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, c.file), type: 'png' });
  console.log('wrote', c.file);
}
await browser.close();
