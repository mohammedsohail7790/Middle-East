#!/usr/bin/env node
/**
 * Marketing guard: opens every page in the site's sitemap at phone width and reports layout problems that were
 * found in the Nov 2026 design review, so they cannot quietly come back.
 *
 *   node scripts/marketing-guard.mjs [baseUrl] [--lang=ar] [--json] [--css=path/to/file.css]
 * --css applies a stylesheet on top of every page before checking, to prove a CSS fix before it is deployed.
 *
 * baseUrl defaults to MARKETING_GUARD_URL or https://www.hallaai.com (pass a Vercel preview address to check a PR).
 * Checks per page (phone, 375 px wide):
 *   - exactly one visible <h1>
 *   - no sideways scrolling of the whole page
 *   - no table whose columns are cut off (clipped by an ancestor with overflow hidden)
 *   - no text field under 16px (iPhones zoom into those)
 *   - no button or block link smaller than 36px in either direction
 *   - every visible image has an alt attribute
 * Exit code 1 when any page fails.
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const flag = (n) => args.find((a) => a.startsWith(`--${n}`));
const base = (args.find((a) => !a.startsWith('--')) || process.env.MARKETING_GUARD_URL || 'https://www.hallaai.com').replace(/\/$/, '');
const lang = (flag('lang') || '').split('=')[1] || 'en';
const asJson = !!flag('json');
const cssFile = (flag('css') || '').split('=')[1] || '';

async function loadChromium() {
  const require = createRequire(import.meta.url);
  for (const name of ['playwright', 'playwright-core', '@playwright/test']) {
    for (const paths of [[process.cwd()], [new URL('..', import.meta.url).pathname]]) {
      try {
        const mod = await import(pathToFileURL(require.resolve(name, { paths })).href);
        const c = mod.chromium ?? mod.default?.chromium;
        if (c) return c;
      } catch {
        /* try the next one */
      }
    }
  }
  throw new Error('Playwright is not installed. Run: npm i -D playwright && npx playwright install chromium');
}

const MIN_TARGET = 36;
const MIN_FIELD_FONT = 16;

function inspectPage() {
  const visible = (e) => !!(e.offsetParent !== null || e.getClientRects().length) && getComputedStyle(e).visibility !== 'hidden';
  const problems = [];

  const h1s = [...document.querySelectorAll('h1')].filter(visible);
  if (h1s.length !== 1) problems.push(`${h1s.length} visible <h1> (want exactly 1)`);

  if (document.documentElement.scrollWidth > innerWidth + 1) {
    problems.push(`page scrolls sideways (${document.documentElement.scrollWidth}px in a ${innerWidth}px screen)`);
  }

  for (const t of [...document.querySelectorAll('table')].filter(visible)) {
    const tw = t.getBoundingClientRect().width;
    let p = t.parentElement;
    while (p && p !== document.body) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === 'auto' || ox === 'scroll') break; // the reader can scroll to the rest
      if ((ox === 'hidden' || ox === 'clip') && p.clientWidth + 2 < tw) {
        problems.push(`table cut off: ${Math.round(tw)}px wide inside a ${p.clientWidth}px box with no scrolling`);
        break;
      }
      p = p.parentElement;
    }
  }

  const fields = [...document.querySelectorAll('input,select,textarea')].filter(
    (e) => visible(e) && !['checkbox', 'radio', 'hidden', 'range', 'submit', 'button', 'image'].includes(e.type),
  );
  const smallFields = fields.filter((e) => parseFloat(getComputedStyle(e).fontSize) < 16);
  if (smallFields.length) problems.push(`${smallFields.length} text field(s) under 16px`);

  const targets = [...document.querySelectorAll('a,button')].filter((e) => {
    if (!visible(e) || getComputedStyle(e).display === 'inline') return false;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && (r.height < 36 || r.width < 36);
  });
  if (targets.length) {
    problems.push(`${targets.length} tap target(s) under 36px (e.g. "${(targets[0].innerText || targets[0].className || '').toString().trim().slice(0, 24)}")`);
  }

  const noAlt = [...document.images].filter((i) => visible(i) && !i.hasAttribute('alt') && i.getAttribute('role') !== 'presentation');
  if (noAlt.length) problems.push(`${noAlt.length} image(s) without alt text`);

  return problems;
}

async function main() {
  const res = await fetch(`${base}/sitemap.xml`);
  if (!res.ok) throw new Error(`Could not read ${base}/sitemap.xml (${res.status})`);
  const xml = await res.text();
  const paths = [...new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname))];
  const chromium = await loadChromium();
  // CHROMIUM_PATH lets a machine use a Chromium it already has instead of the one Playwright expects.
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await context.addInitScript((l) => {
    try {
      localStorage.setItem('halla_lang', l);
    } catch {
      /* ignore */
    }
  }, lang);

  const results = [];
  let next = 0;
  async function worker() {
    const page = await context.newPage();
    while (next < paths.length) {
      const path = paths[next++];
      try {
        const r = await page.goto(base + path, { waitUntil: 'load', timeout: 60000 });
        if (cssFile) await page.addStyleTag({ content: readFileSync(cssFile, 'utf8') });
        await page.waitForTimeout(1200);
        const problems = r && r.status() >= 400 ? [`HTTP ${r.status()}`] : await page.evaluate(inspectPage);
        results.push({ path, problems });
      } catch (e) {
        results.push({ path, problems: [`could not load: ${String(e).slice(0, 80)}`] });
      }
    }
    await page.close();
  }
  await Promise.all([worker(), worker(), worker()]);
  await browser.close();

  results.sort((a, b) => a.path.localeCompare(b.path));
  const failed = results.filter((r) => r.problems.length);
  if (asJson) {
    console.log(JSON.stringify({ base, lang, pages: results.length, failed: failed.length, results }, null, 2));
  } else {
    console.log(`Marketing guard: ${base} (${lang}, phone width), ${results.length} pages`);
    for (const r of results) console.log(`${r.problems.length ? 'FAIL' : ' ok '}  ${r.path}${r.problems.length ? '\n        ' + r.problems.join('\n        ') : ''}`);
    console.log(`\n${results.length - failed.length} of ${results.length} pages pass.`);
  }
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(2);
});
