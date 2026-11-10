/**
 * Transcript PII redaction, applied before call transcripts are persisted.
 *
 * Covers US identifiers (SSN, phone) plus the GCC identifiers our UAE and KSA
 * customers read out on calls: Emirates ID, Saudi National ID / Iqama and payment
 * cards. Matching is deliberately format-based and conservative (over-redact rather
 * than leak); we do not rely on check digits for the IDs because no official
 * algorithm is published. Cards are redacted when they are exactly 16 digits or
 * pass the Luhn check (13-19 digits).
 *
 * Digits are matched in Latin, Arabic-Indic and Eastern Arabic-Indic forms, since
 * Arabic speech-to-text output commonly uses the latter two.
 */

const D = '[0-9\\u0660-\\u0669\\u06F0-\\u06F9]';
const SEP = '[\\s.\\-]?';

const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const SSN = new RegExp(`(?<!${D})${D}{3}-${D}{2}-${D}{4}(?!${D})`, 'g');
// 15 digits, starts 784, grouped 784-YYYY-NNNNNNN-C (separators optional).
const EMIRATES_ID = new RegExp(
  `(?<!${D})[7\\u0667\\u06F7]${SEP}[8\\u0668\\u06F8]${SEP}[4\\u0664\\u06F4]${SEP}${D}{4}${SEP}${D}{7}${SEP}${D}(?!${D})`,
  'g'
);
// 13-19 digits with optional spaces or dashes; validated in code.
const CARD_CANDIDATE = new RegExp(`(?<!${D})(?:${D}[ \\-]?){12,18}${D}(?!${D})`, 'g');
// 10 digits starting 1 (Saudi citizen) or 2 (resident / Iqama), single separators allowed.
const SAUDI_ID = new RegExp(`(?<!${D})[12\\u0661\\u0662\\u06F1\\u06F2](?:${SEP}${D}){9}(?!${D})`, 'g');
const PHONE = /\b\d{3}[-.·]?\d{3}[-.·]?\d{4}\b/g;

function toAsciiDigits(s: string): string {
  return s.replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0))
    .replace(/\D/g, '');
}

function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return sum % 10 === 0;
}

export interface RedactionLabels {
  email: string;
  ssn: string;
  emiratesId: string;
  saudiId: string;
  card: string;
  phone: string;
}

export const TRANSCRIPT_LABELS: RedactionLabels = {
  email: '[EMAIL]',
  ssn: '[SSN]',
  emiratesId: '[EMIRATES_ID]',
  saudiId: '[SAUDI_ID]',
  card: '[CARD]',
  phone: '[PHONE]',
};

const GENERIC_LABELS: RedactionLabels = {
  email: '[REDACTED]',
  ssn: '[REDACTED]',
  emiratesId: '[REDACTED]',
  saudiId: '[REDACTED]',
  card: '[REDACTED]',
  phone: '[REDACTED]',
};

export function redactSensitiveText(text: string, labels: RedactionLabels = TRANSCRIPT_LABELS): string {
  if (!text) return text;
  let out = text;
  out = out.replace(EMAIL, labels.email);
  out = out.replace(SSN, labels.ssn);
  // Emirates ID first: 15 digits would otherwise be picked up by the card rule.
  out = out.replace(EMIRATES_ID, labels.emiratesId);
  out = out.replace(CARD_CANDIDATE, (m) => {
    const digits = toAsciiDigits(m);
    return digits.length === 16 || luhnValid(digits) ? labels.card : m;
  });
  out = out.replace(SAUDI_ID, labels.saudiId);
  out = out.replace(PHONE, labels.phone);
  return out;
}

/** Redact a transcript or summary before it is stored. */
export function redactTranscriptPii(text: string): string {
  return redactSensitiveText(text, TRANSCRIPT_LABELS);
}

/** Same coverage with a single generic label (used by the compliance redaction API). */
export function redactPiiGeneric(text: string): string {
  return redactSensitiveText(text, GENERIC_LABELS);
}
