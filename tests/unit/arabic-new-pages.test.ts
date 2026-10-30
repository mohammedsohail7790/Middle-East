import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = readFileSync(new URL('../../apps/dashboard/public/marketing-body.html', import.meta.url), 'utf8');
const page = (id: string, next: string) => html.slice(html.indexOf(`id="page-${id}"`), html.indexOf(next, html.indexOf(`id="page-${id}"`)));

// Visible text that is not wrapped in a lang-en / lang-ar pair (ignoring numbers, e-mail addresses, brand names and the placeholders inside inputs).
function untranslated(block: string): string[] {
  const stripped = block.replace(/<span class="lang-en">[\s\S]*?<\/span><span class="lang-ar">[\s\S]*?<\/span>/g, '<T/>').replace(/<option[^>]*data-ar="[^"]*"[^>]*>[^<]*<\/option>/g, '<T/>').replace(/<script[\s\S]*?<\/script>/g, '');
  return [...stripped.matchAll(/>([^<>]+)</g)].map((m) => m[1].trim()).filter((t) => t && !/^[\d\W]*$/.test(t) && !/^(QuickBooks|Xero|Zoho Books|Tally|SAP Business One|Odoo|NetSuite|Microsoft Dynamics|Zoho One|HubSpot|Zoho CRM|Salesforce|Google Workspace|Microsoft 365|hello@hallaai\.com)$/.test(t));
}

describe('Arabic on the new pages', () => {
  it('the consultancy page has Arabic for all of its text', () => {
    expect(untranslated(page('consultancy', '<div id="page-intelligence"'))).toEqual([]);
  });
  it('Form 1 has Arabic for all of its text', () => {
    expect(untranslated(page('fit-check', '<!-- AUDIT PAGES:'))).toEqual([]);
  });
  it('Form 2, the payment page and the thank-you page have Arabic for all of their text', () => {
    expect(untranslated(html.slice(html.indexOf('<!-- AUDIT PAGES:'), html.indexOf('<!-- END AUDIT PAGES -->')))).toEqual([]);
  });
});
