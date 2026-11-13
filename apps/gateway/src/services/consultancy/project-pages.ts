import { escapeHtml } from '../automation/email-template.js';
import type { PublicProjectView } from './project-store.js';

/**
 * The client's read-only project status page. Server-rendered HTML, no scripts, every stored string escaped. English by default; Arabic (right to left) when the proposal was in Arabic.
 * The bad / expired / wrong-kind link page is one and the same page, so nobody can tell those cases apart.
 */
const h = escapeHtml;
type Lang = 'en' | 'ar';

const T = {
  en: {
    eyebrow: 'Halla AI Consultancy', title: 'Project status', status: 'Status', start: 'Start date', delivery: 'Delivery date', notSet: 'To be confirmed',
    overdue: 'This project is past its delivery date. We will update you as soon as we have a new date.',
    milestones: 'Milestones', done: 'Done', pending: 'Pending', none: 'No milestones yet.', due: 'due',
    handover: 'Handover checklist', handoverNote: 'You own everything: code, data, accounts and documentation are handed over in full.',
    ready: 'Handed over', notYet: 'Not yet', code: 'Code', data: 'Data', accounts: 'Accounts', documentation: 'Documentation',
    notes: 'Notes from the team', warranty: 'Free bug fixes until', warrantyNote: 'Bug fixes are free for the first 30 days after delivery.',
    footer: 'Questions? Write to hello@hallaai.com.',
    statuses: { planned: 'Planned', in_progress: 'In progress', delivered: 'Delivered', on_hold: 'On hold', cancelled: 'Cancelled' },
    invalidTitle: 'This link does not work', invalid: 'This link is not valid or has expired. Please write to hello@hallaai.com and we will send you a new one.',
  },
  ar: {
    eyebrow: 'هلا للاستشارات الذكية', title: 'حالة المشروع', status: 'الحالة', start: 'تاريخ البدء', delivery: 'تاريخ التسليم', notSet: 'سيتم تأكيده',
    overdue: 'تجاوز هذا المشروع تاريخ التسليم المتفق عليه. سنوافيكم بموعد جديد في أقرب وقت.',
    milestones: 'المراحل', done: 'مكتملة', pending: 'قيد التنفيذ', none: 'لا توجد مراحل بعد.', due: 'الموعد',
    handover: 'قائمة التسليم', handoverNote: 'كل شيء ملك لكم: يتم تسليم الكود والبيانات والحسابات والوثائق كاملة.',
    ready: 'تم التسليم', notYet: 'لم يتم بعد', code: 'الكود', data: 'البيانات', accounts: 'الحسابات', documentation: 'الوثائق',
    notes: 'ملاحظات من الفريق', warranty: 'إصلاح الأخطاء مجاني حتى', warrantyNote: 'إصلاح الأخطاء مجاني خلال أول 30 يوماً بعد التسليم.',
    footer: 'لديكم أسئلة؟ راسلونا على hello@hallaai.com.',
    statuses: { planned: 'مخطط', in_progress: 'قيد التنفيذ', delivered: 'تم التسليم', on_hold: 'متوقف مؤقتاً', cancelled: 'ملغى' },
    invalidTitle: 'الرابط لا يعمل', invalid: 'هذا الرابط غير صالح أو انتهت صلاحيته. راسلونا على hello@hallaai.com وسنرسل لكم رابطاً جديداً.',
  },
} as const;

const shell = (lang: Lang, title: string, inner: string): string =>
  `<!doctype html><html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${h(title)}</title></head>` +
  `<body style="margin:0;background:#f6f5f2;font-family:-apple-system,Segoe UI,Tahoma,Roboto,Helvetica,Arial,sans-serif;color:#1b1f27"><div style="max-width:780px;margin:32px auto;padding:0 16px">${inner}</div></body></html>`;

const card = (inner: string): string => `<div style="background:#fff;border:1px solid #e3e0d8;border-radius:12px;padding:22px;margin:0 0 16px">${inner}</div>`;
const H2 = 'font-size:16px;margin:0 0 12px';

/** One neutral page for every link that cannot be used. Same words whatever went wrong. */
export function renderInvalidProjectPage(): string {
  const t = T.en;
  return shell('en', t.invalidTitle, card(`<h1 style="font-size:20px;margin:0 0 8px">${h(t.invalidTitle)}</h1><p style="margin:0;font-size:15px;line-height:1.6">${h(t.invalid)}</p>`));
}

const fmtDate = (d: string | null, lang: Lang, fallback: string): string => {
  if (!d) return fallback;
  const dt = new Date(`${d}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) return fallback;
  // Latin digits in both languages keep dates unambiguous inside right-to-left text.
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(dt);
};

export function renderProjectPage(v: PublicProjectView): string {
  const lang: Lang = v.language === 'ar' ? 'ar' : 'en';
  const t = T[lang];
  const statusLabel = (t.statuses as Record<string, string>)[v.status] ?? v.status;
  const dl = (label: string, value: string) => `<div><div style="font-size:12px;color:#5b6472">${h(label)}</div><div style="font-size:15px;font-weight:600;margin-top:2px">${h(value)}</div></div>`;

  const head =
    `<div style="font-size:12px;letter-spacing:.08em;color:#8a6d1d;font-weight:700;margin:0 0 6px">${h(t.eyebrow)}</div>` +
    `<h1 style="font-size:24px;margin:0 0 4px">${h(v.name)}</h1><p style="margin:0 0 18px;color:#5b6472;font-size:14px">${h(t.title)}</p>`;

  const summary = card(
    `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px">` +
      dl(t.status, statusLabel) + dl(t.start, fmtDate(v.startsOn, lang, t.notSet)) + dl(t.delivery, fmtDate(v.deliveryDate, lang, t.notSet)) +
      `</div>` +
      (v.overdue ? `<p style="margin:16px 0 0;background:#fdf3e1;border:1px solid #e8c887;border-radius:8px;padding:10px 14px;font-size:14px">${h(t.overdue)}</p>` : '') +
      (v.warrantyEndsOn ? `<p style="margin:16px 0 0;background:#e7f5ec;border:1px solid #9ad0ae;border-radius:8px;padding:10px 14px;font-size:14px"><b>${h(t.warranty)} ${h(fmtDate(v.warrantyEndsOn, lang, ''))}</b><br>${h(t.warrantyNote)}</p>` : ''),
  );

  const items = v.milestones.length
    ? `<ul style="list-style:none;margin:0;padding:0">${v.milestones
        .map(
          (m) =>
            `<li style="display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid #eee9dc;font-size:14px"><span>${m.done ? '&#10003; ' : '&#9675; '}${h(m.title)}${m.dueOn ? ` <span style="color:#5b6472">(${h(t.due)} ${h(fmtDate(m.dueOn, lang, ''))})</span>` : ''}</span><span style="font-weight:600;color:${m.done ? '#1f7a43' : '#8a6d1d'}">${h(m.done ? t.done : t.pending)}</span></li>`,
        )
        .join('')}</ul>`
    : `<p style="margin:0;font-size:14px;color:#5b6472">${h(t.none)}</p>`;
  const milestones = card(`<h2 style="${H2}">${h(t.milestones)}</h2>${items}`);

  const hand = (['code', 'data', 'accounts', 'documentation'] as const)
    .map((k) => `<li style="display:flex;justify-content:space-between;padding:8px 0;border-top:1px solid #eee9dc;font-size:14px"><span>${v.handover[k] ? '&#10003; ' : '&#9675; '}${h(t[k])}</span><span style="font-weight:600;color:${v.handover[k] ? '#1f7a43' : '#5b6472'}">${h(v.handover[k] ? t.ready : t.notYet)}</span></li>`)
    .join('');
  const handover = card(`<h2 style="${H2}">${h(t.handover)}</h2><p style="margin:0 0 8px;font-size:13px;color:#5b6472">${h(t.handoverNote)}</p><ul style="list-style:none;margin:0;padding:0">${hand}</ul>`);

  const notes = v.clientNotes?.trim()
    ? card(`<h2 style="${H2}">${h(t.notes)}</h2><p style="margin:0;font-size:14px;line-height:1.6;white-space:pre-wrap">${h(v.clientNotes)}</p>`)
    : '';

  return shell(lang, `${v.name} - ${t.title}`, head + summary + milestones + handover + notes + `<p style="font-size:13px;color:#5b6472">${h(t.footer)}</p>`);
}
