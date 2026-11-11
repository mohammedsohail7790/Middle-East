#!/usr/bin/env node
/**
 * Marketing stylesheet comparison: proves a change to apps/dashboard/public/halla-gcc-theme.css moved nothing.
 *
 *   node scripts/marketing-css-compare.mjs <candidate.css> [baseUrl]
 *
 * For 18 pages (9 editorial, 9 ordinary) at desktop, tablet and phone width in English and Arabic, it loads each page with the
 * live stylesheet twice (to measure noise) and once with the candidate, then compares every visible element's computed style,
 * position and size, plus a screenshot hash. Small differences that also appear between the two live loads are noise (late
 * widgets); re-run any flagged view and look only at differences that repeat. Set CHROMIUM_PATH to reuse an installed Chromium.
 */
// (usage above)
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const candidateFile = process.argv[2];
const base = (process.argv[3] || 'https://www.hallaai.com').replace(/\/$/, '');
const candidate = readFileSync(candidateFile, 'utf8');

const require = createRequire(import.meta.url);
const pw = await import(pathToFileURL(require.resolve('playwright', { paths: [process.cwd()] })).href);
const chromium = pw.chromium ?? pw.default.chromium;
const liveCss = await (await fetch(`${base}/halla-gcc-theme.css`)).text();

const EDITORIAL = ['/', '/home', '/features', '/pricing', '/how-it-works', '/integrations', '/ai-consultancy', '/automation', '/opportunity-audit'];
const OTHERS = ['/solutions/scheduling', '/faq', '/vs-smith', '/contact', '/privacy', '/blog', '/industries/clinics', '/fit-check', '/roi'];
const VPS = { desktop: { width: 1440, height: 900 }, tablet: { width: 768, height: 1024 }, phone: { width: 375, height: 812 } };
const jobs = [];
for (const p of EDITORIAL) for (const [vn, vp] of Object.entries(VPS)) for (const lang of ['en', 'ar']) jobs.push({ p, vn, vp, lang, kind: 'editorial' });
for (const p of OTHERS) for (const vn of ['desktop', 'phone']) jobs.push({ p, vn, vp: VPS[vn], lang: 'en', kind: 'other' });

const PROPS = ['display', 'position', 'width', 'height', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'color', 'background-color', 'background-image', 'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-align', 'text-transform', 'text-decoration-line',
  'border-top-width', 'border-bottom-width', 'border-top-color', 'border-bottom-color', 'border-radius', 'grid-template-columns', 'flex-direction', 'gap', 'max-width', 'min-height', 'box-shadow'];

function snapshot(props) {
  const out = [];
  const els = [...document.querySelectorAll('#marketing-spa-root *, nav *, footer *')];
  for (const e of els) {
    if (!(e.offsetParent !== null || e.getClientRects().length)) continue;
    const cs = getComputedStyle(e), r = e.getBoundingClientRect();
    out.push([e.tagName, (e.className && e.className.toString ? e.className.toString() : '').slice(0, 40), Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height), props.map((p) => cs.getPropertyValue(p)).join('|')].join('~'));
  }
  return out;
}

async function load(browser, job, css) {
  const context = await browser.newContext({ viewport: job.vp, reducedMotion: 'reduce' });
  await context.addInitScript((l) => { try { localStorage.setItem('halla_lang', l); } catch { /* ignore */ } }, job.lang);
  if (css !== null) await context.route('**/halla-gcc-theme.css*', (route) => route.fulfill({ status: 200, contentType: 'text/css', body: css }));
  const page = await context.newPage();
  await page.addInitScript(() => { const s = document.createElement('style'); s.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}'; document.addEventListener('DOMContentLoaded', () => document.head.appendChild(s)); });
  await page.goto(base + job.p, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3500);
  const snap = await page.evaluate(snapshot, PROPS);
  const shot = createHash('sha1').update(await page.screenshot({ fullPage: true, animations: 'disabled' })).digest('hex');
  await context.close();
  return { snap, shot };
}
const diff = (a, b) => { let n = 0; const m = Math.max(a.length, b.length); for (let i = 0; i < m; i++) if (a[i] !== b[i]) n++; return n; };

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const results = [];
let next = 0;
async function worker() {
  while (next < jobs.length) {
    const job = jobs[next++];
    try {
      const a = await load(browser, job, null);          // live stylesheet
      const a2 = await load(browser, job, null);         // live stylesheet again: noise floor
      const b = await load(browser, job, candidate);     // candidate stylesheet
      results.push({ ...job, vp: undefined, elements: a.snap.length, noiseEls: diff(a.snap, a2.snap), effectEls: diff(a.snap, b.snap), samePixelsNoise: a.shot === a2.shot, samePixelsEffect: a.shot === b.shot });
    } catch (e) {
      results.push({ ...job, vp: undefined, error: String(e).slice(0, 100) });
    }
  }
}
await Promise.all([worker(), worker(), worker(), worker()]);
await browser.close();
results.sort((x, y) => (x.kind + x.p + x.vn + x.lang).localeCompare(y.kind + y.p + y.vn + y.lang));
const outFile = join(tmpdir(), 'marketing-css-compare.json');
writeFileSync(outFile, JSON.stringify(results, null, 1));
console.log('full results:', outFile);
const bad = results.filter((r) => r.error || r.effectEls > r.noiseEls);
console.log(`${results.length} page views compared. Views where the candidate differs beyond noise: ${bad.length}`);
for (const r of results) {
  const flag = r.error ? 'ERR ' : r.effectEls > r.noiseEls ? 'DIFF' : ' ok ';
  console.log(`${flag} ${r.kind.padEnd(9)} ${r.p.padEnd(24)} ${r.vn.padEnd(8)} ${r.lang}  elements=${r.elements ?? '-'} noise=${r.noiseEls ?? '-'} effect=${r.effectEls ?? '-'} pixels(noise/effect)=${r.samePixelsNoise}/${r.samePixelsEffect}${r.error ? ' ' + r.error : ''}`);
}
process.exit(bad.length ? 1 : 0);
