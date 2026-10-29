/** Writes the generated audit pages into the marketing site. Run: npx tsx apps/gateway/scripts/build-audit-pages.ts */
import { readFileSync, writeFileSync } from 'node:fs';
import { renderAuditPages } from '../src/services/audit/audit-form-page.js';

export const MARKER_START = '<!-- AUDIT PAGES:';
export const MARKER_END = '<!-- END AUDIT PAGES -->';
const TARGET = new URL('../../dashboard/public/marketing-body.html', import.meta.url);

export function withAuditPages(html: string): string {
  const generated = renderAuditPages();
  const a = html.indexOf(MARKER_START);
  if (a !== -1) {
    const b = html.indexOf(MARKER_END, a) + MARKER_END.length;
    return html.slice(0, a) + generated + html.slice(b);
  }
  const anchor = '<!-- ====== SECURITY ====== -->';
  const at = html.indexOf(anchor);
  if (at === -1) throw new Error('anchor not found');
  return html.slice(0, at) + generated + '\n' + html.slice(at);
}

if (process.argv[1] && process.argv[1].endsWith('build-audit-pages.ts')) {
  writeFileSync(TARGET, withAuditPages(readFileSync(TARGET, 'utf8')));
  console.log('Audit pages written.');
}
