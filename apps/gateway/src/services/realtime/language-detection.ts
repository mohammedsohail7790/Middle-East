/**
 * Detects which of the seven marketed languages (en, ar, ur, fr, zh, ru, fa) a caller's utterance is in.
 * Pure and offline: it uses the writing system first, then letters and common words that tell apart languages sharing a script
 * (Arabic, Urdu and Persian; English and French). It returns null when the evidence is weak, so a short or ambiguous
 * utterance never flips the call to the wrong language. The caller can still be switched later by the switch_language tool.
 */

export type DetectedLanguage = 'en' | 'ar' | 'ur' | 'fr' | 'zh' | 'ru' | 'fa';

export interface LanguageDetection {
  language: DetectedLanguage;
  /** 0..1, how sure the heuristic is. */
  confidence: number;
}

const ARABIC_SCRIPT = /[؀-ۿݐ-ݿ]/g;
const CYRILLIC = /[Ѐ-ӿ]/g;
const HAN = /[一-鿿]/g;
const LATIN = /[A-Za-zÀ-ÿ]/g;

// Letters used in Urdu but not in Arabic or Persian, and letters used in Persian but not in Arabic.
const URDU_ONLY = /[ٹڈڑںھہےۃ]/g;
const PERSIAN_ONLY = /[پچژگ]/g; // pe, che, zhe, gaf (Urdu also uses these, so Urdu-only letters win first)

const URDU_WORDS = new Set(['میں', 'ہے', 'ہیں', 'کا', 'کی', 'کے', 'اور', 'آپ', 'مجھے', 'کیا', 'نہیں', 'ہوں', 'سے', 'کو', 'ہم', 'جی', 'بات', 'چاہیے', 'چاہتا', 'چاہتی', 'ہو', 'تھا']);
const PERSIAN_WORDS = new Set(['من', 'است', 'را', 'که', 'این', 'با', 'برای', 'می', 'میخواهم', 'می‌خواهم', 'سلام', 'شما', 'هستم', 'نیست', 'لطفا', 'لطفاً', 'داریم', 'دارم', 'یک', 'خیلی', 'وقت']);
const ARABIC_WORDS = new Set(['في', 'من', 'على', 'أنا', 'انا', 'هل', 'ما', 'مرحبا', 'أريد', 'اريد', 'عايز', 'بدي', 'ابغى', 'أبغى', 'ايش', 'شو', 'كيف', 'هذا', 'لو', 'سمحت', 'موعد', 'ممكن', 'مع']);

const EN_WORDS = new Set(['the', 'and', 'i', 'you', 'to', 'is', 'a', 'my', 'for', 'can', 'would', 'like', 'need', 'want', 'hello', 'hi', 'please', 'appointment', 'book', 'yes', 'no', 'do', 'have', 'with', 'this', 'that', 'what', 'how', 'are', 'it', 'me', 'of', 'in']);
const FR_WORDS = new Set(['le', 'la', 'les', 'un', 'une', 'des', 'et', 'je', 'vous', 'est', 'pour', 'de', 'du', 'bonjour', 'salut', 'merci', 'oui', 'non', 'je', 'voudrais', 'veux', 'besoin', 'rendez-vous', 'rendez', 'avec', 'mon', 'ma', 'mes', 'ce', 'ça', 'que', 'qui', 'pas', 'suis', 'avez', 'vous', 's\'il', 'prendre', 'comment', 'pouvez']);

function count(text: string, re: RegExp): number {
  return (text.match(re) || []).length;
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,.;:!?"()،؛؟。！？]+/)
    .map((w) => w.replace(/^['’]+|['’]+$/g, ''))
    .filter(Boolean);
}

function hits(ws: string[], set: Set<string>): number {
  let n = 0;
  for (const w of ws) if (set.has(w)) n += 1;
  return n;
}

/** The language of one caller utterance, or null when it is too short or too ambiguous to say. */
export function detectUtteranceLanguage(raw: string): LanguageDetection | null {
  const text = (raw || '').trim();
  if (text.length < 2) return null;

  const arabicScript = count(text, ARABIC_SCRIPT);
  const cyrillic = count(text, CYRILLIC);
  const han = count(text, HAN);
  const latin = count(text, LATIN);
  const letters = arabicScript + cyrillic + han + latin;
  if (letters === 0) return null;

  if (han / letters >= 0.5) return { language: 'zh', confidence: han >= 2 ? 0.95 : 0.7 };
  if (cyrillic / letters >= 0.5) return { language: 'ru', confidence: cyrillic >= 3 ? 0.95 : 0.7 };

  if (arabicScript / letters >= 0.5) {
    const ws = words(text);
    const urduLetters = count(text, URDU_ONLY);
    const urduScore = urduLetters * 2 + hits(ws, URDU_WORDS);
    const persianScore = hits(ws, PERSIAN_WORDS) + (text.includes('‌') ? 1 : 0) + (count(text, /[کی]/g) > 0 ? 0.5 : 0);
    const arabicScore = hits(ws, ARABIC_WORDS);
    const persianLetters = count(text, PERSIAN_ONLY);
    // Keheh/Farsi yeh are shared by Urdu and Persian; Arabic text uses ك and ي.
    if (urduScore >= 2 && urduScore > persianScore) return { language: 'ur', confidence: Math.min(0.95, 0.6 + urduScore * 0.1) };
    if (persianScore + persianLetters >= 2 && persianScore >= arabicScore) {
      return { language: 'fa', confidence: Math.min(0.9, 0.55 + persianScore * 0.1) };
    }
    if (urduScore >= 1 && urduScore > persianScore && urduScore > arabicScore) return { language: 'ur', confidence: 0.6 };
    return { language: 'ar', confidence: arabicScript >= 4 ? 0.85 : 0.6 };
  }

  if (latin / letters >= 0.5) {
    const ws = words(text);
    const fr = hits(ws, FR_WORDS) + count(text, /[àâçéèêëîïôûùüÿœ]/gi) * 0.5;
    const en = hits(ws, EN_WORDS);
    if (fr >= 1 && fr > en) return { language: 'fr', confidence: Math.min(0.95, 0.55 + fr * 0.15) };
    if (en >= 1 && en > fr) return { language: 'en', confidence: Math.min(0.95, 0.55 + en * 0.1) };
    return null;
  }

  return null;
}

/** The plan-level language code to use for a detection, keeping the tenant's Arabic dialect when the call is already Arabic. */
export function languageCodeForDetection(detected: DetectedLanguage, current: string): string {
  if (detected === 'ar') return /^ar[-_]/i.test(current) ? current : 'ar-SA';
  return detected;
}

/** True when switching to `detected` would change the call's language (Arabic dialects count as the same language). */
export function isLanguageChange(detected: DetectedLanguage, current: string): boolean {
  return (current || 'en').trim().toLowerCase().slice(0, 2) !== detected;
}

/** Minimum confidence to switch the live call on the first utterance. */
export const FIRST_UTTERANCE_MIN_CONFIDENCE = 0.7;

/**
 * What to do with the first caller utterance: the language code to switch the live call to, or null to leave it alone
 * (too uncertain, or the call is already in that language).
 */
export function planFirstUtteranceSwitch(text: string, currentLanguage: string): string | null {
  const d = detectUtteranceLanguage(text);
  if (!d || d.confidence < FIRST_UTTERANCE_MIN_CONFIDENCE) return null;
  if (!isLanguageChange(d.language, currentLanguage)) return null;
  return languageCodeForDetection(d.language, currentLanguage);
}
