/**
 * Shared branded HTML wrapper for every automated notification email.
 * Table-based layout with inline styles — the only markup pattern that
 * renders consistently across Gmail, Outlook, and Apple Mail.
 */
import { getDashboardBaseUrl } from '../integrations/oauth-redirect.js';

const FONT = "'Plus Jakarta Sans', 'Segoe UI', Helvetica, Arial, sans-serif";
/** Display face of the website headings (Cormorant Garamond); Georgia is what most mail clients fall back to. */
const FONT_DISPLAY = "'Cormorant Garamond', Georgia, 'Times New Roman', serif";

/** Escapes HTML-significant characters so untrusted input can't inject markup into emails. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const BRAND = {
  ink: '#121417',
  gold: '#C5A059',
  goldText: '#7A5A1E',
  paper: '#FAF9F6',
  sand: '#F3F1EC',
  line: '#E6E2D9',
  muted: '#6B6B70',
  body: '#3A3D42',
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
  /** Small label at the right of the header bar. Defaults to "AI Consultancy"; pass an empty string for none. */
  headerLabel?: string;
}

export function renderBrandedEmail(options: EmailLayoutOptions): string {
  const logoUrl = `${getDashboardBaseUrl()}/logo-halla-dark.png`;
  const { eyebrow, title, bodyHtml, ctaLabel, ctaUrl, preheader } = options;
  const headerLabel = options.headerLabel ?? 'AI Consultancy';

  const ctaBlock = ctaLabel && ctaUrl
    ? `
    <tr>
      <td class="px" style="padding: 8px 40px 36px;">
        <a href="${ctaUrl}" target="_blank" style="display: inline-block; background: ${BRAND.ink}; color: ${BRAND.white}; text-decoration: none; font-family: ${FONT}; font-size: 14px; font-weight: 600; padding: 14px 28px; border-radius: 8px; border-bottom: 3px solid ${BRAND.gold};">${escapeHtml(ctaLabel)} <span style="color: ${BRAND.gold};">&rarr;</span></a>
      </td>
    </tr>`
    : '';

  const eyebrowBlock = eyebrow
    ? `<p style="margin: 0 0 12px; font-family: ${FONT}; font-size: 11px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: ${BRAND.goldText};">${escapeHtml(eyebrow)}</p>`
    : '';

  const preheaderBlock = preheader
    ? `<div style="display: none; max-height: 0; overflow: hidden; mso-hide: all; font-size: 1px; line-height: 1px; color: ${BRAND.sand};">${escapeHtml(preheader)}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600&family=Plus+Jakarta+Sans:wght@400;600;700&display=swap" rel="stylesheet">
<title>${escapeHtml(title)}</title>
<style>
@media only screen and (max-width: 520px) {
  .outer { padding: 12px 6px !important; }
  .px { padding-left: 20px !important; padding-right: 20px !important; }
  .h1 { font-size: 26px !important; line-height: 1.15 !important; margin-bottom: 16px !important; }
}
</style>
</head>
<body style="margin: 0; padding: 0; background: ${BRAND.sand}; font-family: ${FONT};">
${preheaderBlock}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: ${BRAND.sand};">
    <tr>
      <td align="center" class="outer" style="padding: 36px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%; background: ${BRAND.white}; border: 1px solid ${BRAND.line}; border-radius: 14px; overflow: hidden;">
          <tr>
            <td bgcolor="${BRAND.ink}" class="px" style="background: ${BRAND.ink}; padding: 14px 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
                <td align="left"><img src="${logoUrl}" alt="Halla AI" width="120" style="width: 120px; height: auto; display: block; border: 0; font-family: ${FONT_DISPLAY}; font-size: 24px; font-weight: 600; color: ${BRAND.paper};"></td>
                <td align="right" style="font-family: ${FONT}; font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: ${BRAND.gold};">${escapeHtml(headerLabel)}</td>
              </tr></table>
            </td>
          </tr>
          <tr>
            <td style="height: 3px; line-height: 3px; font-size: 0; background: ${BRAND.gold};">&nbsp;</td>
          </tr>
          <tr>
            <td class="px" style="padding: 36px 40px 12px;">
              ${eyebrowBlock}
              <h1 class="h1" style="margin: 0 0 20px; font-family: ${FONT_DISPLAY}; font-size: 32px; line-height: 1.12; font-weight: 600; letter-spacing: -0.01em; color: ${BRAND.ink};">${escapeHtml(title)}</h1>
              <div style="font-family: ${FONT}; font-size: 15px; line-height: 1.65; color: ${BRAND.body};">
                ${bodyHtml}
              </div>
            </td>
          </tr>
          ${ctaBlock}
          <tr>
            <td class="px" style="background: ${BRAND.paper}; padding: 24px 40px; border-top: 1px solid ${BRAND.line};">
              <p style="margin: 0; font-family: ${FONT}; font-size: 12px; line-height: 1.7; color: ${BRAND.muted};">
                <strong style="color: ${BRAND.ink};">Halla AI</strong> &middot; End-to-end AI systems for businesses
                <br>
                <a href="${getDashboardBaseUrl()}" style="color: ${BRAND.goldText}; text-decoration: none;">hallaai.com</a> &middot;
                <a href="mailto:hello@hallaai.com" style="color: ${BRAND.goldText}; text-decoration: none;">hello@hallaai.com</a>
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
export function renderDetailList(rows: Array<{ label: string; value: string }>, heading?: string): string {
  const items = rows
    .map(
      (r, i) => `
      <tr>
        <td style="padding: 11px 0; font-family: ${FONT}; font-size: 13px; color: ${BRAND.muted}; width: 140px; vertical-align: top; border-top: ${i === 0 ? 'none' : `1px solid ${BRAND.line}`};">${escapeHtml(r.label)}</td>
        <td style="padding: 11px 0; font-family: ${FONT}; font-size: 14px; line-height: 1.55; color: ${BRAND.ink}; font-weight: 600; vertical-align: top; border-top: ${i === 0 ? 'none' : `1px solid ${BRAND.line}`};">${escapeHtml(r.value)}</td>
      </tr>`
    )
    .join('');
  const headingHtml = heading
    ? `<p style="margin: 28px 0 0; font-family: ${FONT}; font-size: 11px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: ${BRAND.goldText};">${escapeHtml(heading)}</p>`
    : '';
  return `${headingHtml}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: ${heading ? '10px' : '18px'} 0 0; background: ${BRAND.paper}; border: 1px solid ${BRAND.line}; border-radius: 10px;"><tbody><tr><td style="padding: 4px 18px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tbody>${items}</tbody></table></td></tr></tbody></table>`;
}

export type CalloutTone = 'good' | 'warn' | 'bad' | 'info';

const CALLOUT_TONES: Record<CalloutTone, { bar: string; bg: string; label: string }> = {
  good: { bar: '#1B7A33', bg: '#F1F8F2', label: '#1B7A33' },
  warn: { bar: BRAND.gold, bg: '#FBF6EC', label: BRAND.goldText },
  bad: { bar: '#B3261E', bg: '#FCF3F2', label: '#B3261E' },
  info: { bar: BRAND.ink, bg: BRAND.paper, label: BRAND.muted },
};

/** Highlighted summary box with a coloured edge: a headline plus optional bullet points (plain text, escaped here). */
export function renderCallout(options: { tone: CalloutTone; label: string; headline: string; points?: string[] }): string {
  const t = CALLOUT_TONES[options.tone];
  const points = options.points?.length
    ? `<ul style="margin: 10px 0 0; padding-left: 18px; font-family: ${FONT}; font-size: 14px; line-height: 1.6; color: ${BRAND.body};">${options.points.map((p) => `<li style="margin: 0 0 4px;">${escapeHtml(p)}</li>`).join('')}</ul>`
    : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0; background: ${t.bg}; border-radius: 10px; border-left: 4px solid ${t.bar};"><tbody><tr><td style="padding: 16px 20px;">
    <p style="margin: 0 0 6px; font-family: ${FONT}; font-size: 11px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: ${t.label};">${escapeHtml(options.label)}</p>
    <p style="margin: 0; font-family: ${FONT}; font-size: 16px; line-height: 1.4; font-weight: 700; color: ${BRAND.ink};">${escapeHtml(options.headline)}</p>${points}
  </td></tr></tbody></table>`;
}

/** A row of up to four headline facts (label over value) shown under the callout, so the key points are visible without scrolling. */
export function renderSummaryStrip(items: Array<{ label: string; value: string }>): string {
  const shown = items.slice(0, 4);
  const width = Math.floor(100 / shown.length);
  const cells = shown
    .map(
      (item, i) => `<td width="${width}%" valign="top" style="padding: 14px 16px; border-left: ${i === 0 ? 'none' : `1px solid ${BRAND.line}`};">
      <p style="margin: 0 0 4px; font-family: ${FONT}; font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: ${BRAND.muted};">${escapeHtml(item.label)}</p>
      <p style="margin: 0; font-family: ${FONT}; font-size: 14px; line-height: 1.4; font-weight: 700; color: ${BRAND.ink};">${escapeHtml(item.value)}</p>
    </td>`
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 14px 0 0; border: 1px solid ${BRAND.line}; border-radius: 10px;"><tbody><tr>${cells}</tr></tbody></table>`;
}

/** The sender's own words, set apart as a quotation (newlines kept). */
export function renderQuote(heading: string, text: string): string {
  return `<p style="margin: 28px 0 0; font-family: ${FONT}; font-size: 11px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: ${BRAND.goldText};">${escapeHtml(heading)}</p>
  <div style="margin: 10px 0 0; padding: 4px 0 4px 18px; border-left: 3px solid ${BRAND.gold}; font-family: ${FONT_DISPLAY}; font-size: 20px; line-height: 1.5; color: ${BRAND.ink}; white-space: pre-wrap;">${escapeHtml(text)}</div>`;
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
