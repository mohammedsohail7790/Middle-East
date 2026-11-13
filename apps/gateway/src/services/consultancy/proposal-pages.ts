import { escapeHtml as h } from '../automation/email-template.js';
import { formatPrice } from '../audit/audit-pricing.js';
import { minorPerUnit, termsHash, type ProposalRow } from './proposal-store.js';

/**
 * The proposal page a client sees. Plain HTML, no scripts, same look as the audit review and payment pages. Every stored text goes through escapeHtml.
 * Arabic pages are right to left (dir="rtl" on the whole document).
 */
type Lang = 'en' | 'ar';

const T = {
  en: {
    eyebrow: 'Build proposal',
    scope: 'Scope',
    items: 'What we will build',
    total: 'Total fixed price',
    delivery: 'Delivery',
    weeks: (n: number) => `${n} week${n === 1 ? '' : 's'} from the start of the build`,
    validUntil: 'Valid until',
    terms: 'This price is fixed for each item above. Nothing is built until you approve this proposal in writing.',
    fullName: 'Your full name',
    agree: 'I accept this price and scope in writing',
    accept: 'Accept proposal',
    decline: 'Decline',
    reason: 'Reason (optional)',
    declineHeading: 'Not for you?',
    declineHelp: 'You can tell us why, or write to us at hello@hallaai.com to change anything.',
    fingerprint: 'Terms fingerprint',
    acceptedTitle: 'Proposal accepted',
    acceptedBody: (name: string, when: string) => `Accepted in writing by ${name} on ${when}. A confirmation with these terms has been emailed. We will be in touch to plan the start.`,
    declinedTitle: 'Proposal declined',
    declinedBody: 'This proposal was declined. If that was a mistake, write to hello@hallaai.com.',
    withdrawnTitle: 'Proposal withdrawn',
    withdrawnBody: 'We have withdrawn this proposal. Please write to hello@hallaai.com for an updated one.',
    expiredTitle: 'Proposal expired',
    expiredBody: 'This proposal is no longer valid. Please write to hello@hallaai.com and we will send a new one.',
    notReadyTitle: 'Proposal not available',
    notReadyBody: 'This proposal is not open yet. Please write to hello@hallaai.com.',
    invalidTitle: 'Link not valid',
    invalidBody: 'This link is not valid. Please open the whole link from our email, or write to hello@hallaai.com.',
    expiredLinkBody: 'This link has expired. Please write to hello@hallaai.com and we will help.',
    needName: 'Please type your full name.',
    needAgree: 'Please tick the box to accept in writing.',
    changed: 'These terms have changed since you opened the page. Please reload it and read them again.',
    declineThanks: 'Thank you. We have recorded your decision.',
  },
  ar: {
    eyebrow: 'عرض البناء',
    scope: 'النطاق',
    items: 'ما سنقوم ببنائه',
    total: 'السعر الثابت الإجمالي',
    delivery: 'مدة التسليم',
    weeks: (n: number) => `${n} أسبوع من بداية البناء`,
    validUntil: 'ساري حتى',
    terms: 'هذا السعر ثابت لكل بند أعلاه. لن يبدأ أي بناء قبل موافقتك الكتابية على هذا العرض.',
    fullName: 'اسمك الكامل',
    agree: 'أوافق كتابياً على هذا السعر وهذا النطاق',
    accept: 'قبول العرض',
    decline: 'رفض',
    reason: 'السبب (اختياري)',
    declineHeading: 'غير مناسب لك؟',
    declineHelp: 'يمكنك إخبارنا بالسبب، أو مراسلتنا على hello@hallaai.com لتعديل أي شيء.',
    fingerprint: 'بصمة الشروط',
    acceptedTitle: 'تم قبول العرض',
    acceptedBody: (name: string, when: string) => `تمت الموافقة كتابياً من ${name} بتاريخ ${when}. أرسلنا تأكيداً بهذه الشروط إلى بريدك. سنتواصل معك لتحديد موعد البداية.`,
    declinedTitle: 'تم رفض العرض',
    declinedBody: 'تم رفض هذا العرض. إن كان ذلك بالخطأ، راسلنا على hello@hallaai.com.',
    withdrawnTitle: 'تم سحب العرض',
    withdrawnBody: 'لقد سحبنا هذا العرض. يرجى مراسلتنا على hello@hallaai.com للحصول على عرض محدّث.',
    expiredTitle: 'انتهت صلاحية العرض',
    expiredBody: 'لم يعد هذا العرض ساري المفعول. يرجى مراسلتنا على hello@hallaai.com وسنرسل لك عرضاً جديداً.',
    notReadyTitle: 'العرض غير متاح',
    notReadyBody: 'هذا العرض غير مفتوح بعد. يرجى مراسلتنا على hello@hallaai.com.',
    invalidTitle: 'الرابط غير صالح',
    invalidBody: 'هذا الرابط غير صالح. يرجى فتح الرابط كاملاً من رسالتنا، أو مراسلتنا على hello@hallaai.com.',
    expiredLinkBody: 'انتهت صلاحية هذا الرابط. يرجى مراسلتنا على hello@hallaai.com وسنساعدك.',
    needName: 'يرجى كتابة اسمك الكامل.',
    needAgree: 'يرجى تحديد المربع للموافقة كتابياً.',
    changed: 'تغيّرت هذه الشروط منذ فتحت الصفحة. يرجى إعادة تحميلها وقراءتها مرة أخرى.',
    declineThanks: 'شكراً لك. سجّلنا قرارك.',
  },
} as const;

export type PageText = (typeof T)[Lang];
export const proposalText = (lang: Lang): PageText => T[lang];

/** A date as the client reads it: day, month name, year, in UTC so the page does not depend on the server's timezone. */
export function formatDate(value: Date | string, lang: Lang): string {
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleDateString(lang === 'ar' ? 'ar-AE-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export const money = (currency: string, minor: number): string => formatPrice(currency as never, minor / minorPerUnit(currency));

const shell = (lang: Lang, title: string, inner: string): string =>
  `<!doctype html><html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${h(title)}</title></head>` +
  `<body style="margin:0;background:#f6f5f2;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,'Noto Naskh Arabic','Geeza Pro',sans-serif;color:#1b1f27"><div style="max-width:680px;margin:32px auto;padding:0 16px">${inner}</div></body></html>`;

const card = (inner: string): string => `<div style="background:#fff;border:1px solid #e3e0d8;border-radius:12px;padding:24px;margin:0 0 16px">${inner}</div>`;
const FIELD = 'width:100%;box-sizing:border-box;font:inherit;font-size:15px;padding:10px 12px;border:1px solid #c9c5ba;border-radius:8px';
const BTN = 'font:inherit;font-size:15px;font-weight:600;padding:11px 22px;border:0;border-radius:8px;background:#121417;color:#fff;cursor:pointer';

/** A short message page (expired, declined, invalid link and so on). */
export function renderMessagePage(lang: Lang, title: string, body: string, tone: 'good' | 'bad' | 'info' = 'info'): string {
  const colour = tone === 'good' ? '#1f7a4d' : tone === 'bad' ? '#b3261e' : '#7a5a1e';
  return shell(lang, title, card(`<h1 style="font-size:22px;margin:0 0 12px;color:${colour}">${h(title)}</h1><p style="margin:0;line-height:1.6">${h(body)}</p>`));
}

function termsBlock(p: ProposalRow, lang: Lang): string {
  const t = T[lang];
  const rows = p.items
    .map((i) => `<tr><td style="padding:9px 0;border-top:1px solid #eeebe3">${h(i.title)}</td><td style="padding:9px 0;border-top:1px solid #eeebe3;text-align:${lang === 'ar' ? 'left' : 'right'};white-space:nowrap" dir="ltr">${h(money(p.currency, Number(i.priceMinor)))}</td></tr>`)
    .join('');
  return (
    `<h1 style="font-size:24px;margin:0 0 4px">${h(p.title)}</h1><p style="margin:0 0 18px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#7a5a1e">${h(t.eyebrow)}</p>` +
    (p.scope ? `<h2 style="font-size:15px;margin:0 0 6px">${h(t.scope)}</h2><div style="white-space:pre-wrap;line-height:1.6;margin:0 0 18px">${h(p.scope)}</div>` : '') +
    `<h2 style="font-size:15px;margin:0 0 6px">${h(t.items)}</h2><table style="width:100%;border-collapse:collapse;font-size:15px"><tbody>${rows}` +
    `<tr><td style="padding:12px 0 0;border-top:2px solid #121417;font-weight:700">${h(t.total)}</td><td style="padding:12px 0 0;border-top:2px solid #121417;font-weight:700;text-align:${lang === 'ar' ? 'left' : 'right'};white-space:nowrap" dir="ltr">${h(money(p.currency, p.total_minor))}</td></tr></tbody></table>` +
    `<p style="margin:18px 0 0;line-height:1.6">` +
    (p.delivery_weeks ? `<strong>${h(t.delivery)}:</strong> ${h(t.weeks(p.delivery_weeks))}<br>` : '') +
    `<strong>${h(t.validUntil)}:</strong> ${h(formatDate(p.valid_until, lang))}</p>`
  );
}

/** The page for a proposal the client can still act on, or the right message for any other state. */
export function renderProposalPage(p: ProposalRow, token: string, notice?: { tone: 'good' | 'bad'; text: string }): string {
  const lang = p.language;
  const t = T[lang];
  switch (p.status) {
    case 'accepted':
      return shell(lang, t.acceptedTitle, card(`<h1 style="font-size:22px;margin:0 0 12px;color:#1f7a4d">${h(t.acceptedTitle)}</h1><p style="margin:0 0 18px;line-height:1.6">${h(t.acceptedBody(p.accepted_name ?? '', p.accepted_at ? formatDate(p.accepted_at, lang) : ''))}</p>`) + card(termsBlock(p, lang)));
    case 'declined':
      return renderMessagePage(lang, t.declinedTitle, t.declinedBody);
    case 'withdrawn':
      return renderMessagePage(lang, t.withdrawnTitle, t.withdrawnBody);
    case 'expired':
      return renderMessagePage(lang, t.expiredTitle, t.expiredBody, 'bad');
    case 'sent':
      break;
    default:
      return renderMessagePage(lang, t.notReadyTitle, t.notReadyBody);
  }
  const fp = termsHash(p);
  const note = notice ? `<p style="margin:0 0 16px;padding:10px 12px;border-radius:8px;background:${notice.tone === 'good' ? '#e7f4ec' : '#fbe9e7'}">${h(notice.text)}</p>` : '';
  const form =
    `<form method="post" action="accept" style="margin:0">` +
    `<input type="hidden" name="t" value="${h(token)}"><input type="hidden" name="terms" value="${h(fp)}">` +
    `<label style="display:block;font-weight:600;font-size:13px;margin:0 0 6px" for="fullName">${h(t.fullName)}</label>` +
    `<input id="fullName" name="name" maxlength="120" required autocomplete="name" style="${FIELD}">` +
    `<label style="display:flex;gap:10px;align-items:flex-start;margin:16px 0;line-height:1.5"><input type="checkbox" name="agree" value="yes" required style="margin-top:4px"><span>${h(t.agree)}</span></label>` +
    `<button type="submit" style="${BTN}">${h(t.accept)}</button></form>`;
  const declineForm =
    `<form method="post" action="decline" style="margin:0"><input type="hidden" name="t" value="${h(token)}">` +
    `<h2 style="font-size:15px;margin:0 0 6px">${h(t.declineHeading)}</h2><p style="margin:0 0 10px;font-size:14px;color:#555">${h(t.declineHelp)}</p>` +
    `<label style="display:block;font-weight:600;font-size:13px;margin:0 0 6px" for="reason">${h(t.reason)}</label>` +
    `<textarea id="reason" name="reason" rows="3" maxlength="2000" style="${FIELD}"></textarea>` +
    `<button type="submit" style="${BTN};background:#fff;color:#121417;border:1px solid #c9c5ba;margin-top:12px">${h(t.decline)}</button></form>`;
  return shell(
    lang,
    p.title,
    note + card(termsBlock(p, lang) + `<p style="margin:16px 0 0;font-size:14px;color:#555;line-height:1.6">${h(t.terms)}</p><p style="margin:8px 0 0;font-size:11px;color:#8a8a8a" dir="ltr">${h(t.fingerprint)}: ${h(fp.slice(0, 16))}</p>`) + card(form) + card(declineForm),
  );
}
