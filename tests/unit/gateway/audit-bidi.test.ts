import { describe, expect, it } from 'vitest';
import { forRtl, startsWithLatin } from '../../../apps/gateway/src/services/audit/audit-bidi.js';

describe('forRtl', () => {
  it('leaves pure Arabic alone', () => {
    expect(forRtl('الملخص')).toBe('الملخص');
  });

  it('turns a Latin word around so it reads correctly once the line is reversed', () => {
    expect(forRtl('نظام CRM جيد')).toBe('نظام MRC جيد');
  });

  it('does the same for figures, dates and emails', () => {
    expect(forRtl('x 2026-11-12 y')).toContain('21-11-6202');
    expect(forRtl('السعر AED 26,000 ثابت')).toContain('000,62 DEA');
    expect(forRtl('راسلنا hello@hallaai.com')).toContain('moc.iaallah@olleh');
  });

  it('keeps several Latin words together as one run', () => {
    expect(forRtl('بدعم من Clean Room LLC')).toContain('CLL mooR naelC');
  });

  it('mirrors brackets that sit in Arabic text', () => {
    expect(forRtl('(باسم)')).toBe(')باسم(');
  });

  it('handles empty text', () => {
    expect(forRtl('')).toBe('');
  });
});

describe('startsWithLatin', () => {
  it('flags an Arabic line that starts with a Latin word, ignoring leading digits and punctuation', () => {
    expect(startsWithLatin('Acme شركة')).toBe(true);
    expect(startsWithLatin('• Acme شركة')).toBe(true);
    expect(startsWithLatin('شركة Acme')).toBe(false);
    expect(startsWithLatin('3 أدوات')).toBe(false);
    expect(startsWithLatin('Plain English')).toBe(false);
  });
});
