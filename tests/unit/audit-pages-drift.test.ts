import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { withAuditPages } from '../../apps/gateway/scripts/build-audit-pages.js';
import { AUDIT_FIELD_IDS } from '../../apps/gateway/src/services/audit/audit-form-definition.js';

const html = readFileSync(new URL('../../apps/dashboard/public/marketing-body.html', import.meta.url), 'utf8');

describe('audit pages', () => {
  it('marketing-body.html is up to date with the question list (run apps/gateway/scripts/build-audit-pages.ts)', () => {
    expect(withAuditPages(html)).toBe(html);
  });
  it('has an input for every question the gateway accepts, and no others', () => {
    const page = html.slice(html.indexOf('id="page-audit"'), html.indexOf('id="page-audit-pay"'));
    const names = new Set([...page.matchAll(/name="([a-z0-9_]+)"/g)].map((m) => m[1]));
    expect(names).toEqual(new Set(AUDIT_FIELD_IDS));
  });
});

describe('audit form draft in the page script', () => {
  const script = readFileSync(new URL('../../apps/dashboard/public/halla_main.js', import.meta.url), 'utf8');
  const form = script.slice(script.indexOf('function initAuditPages'));
  it('has a saved indicator in the generated page, shown for both languages by the script', () => {
    expect(html).toContain('class="audit-saved"');
    expect(form).toContain('Your answers are saved');
    expect(form).toContain('تم حفظ إجاباتك');
    expect(form).toContain('Saved on this device');
    expect(form).toContain('تم الحفظ على هذا الجهاز');
  });
  it('loads the server draft, compares timestamps, saves debounced and on page hide', () => {
    expect(form).toContain("'/draft?t='");
    expect(form).toContain('remoteAt > savedAt');
    expect(form).toContain('setTimeout(() => { pushServer(false); }, 2000)');
    expect(form).toContain("'pagehide'");
    expect(form).toContain('visibilitychange');
    expect(form).toContain('keepalive');
    expect(form).toContain('sendBeacon');
  });
  it('stops saving once the answers are submitted', () => {
    expect(form).toContain('submitted = true');
  });
});
