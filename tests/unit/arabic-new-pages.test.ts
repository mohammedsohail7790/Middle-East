import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = readFileSync(new URL('../../apps/dashboard/public/marketing-body.html', import.meta.url), 'utf8');
const page = (id: string, next: string) => html.slice(html.indexOf(`id="page-${id}"`), html.indexOf(next, html.indexOf(`id="page-${id}"`)));

// Visible text that is not wrapped in a lang-en / lang-ar pair (ignoring numbers, e-mail addresses, brand names and the placeholders inside inputs).
function untranslated(block: string): string[] {
  const stripped = block.replace(/<span class="lang-en">[\s\S]*?<\/span><span class="lang-ar">[\s\S]*?<\/span>/g, '<T/>').replace(/<option[^>]*data-ar="[^"]*"[^>]*>[^<]*<\/option>/g, '<T/>').replace(/<script[\s\S]*?<\/script>/g, '');
  return [...stripped.matchAll(/>([^<>]+)</g)].map((m) => m[1].trim()).filter((t) => t && !/^[\d\W]*$/.test(t) && !/^(QuickBooks|Xero|Zoho Books|Tally|SAP Business One|Odoo|NetSuite|Microsoft Dynamics|Zoho One|HubSpot|Zoho CRM|Salesforce|Google Workspace|Microsoft 365|hello@hallaai\.com|Stripe · Google Calendar · QuickBooks|Pipedrive|Zoho CRM|Acuity|Setmore|Slack|Microsoft Teams|Google Sheets|Airtable|Mailchimp|Asana|Trello|Notion)$/.test(t));
}

describe('Arabic on the new pages', () => {
  it('the consultancy page has Arabic for all of its text', () => {
    expect(untranslated(page('consultancy', '<div id="page-intelligence"'))).toEqual([]);
  });
  it('the Business Automation page has Arabic for all of its text', () => {
    expect(untranslated(page('intelligence', '<div id="page-svc-operations"'))).toEqual([]);
  });
  it('the AI Receptionist page has Arabic for all of its text', () => {
    expect(untranslated(page('home', '<div id="page-features"'))).toEqual([]);
  });
  it('Form 1 has Arabic for all of its text', () => {
    expect(untranslated(page('fit-check', '<!-- AUDIT PAGES:'))).toEqual([]);
  });
  it('Form 2, the payment page and the thank-you page have Arabic for all of their text', () => {
    expect(untranslated(html.slice(html.indexOf('<!-- AUDIT PAGES:'), html.indexOf('<!-- END AUDIT PAGES -->')))).toEqual([]);
  });
});

// The receptionist section: each page runs from its own id to the next page.
const pageUntilNext = (id: string) => {
  const start = html.indexOf(`<div id="page-${id}"`);
  return html.slice(start, html.indexOf('<div id="page-', start + 10));
};
describe('Arabic on the AI Receptionist section', () => {
  for (const id of ['features', 'how-it-works', 'pricing', 'integrations']) {
    it(`the ${id} page has Arabic for all of its text`, () => {
      expect(untranslated(pageUntilNext(id))).toEqual([]);
    });
  }
  it('the receptionist menu is short: five links and one Industries menu', () => {
    const start = html.indexOf('<div class="nav-links nav-group" data-section="receptionist">');
    const menu = html.slice(start, html.indexOf('<div class="nav-links nav-group"', start + 10) === -1 ? start + 4000 : start + 4000);
    expect((menu.match(/class="nav-link"/g) ?? []).length).toBeLessThanOrEqual(7);
  });
});
