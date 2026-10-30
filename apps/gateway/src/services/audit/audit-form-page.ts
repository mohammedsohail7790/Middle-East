import { AUDIT_SECTIONS, type Question, type Section } from './audit-form-definition.js';
import { escapeHtml } from '../automation/email-template.js';

/**
 * The website pages for the paid audit, generated from the question list so the page and the gateway cannot drift apart.
 * `npx tsx apps/gateway/scripts/build-audit-pages.ts` writes the result into apps/dashboard/public/marketing-body.html between the AUDIT PAGES markers,
 * and a test fails if the file is out of date.
 */
const LABEL = 'font-size:0.83rem;font-weight:600;color:var(--gray-700);display:block;margin-bottom:8px';
const HINT = 'font-weight:400;color:var(--gray-500)';

function field(question: Question): string {
  const hint = question.hint ? ` <span style="${HINT}">(${escapeHtml(question.hint)})</span>` : '';
  const label = `<label style="${LABEL}">${escapeHtml(question.label)}${hint}</label>`;
  let input: string;
  if (question.type === 'textarea') input = `<textarea class="roi-input" name="${question.id}" rows="3" maxlength="4000"></textarea>`;
  else if (question.type === 'select') input = `<select class="roi-select" name="${question.id}"><option value="">Choose…</option>${(question.options ?? []).map((o) => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('')}</select>`;
  else input = `<input class="roi-input" type="text" name="${question.id}" maxlength="4000">`;
  return `<div data-q="${question.id}">${label}${input}</div>`;
}

function section(s: Section): string {
  const head = `<h4 style="margin:28px 0 0;font-size:1.05rem;color:var(--gray-800)">${escapeHtml(s.title)}</h4>${s.intro ? `<p style="font-size:0.85rem;margin:4px 0 0">${escapeHtml(s.intro)}</p>` : ''}`;
  if (!s.repeat) return `<div>${head}<div style="display:grid;gap:16px;margin-top:12px">${s.questions.map(field).join('')}</div></div>`;
  const { noun, count } = s.repeat;
  const perBlock = s.questions.length / count;
  const blocks = Array.from({ length: count }, (_, i) => {
    const qs = s.questions.slice(i * perBlock, (i + 1) * perBlock);
    const hidden = i > 0 ? ' style="display:none" data-extra="1"' : '';
    return `<div data-block="${s.id}"${hidden}><h5 style="margin:18px 0 0;font-size:0.95rem;color:var(--gray-800)">${escapeHtml(noun[0].toUpperCase() + noun.slice(1))} ${i + 1}</h5><div style="display:grid;gap:16px;margin-top:10px">${qs.map(field).join('')}</div></div>`;
  }).join('');
  return `<div>${head}${blocks}<button type="button" class="btn btn-secondary" style="margin-top:16px" data-add="${s.id}" data-noun="${escapeHtml(noun)}">+ Add another ${escapeHtml(noun.toLowerCase())}</button></div>`;
}

const hero = (title: string, text: string) => `<div class="page-hero"><div class="container text-center"><div class="label">Halla AI Consultancy</div><h1>${title}</h1><p style="margin-top:12px;font-size:1.05rem;max-width:560px;margin-left:auto;margin-right:auto">${text}</p></div></div>`;

export function renderAuditPages(): string {
  const form2 = `<div id="page-audit" class="page">
  ${hero('Opportunity Audit questionnaire', 'The details we need to study your business. It takes about 30 to 45 minutes. Your answers are saved on this device as you type, so you can close the page and come back.')}
  <section class="section"><div class="container" style="max-width:720px">
    <div class="card" style="padding:40px">
      <div id="auditLinkNote" role="status" style="font-size:0.9rem;margin-bottom:16px"></div>
      <p style="font-size:0.875rem;margin-bottom:8px">Answer what you can and leave the rest blank; "not sure" is a fine answer. Please do not type passwords, card numbers or ID numbers. Everything you send is covered by the NDA we signed.</p>
      <form id="auditForm" novalidate style="display:grid;gap:22px">
        ${AUDIT_SECTIONS.map(section).join('\n        ')}
        <button type="button" class="btn btn-primary btn-lg" style="width:100%;font-size:1rem" id="auditSubmitBtn">Send my answers →</button>
        <div class="audit-status" role="status" aria-live="polite" style="font-size:0.9rem"></div>
      </form>
    </div>
  </div></section>
</div>`;
  const pay = `<div id="page-audit-pay" class="page">
  ${hero('Your audit is ready', 'Pay the audit fee and we send you the full audit.')}
  <section class="section"><div class="container" style="max-width:560px">
    <div class="card" style="padding:40px;text-align:center">
      <div id="auditPayInfo" style="font-size:1rem">Checking your link…</div>
      <button type="button" class="btn btn-primary btn-lg" style="width:100%;font-size:1rem;margin-top:20px;display:none" id="auditPayBtn">Pay securely →</button>
      <div class="audit-pay-status" role="status" aria-live="polite" style="font-size:0.9rem;margin-top:12px"></div>
      <p style="font-size:0.78rem;color:var(--gray-400);margin-top:16px">Card payment is handled by Stripe. The audit fee is separate from any build. Once we deliver your audit, the fee cannot be refunded.</p>
    </div>
  </div></section>
</div>`;
  const paid = `<div id="page-audit-paid" class="page">
  ${hero('Thank you, payment received', 'We will send your audit to the email address you gave us. If you do not see it within one business day, write to hello@hallaai.com.')}
</div>`;
  return `<!-- AUDIT PAGES: generated by apps/gateway/scripts/build-audit-pages.ts. Do not edit by hand. -->\n${form2}\n${pay}\n${paid}\n<!-- END AUDIT PAGES -->`;
}
