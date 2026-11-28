/**
 * The Business Profile "services" box: one service per line, with an optional price at the end of the line.
 *
 *   Consultation - AED 89      Consultation - 89 AED      Consultation $89      استشارة - 89 درهم      Consultation - 89
 *
 * The price is kept WITH its currency ("AED 89") because the AI reads it as plain text on calls. If only the number
 * were kept, a Dubai clinic could be quoted "89 dollars".
 */

export type ServiceRow = { name: string; price: string };

/** Arabic-Indic (٠-٩) and Persian (۰-۹) digits. */
const DIGITS = "0-9٠-٩۰-۹";
const NUM = `[${DIGITS}]+(?:[,٬][${DIGITS}]{3})*(?:[.٫][${DIGITS}]{1,2})?`;

/** Currency codes, symbols and Arabic words. Each maps to how it is stored ("" = keep exactly as typed). */
const CURRENCIES: Record<string, string> = {
  AED: "AED",
  SAR: "SAR",
  QAR: "QAR",
  OMR: "OMR",
  KWD: "KWD",
  BHD: "BHD",
  USD: "USD",
  EUR: "EUR",
  GBP: "GBP",
  "$": "$",
  "€": "€",
  "£": "£",
  "درهم": "AED",
  "د.إ": "AED",
  "ر.س": "SAR",
  "ر.ق": "QAR",
  "ر.ع": "OMR",
  "د.ك": "KWD",
  "د.ب": "BHD",
  "ريال": "",
  "دينار": "",
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Longest first so "د.إ" is never cut short by a shorter match.
const CUR = Object.keys(CURRENCIES)
  .sort((a, b) => b.length - a.length)
  .map(escapeRe)
  .join("|");

const SEP = "(?:\\s*[-–—,:]\\s*|\\s+)"; // a dash, comma or colon, or just a space
const DASH_SEP = "\\s*[-–—,]\\s*"; // a bare number needs an explicit dash or comma

const CURRENCY_FIRST = new RegExp(`^(.*?\\S)${SEP}(${CUR})\\s*(${NUM})\\s*$`, "i");
const CURRENCY_LAST = new RegExp(`^(.*?\\S)${SEP}(${NUM})\\s*(${CUR})\\s*$`, "i");
const BARE_NUMBER = new RegExp(`^(.*?\\S)${DASH_SEP}(${NUM})\\s*$`);

function normaliseNumber(raw: string): string {
  return raw
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[,٬]/g, "")
    .replace(/٫/g, ".");
}

function lookupCurrency(token: string): string | undefined {
  const exact = CURRENCIES[token];
  if (exact !== undefined) return exact || token;
  const upper = token.toUpperCase();
  const byCode = CURRENCIES[upper];
  return byCode !== undefined ? byCode || token : undefined;
}

function formatPrice(currencyToken: string, number: string): string {
  const currency = lookupCurrency(currencyToken) ?? currencyToken;
  return /^[A-Z]{3}$/.test(currency) || /[؀-ۿ]/.test(currency) ? `${currency} ${number}` : `${currency}${number}`;
}

export function parseServiceText(text: string): ServiceRow[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line): ServiceRow => {
      const first = line.match(CURRENCY_FIRST);
      if (first) return { name: first[1].trim(), price: formatPrice(first[2], normaliseNumber(first[3])) };
      const last = line.match(CURRENCY_LAST);
      if (last) return { name: last[1].trim(), price: formatPrice(last[3], normaliseNumber(last[2])) };
      const bare = line.match(BARE_NUMBER);
      if (bare) return { name: bare[1].trim(), price: normaliseNumber(bare[2]) };
      return { name: line, price: "" };
    });
}

/** One service per line. A saved price is shown back exactly as saved (never turned into dollars). */
export function rowsToText(rows: ServiceRow[]): string {
  return rows
    .filter((r) => r.name.trim())
    .map((r) => (r.price.trim() ? `${r.name} - ${r.price.trim()}` : r.name))
    .join("\n");
}
