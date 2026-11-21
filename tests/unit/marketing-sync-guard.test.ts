import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error plain JS module
import { overwriteAllowed } from '../../scripts/lib/marketing-sync-guard.mjs';

const REPO = path.resolve(__dirname, '../..');
const SENTINEL = '<!-- edited directly in a pull request -->';

describe('overwriteAllowed', () => {
  it('is off by default', () => {
    expect(overwriteAllowed(['node', 'script'], {})).toBe(false);
  });
  it('is on with --force or HALLA_SYNC_OVERWRITE=1 only', () => {
    expect(overwriteAllowed(['node', 'script', '--force'], {})).toBe(true);
    expect(overwriteAllowed(['node', 'script'], { HALLA_SYNC_OVERWRITE: '1' })).toBe(true);
    expect(overwriteAllowed(['node', 'script'], { HALLA_SYNC_OVERWRITE: '0' })).toBe(false);
    expect(overwriteAllowed(['node', 'script', '--watch'], {})).toBe(false);
  });
});

/** Runs the real script inside a throw-away copy of the repo layout, with root files present, so nothing in the real repo is touched. */
describe('sync-halla-marketing.mjs with root files present', () => {
  let dir: string;
  const body = () => path.join(dir, 'apps/dashboard/public/marketing-body.html');
  const run = (...args: string[]) => execFileSync('node', ['scripts/sync-halla-marketing.mjs', ...args], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'halla-sync-'));
    mkdirSync(path.join(dir, 'scripts/lib'), { recursive: true });
    cpSync(path.join(REPO, 'scripts/sync-halla-marketing.mjs'), path.join(dir, 'scripts/sync-halla-marketing.mjs'));
    cpSync(path.join(REPO, 'scripts/lib/marketing-sync-guard.mjs'), path.join(dir, 'scripts/lib/marketing-sync-guard.mjs'));
    mkdirSync(path.join(dir, 'apps/dashboard/public'), { recursive: true });
    writeFileSync(body(), SENTINEL);
    for (const f of ['index.html', 'halla_preview.html', 'halla_styles.css', 'halla_main.js', 'halla_neural.js', 'halla_plexus.js']) {
      writeFileSync(path.join(dir, f), f === 'index.html' ? '<html><head></head><body>OLD ROOT FILE</body></html>' : '/* old */');
    }
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('leaves the published file alone and says why', () => {
    const out = execFileSync('node', ['scripts/sync-halla-marketing.mjs'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    expect(readFileSync(body(), 'utf8')).toBe(SENTINEL);
    expect(existsSync(path.join(dir, 'Marketing site'))).toBe(false);
    expect(out).toBeDefined();
  });

  it('overwrites only when forced', () => {
    run('--force');
    expect(readFileSync(body(), 'utf8')).toContain('OLD ROOT FILE');
  });

  it('refuses watch mode without --force', () => {
    expect(() => run('--watch')).toThrow();
    expect(readFileSync(body(), 'utf8')).toBe(SENTINEL);
  });
});
