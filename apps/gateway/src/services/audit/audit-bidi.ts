/**
 * Mixed Arabic and Latin text for the PDF writer.
 * pdfkit shapes Arabic letters correctly but writes a whole line right to left, which reverses any Latin words, numbers and emails inside it ("CRM" prints as "MRC").
 * This puts those left-to-right runs in the order that survives that reversal, and mirrors brackets, which is what a reader expects in right-to-left text.
 * It handles the text we print: Arabic sentences with names, figures, dates and emails inside. It is not a full Unicode bidirectional algorithm.
 */

/** A left-to-right run: letters or digits, joined by spaces and common punctuation, starting and ending on a letter or digit. */
const LTR_RUN = /[A-Za-z0-9]+(?:[ \-.,:/@+&%'_]+[A-Za-z0-9]+)*/g;
const MIRROR: Record<string, string> = { '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '«': '»', '»': '«' };

const reverse = (s: string): string => Array.from(s).reverse().join('');

export function forRtl(text: string): string {
  let out = '';
  let last = 0;
  const mirror = (chunk: string): string => Array.from(chunk).map((c) => MIRROR[c] ?? c).join('');
  for (const m of text.matchAll(LTR_RUN)) {
    out += mirror(text.slice(last, m.index));
    out += reverse(m[0]);
    last = (m.index ?? 0) + m[0].length;
  }
  return out + mirror(text.slice(last));
}

export const hasArabic = (s: string): boolean => /[؀-ۿ]/.test(s);

/**
 * The PDF writer decides a line's direction from its first letter that belongs to a script (digits and punctuation do not count). A line with Arabic that starts with a Latin
 * word comes out scrambled. Text we write ourselves therefore starts with an Arabic word, and the AI is told to do the same. This reports a line that breaks the rule.
 */
export const startsWithLatin = (s: string): boolean => hasArabic(s) && /^[^A-Za-z\u0600-\u06FF]*[A-Za-z]/.test(s);
