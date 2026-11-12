import type { LinkPayload } from './signed-link.js';
import { isAuditCurrency, priceText } from './audit-pricing.js';
import { paymentUrl, PAYMENT_WINDOW_DAYS } from './audit-links.js';
import { sendClientAuditMail, para } from './audit-client-mail.js';
import { escapeHtml } from '../automation/email-template.js';

/**
 * The "your audit is ready, please pay" email. Used by the old "send the payment link" button and by the review page's Approve button, so both send exactly the same message.
 * Returns why it did not send instead of throwing for the expected cases; a failure from the mail service still throws.
 */
export type PaymentMailResult = 'sent' | 'not-configured' | 'no-currency' | 'no-link';

export async function sendPaymentLinkEmail(p: LinkPayload, lang: 'en' | 'ar' = 'en'): Promise<PaymentMailResult> {
  const fee = isAuditCurrency(p.cur) ? priceText(p.cur) : undefined;
  if (!fee) return 'no-currency';
  const link = paymentUrl({ id: p.id, company: p.company, email: p.email, name: p.name, cur: p.cur });
  if (!link) return 'no-link';
  if (lang === 'ar') {
    return sendClientAuditMail({
      to: p.email,
      rtl: true,
      eyebrow: 'تدقيق الفرص',
      title: 'تدقيقك جاهز',
      subject: `تدقيق الفرص جاهز، ${p.company}`,
      preheader: 'ادفع رسوم التدقيق لتستلمه.',
      bodyHtml:
        para(`مرحباً ${escapeHtml(p.name || '')}،`) +
        para(`تدقيق الفرص الخاص بـ ${escapeHtml(p.company)} جاهز. لاستلامه، يرجى دفع رسوم التدقيق (${escapeHtml(fee)}) عبر الرابط الآمن أدناه خلال ${PAYMENT_WINDOW_DAYS} أيام.`) +
        para('سنرسل لك التدقيق الكامل بالبريد الإلكتروني فور وصول الدفع. رسوم التدقيق منفصلة عن أي بناء، ولا تُسترد بعد تسليم التدقيق.'),
      ctaLabel: 'ادفع رسوم التدقيق',
      ctaUrl: link,
    });
  }
  return sendClientAuditMail({
    to: p.email,
    eyebrow: 'Opportunity Audit',
    title: 'Your audit is ready',
    subject: `Your Opportunity Audit is ready, ${p.company}`,
    preheader: 'Pay the audit fee to receive your audit.',
    bodyHtml:
      para(`Hi ${escapeHtml(p.name || 'there')},`) +
      para(`Your Opportunity Audit for ${escapeHtml(p.company)} is ready. To receive it, please pay the audit fee (${escapeHtml(fee)}) using the secure link below within ${PAYMENT_WINDOW_DAYS} days.`) +
      para('We will send you the full audit by email as soon as your payment arrives. The audit fee is separate from any build, and it is not refundable once the audit has been delivered.'),
    ctaLabel: 'Pay the audit fee',
    ctaUrl: link,
  });
}
