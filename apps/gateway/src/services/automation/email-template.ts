/**
 * Shared branded HTML wrapper for every automated notification email.
 * Table-based layout with inline styles — the only markup pattern that
 * renders consistently across Gmail, Outlook, and Apple Mail.
 */
import { getDashboardBaseUrl } from '../integrations/oauth-redirect.js';

const FONT = "'Segoe UI', Helvetica, Arial, sans-serif";

const BRAND = {
  black: '#0A0A0A',
  accent: '#0EA5E9',
  accentDark: '#0284C7',
  gray50: '#F9FAFB',
  gray100: '#F3F4F6',
  gray200: '#E5E7EB',
  gray400: '#9CA3AF',
  gray500: '#6B7280',
  gray600: '#4B5563',
  white: '#FFFFFF',
};

export interface EmailLayoutOptions {
  /** Short label above the title, e.g. "Appointment confirmed" */
  eyebrow?: string;
  title: string;
  /** Body content — plain HTML, already-safe (no user input). */
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  /** Hidden preview text shown next to the subject in inbox lists. */
  preheader?: string;
}

export function renderBrandedEmail(options: EmailLayoutOptions): string {
  const logoUrl = `${getDashboardBaseUrl()}/logo-receptionist-nav.jpg`;
  const { eyebrow, title, bodyHtml, ctaLabel, ctaUrl, preheader } = options;

  const ctaBlock = ctaLabel && ctaUrl
    ? `
    <tr>
      <td style="padding: 4px 40px 36px;">
        <a href="${ctaUrl}" target="_blank" style="display: inline-block; background: ${BRAND.accent}; color: ${BRAND.white}; text-decoration: none; font-family: ${FONT}; font-size: 14px; font-weight: 600; padding: 13px 28px; border-radius: 8px;">${ctaLabel} &rarr;</a>
      </td>
    </tr>`
    : '';

  const eyebrowBlock = eyebrow
    ? `<p style="margin: 0 0 10px; font-family: ${FONT}; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: ${BRAND.accent};">${eyebrow}</p>`
    : '';

  const preheaderBlock = preheader
    ? `<div style="display: none; max-height: 0; overflow: hidden; mso-hide: all; font-size: 1px; line-height: 1px; color: ${BRAND.gray50};">${preheader}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background: ${BRAND.gray100}; font-family: ${FONT};">
${preheaderBlock}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: ${BRAND.gray100};">
    <tr>
      <td align="center" style="padding: 40px 16px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width: 560px; width: 100%; background: ${BRAND.white}; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.06);">
          <tr>
            <td style="background: ${BRAND.black}; padding: 26px 40px;">
              <img src="${logoUrl}" alt="Halla AI" width="110" style="width: 110px; height: auto; display: block; border: 0;">
            </td>
          </tr>
          <tr>
            <td style="height: 4px; line-height: 4px; font-size: 0; background: ${BRAND.accent};">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding: 40px 40px 8px;">
              ${eyebrowBlock}
              <h1 style="margin: 0 0 20px; font-family: ${FONT}; font-size: 22px; font-weight: 700; letter-spacing: -0.01em; color: ${BRAND.black};">${title}</h1>
              <div style="font-family: ${FONT}; font-size: 15px; line-height: 1.65; color: ${BRAND.gray600};">
                ${bodyHtml}
              </div>
            </td>
          </tr>
          ${ctaBlock}
          <tr>
            <td style="padding: 22px 40px; border-top: 1px solid ${BRAND.gray200};">
              <p style="margin: 0; font-family: ${FONT}; font-size: 12px; line-height: 1.6; color: ${BRAND.gray400};">
                Sent by <strong style="color: ${BRAND.gray500};">Halla AI</strong> — your AI receptionist, answering every call 24/7.
                <br>
                <a href="${getDashboardBaseUrl()}" style="color: ${BRAND.gray500}; text-decoration: underline;">hallaai.com</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Small styled key/value list used inside email bodies (appointment/lead details). */
export function renderDetailList(rows: Array<{ label: string; value: string }>): string {
  const items = rows
    .map(
      (r, i) => `
      <tr>
        <td style="padding: 10px 0; font-family: ${FONT}; font-size: 13px; color: ${BRAND.gray500}; width: 130px; vertical-align: top; border-top: ${i === 0 ? 'none' : `1px solid ${BRAND.gray200}`};">${r.label}</td>
        <td style="padding: 10px 0; font-family: ${FONT}; font-size: 14px; color: ${BRAND.black}; font-weight: 600; vertical-align: top; border-top: ${i === 0 ? 'none' : `1px solid ${BRAND.gray200}`};">${r.value}</td>
      </tr>`
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 18px 0; background: ${BRAND.gray50}; border-radius: 8px; padding: 4px 16px;"><tbody>${items}</tbody></table>`;
}

/** Plain-text fallback so clients without HTML rendering (and spam filters) see clean content too. */
export function stripToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&rarr;/g, '->')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
