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
