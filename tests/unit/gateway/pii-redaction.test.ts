import { describe, it, expect } from 'vitest';
import {
  redactTranscriptPii,
  redactPiiGeneric,
} from '../../../apps/gateway/src/services/compliance/pii-redaction.js';

describe('transcript PII redaction', () => {
  it('redacts Emirates ID in grouped, spaced and plain forms', () => {
    expect(redactTranscriptPii('My ID is 784-1990-1234567-1.')).toBe('My ID is [EMIRATES_ID].');
    expect(redactTranscriptPii('ID 784 1990 1234567 1 thanks')).toBe('ID [EMIRATES_ID] thanks');
    expect(redactTranscriptPii('784199012345671')).toBe('[EMIRATES_ID]');
  });

  it('redacts Saudi National ID and Iqama numbers', () => {
    expect(redactTranscriptPii('هويتي 1012345672 شكرا')).toBe('هويتي [SAUDI_ID] شكرا');
    expect(redactTranscriptPii('Iqama 2100000005.')).toBe('Iqama [SAUDI_ID].');
    expect(redactTranscriptPii('ID 1 0 1 2 3 4 5 6 7 2 ok')).toBe('ID [SAUDI_ID] ok');
  });

  it('redacts Arabic-Indic and Eastern Arabic-Indic digits', () => {
    expect(redactTranscriptPii('٧٨٤-١٩٩٠-١٢٣٤٥٦٧-١')).toBe('[EMIRATES_ID]');
    expect(redactTranscriptPii('١٠١٢٣٤٥٦٧٢')).toBe('[SAUDI_ID]');
    expect(redactTranscriptPii('۱۰۱۲۳۴۵۶۷۲')).toBe('[SAUDI_ID]');
  });

  it('redacts payment cards: any 16 digits, or 13-19 digits that pass Luhn', () => {
    expect(redactTranscriptPii('card 4111 1111 1111 1111 expires')).toBe('card [CARD] expires');
    expect(redactTranscriptPii('card 4111-1111-1111-1111')).toBe('card [CARD]');
    expect(redactTranscriptPii('amex 378282246310005')).toBe('amex [CARD]');
    expect(redactTranscriptPii('card 1234567890123456')).toBe('card [CARD]');
  });

  it('does not treat a non-Luhn 15-digit number as a card', () => {
    expect(redactTranscriptPii('ref 123456789012345 end')).toBe('ref 123456789012345 end');
  });

  it('keeps the existing SSN, phone and email rules', () => {
    expect(redactTranscriptPii('SSN 123-45-6789')).toBe('SSN [SSN]');
    expect(redactTranscriptPii('call 415-555-0134')).toBe('call [PHONE]');
    expect(redactTranscriptPii('mail a.b@example.com')).toBe('mail [EMAIL]');
  });

  it('leaves ordinary text, short numbers and dates alone', () => {
    const text = 'Appointment on 24 October at 3 pm, room 12, 3 people.';
    expect(redactTranscriptPii(text)).toBe(text);
    expect(redactTranscriptPii('')).toBe('');
  });

  it('generic redaction uses a single label and is stable on repeat', () => {
    const input = 'ID 784-1990-1234567-1 and 1012345672 and a@b.co';
    const out = redactPiiGeneric(input);
    expect(out).toBe('ID [REDACTED] and [REDACTED] and [REDACTED]');
    expect(redactPiiGeneric(out)).toBe(out);
  });
});
