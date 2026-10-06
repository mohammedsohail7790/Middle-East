/**
 * Redaction of live tool arguments and tool results before they reach logs, the Redis audit list, the in-memory
 * audit buffer, platform events or error text.
 *
 * Why: tool arguments are what a caller said (names, phone numbers, emails, addresses, free-text notes, and — for
 * a medical or retail business — health or payment details). None of that belongs in an operational log or an audit
 * list. Auditability is kept by recording the SHAPE of the call (which tool, which fields were supplied, their
 * types, how many were redacted) and the outcome, never the values.
 *
 * Rules, in order, for every value:
 *   1. Deny by default: a string is replaced by a marker unless it is on the tiny allow-list below.
 *   2. Marker by field NAME or by CONTENT (so a phone number in a "notes" field is still caught).
 *   3. The markers are constant strings: nothing is hashed, truncated, masked or partially kept, so the original
 *      value cannot be recovered or correlated from the record.
 *   4. Never throws; any failure yields a fully redacted placeholder.
 *
 * Allowed through unchanged: booleans, null/undefined, and a short allow-list of enumerated escalation reason codes.
 */

export type RedactedValue = string | boolean | null | RedactedValue[] | { [key: string]: RedactedValue };

export const REDACTED = {
  text: '[REDACTED_TEXT]',
  name: '[REDACTED_NAME]',
  phone: '[REDACTED_PHONE]',
  email: '[REDACTED_EMAIL]',
  address: '[REDACTED_ADDRESS]',
  secret: '[REDACTED_SECRET]',
  payment: '[REDACTED_PAYMENT]',
  number: '[REDACTED_NUMBER]',
  datetime: '[REDACTED_DATETIME]',
  id: '[REDACTED_ID]',
} as const;

/** Escalation / end-of-call reason codes the platform itself defines. Anything else in `reason` is free text. */
const SAFE_REASON_CODES = new Set([
  'emergency', 'human_requested', 'caller_request', 'customer_request', 'complaint', 'escalation', 'callback',
  'completed', 'resolved', 'voicemail', 'wrong_number', 'no_answer', 'other',
  'diagnosis_request', 'prescription_request', 'outcome_guarantee_request', 'unknown_provider_information',
  'unknown_medical_or_business_information', 'unknown_business_information', 'unknown_supplier_information',
  'sensitive_high_risk_case', 'unclear_patient_requirements', 'payment_dispute', 'refund_dispute', 'chargeback',
  'fraud_indicator', 'legal_threat', 'complaint_requiring_human', 'delivery_guarantee_request', 'missing_tracking',
  'failed_fulfillment',
]);

const KEY_RULES: Array<[RegExp, string]> = [
  [/pass(word)?|secret|token|api[_-]?key|authorization|bearer|credential|cvv|cvc|pin\b|otp|signing|private[_-]?key/i, REDACTED.secret],
  [/card|iban|account[_-]?(no|num)|routing|swift|bank|payment|billing|pan\b|expiry|exp[_-]?(date|month|year)/i, REDACTED.payment],
  [/e[-_]?mail/i, REDACTED.email],
  [/phone|mobile|msisdn|^tel|telephone|whatsapp|^to$|^from$|callback_?number|^number$/i, REDACTED.phone],
  [/address|street|city|postcode|postal|zip|location|^area$|^lat|^lng|^lon/i, REDACTED.address],
  [/(^|_)(first|last|full|customer|caller|patient|contact)?_?name$|^name$|surname|given_?name/i, REDACTED.name],
  [/(time|date|when|slot|datetime|scheduled)/i, REDACTED.datetime],
  [/(^|_)id$|appointment_?id|customer_?id|lead_?id|order_?id|tracking/i, REDACTED.id],
];

const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
const PHONE_RE = /(?:\+|00)?\d[\d\s().-]{6,}\d/;
const SECRET_VALUE_RE = /\b(?:sk|pk|rk|whsec|calliq)_[A-Za-z0-9_]{6,}|\bBearer\s+[A-Za-z0-9._-]{8,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|-----BEGIN [A-Z ]+-----/;
const CARD_LIKE_RE = /\b(?:\d[ -]?){13,19}\b/;

const MAX_DEPTH = 4;
const MAX_ITEMS = 12;

function markerForKey(key: string): string | null {
  for (const [re, marker] of KEY_RULES) if (re.test(key)) return marker;
  return null;
}

function redactString(key: string, value: string): string {
  if (value === '') return value; // an empty string carries no information and shows the field was blank
  if (SECRET_VALUE_RE.test(value)) return REDACTED.secret;
  const byKey = markerForKey(key);
  if (byKey) return byKey;
  if (/^reason$/i.test(key) && SAFE_REASON_CODES.has(value.trim().toLowerCase())) return value.trim().toLowerCase();
  if (EMAIL_RE.test(value)) return REDACTED.email;
  if (CARD_LIKE_RE.test(value)) return REDACTED.payment;
  if (PHONE_RE.test(value)) return REDACTED.phone;
  return REDACTED.text;
}

function redactValue(key: string, value: unknown, depth: number): RedactedValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' || typeof value === 'bigint') return markerForKey(key) ?? REDACTED.number;
  if (typeof value === 'string') return redactString(key, value);
  if (depth >= MAX_DEPTH) return REDACTED.text;
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ITEMS).map((v) => redactValue(key, v, depth + 1));
    if (value.length > MAX_ITEMS) items.push(`[+${value.length - MAX_ITEMS} more redacted]`);
    return items;
  }
  if (typeof value === 'object') {
    const out: { [k: string]: RedactedValue } = {};
    const entries = Object.entries(value as Record<string, unknown>);
    for (const [k, v] of entries.slice(0, MAX_ITEMS * 2)) out[k] = redactValue(k, v, depth + 1);
    return out;
  }
  return REDACTED.text;
}

/**
 * The redacted STRUCTURE of a tool call's arguments: same keys, same nesting, constant markers instead of values.
 * `toolName` is accepted so a tool-specific rule can be added without changing callers.
 */
export function redactToolArguments(_toolName: string, args: unknown): Record<string, RedactedValue> {
  try {
    if (args === null || args === undefined || typeof args !== 'object' || Array.isArray(args)) {
      return { _value: redactValue('_value', args, 0) };
    }
    const out: Record<string, RedactedValue> = {};
    for (const [k, v] of Object.entries(args as Record<string, unknown>).slice(0, MAX_ITEMS * 2)) out[k] = redactValue(k, v, 0);
    return out;
  } catch {
    return { _redacted: true };
  }
}

/** Operational metadata derived from the arguments without carrying any value. */
export function summarizeToolArguments(args: unknown): {
  fieldCount: number;
  fields: string[];
  redactedFieldCount: number;
} {
  try {
    const redacted = redactToolArguments('', args);
    const fields = Object.keys(redacted);
    const redactedFieldCount = fields.filter((k) => JSON.stringify(redacted[k]).includes('[REDACTED')).length;
    return { fieldCount: fields.length, fields: fields.slice(0, 30), redactedFieldCount };
  } catch {
    return { fieldCount: 0, fields: [], redactedFieldCount: 0 };
  }
}

/**
 * Free text that may echo caller data (a tool's human-readable result, a database or network error message).
 * Contact details, secrets and quoted/parenthesised values are removed and the rest is capped. Names cannot be
 * recognised in prose, so callers that cannot guarantee a data-free message should log `redactedMessage()` instead.
 */
export function scrubFreeText(text: unknown, maxChars = 160): string {
  try {
    let s = String(text ?? '');
    s = s.replace(new RegExp(SECRET_VALUE_RE, 'g'), REDACTED.secret);
    s = s.replace(new RegExp(EMAIL_RE, 'g'), REDACTED.email);
    s = s.replace(new RegExp(CARD_LIKE_RE, 'g'), REDACTED.payment);
    s = s.replace(new RegExp(PHONE_RE, 'g'), REDACTED.phone);
    s = s.replace(/\(([^()]{1,200})\)=\(([^()]{0,200})\)/g, '($1)=([REDACTED_TEXT])'); // Postgres "Key (col)=(value)"
    s = s.replace(/"[^"]{2,200}"|'[^']{2,200}'/g, REDACTED.text); // quoted values in driver/validation errors
    return s.length > maxChars ? `${s.slice(0, maxChars)}…` : s;
  } catch {
    return REDACTED.text;
  }
}

/**
 * A short, data-free description of an error for logs: its class and code, plus a scrubbed message.
 * Postgres `detail`/`where` (which contain row values) are never included.
 */
export function safeErrorForLog(err: unknown): { errorName: string; errorCode?: string; errorMessage: string } {
  try {
    const e = err as { name?: string; code?: unknown; message?: unknown };
    return {
      errorName: typeof e?.name === 'string' ? e.name : 'Error',
      errorCode: e?.code !== undefined && e?.code !== null ? String(e.code).slice(0, 40) : undefined,
      errorMessage: scrubFreeText(e?.message ?? err),
    };
  } catch {
    return { errorName: 'Error', errorMessage: REDACTED.text };
  }
}

/**
 * Result/denial wording the platform itself produces. Anything NOT matching one of these is treated as free text:
 * a regex cannot recognise a person's name inside a sentence, so unknown wording is never kept.
 */
const FIXED_PHRASES: RegExp[] = [
  /^Information saved\.$/, /^SMS sent\.$/, /^Transferring the call to a team member\.$/, /^Ending the call shortly/,
  /^Found \d+ (relevant results|existing customer record\(s\))\.$/, /^Continue the conversation in [a-z]{2,3}\b/,
  /^Tool already executed for this call/, /^Max tool executions per call exceeded$/, /^Tool rate limit exceeded$/,
  /^Tool recursion depth exceeded$/, /^Duplicate tool invocation detected$/, /^Tool [a-z_]+ disabled by policy$/,
  /^(Lead creation|Appointment booking|SMS) disabled for tenant$/, /^AI tools emergency-disabled platform-wide$/,
  /^This action requires elevated approval in strict safety mode$/, /^Tool denied by policy$/,
  /^Invalid (appointment time|phone number|transfer destination|tool name)$/, /^Appointment time is in the past$/,
  /^Outside business hours$/, /^Unknown tool: [a-z_]+$/,
];
/** "<generic failure>: <detail>" — only the generic part before the colon is kept; the detail may echo caller data. */
const FAILURE_PREFIXES = /^(Failed to create appointment|Reschedule failed|Cancellation failed|Transfer failed|Failed to save lead|Knowledge search failed|SMS failed|Customer update failed|Customer lookup failed|Tool execution failed|Language "[a-z-]{2,10}" is not included on your plan)/;

/**
 * A tool's result/denial text reduced to something safe to persist or log: a known fixed phrase, the generic part of
 * a failure message, or a marker. Never free text.
 */
export function safeResultSummary(text: unknown): string | undefined {
  if (text === undefined || text === null || text === '') return undefined;
  const t = String(text).trim();
  if (FIXED_PHRASES.some((re) => re.test(t))) return t;
  const failure = t.match(FAILURE_PREFIXES);
  if (failure) return failure[1];
  return REDACTED.text;
}
