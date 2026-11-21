import { localizedPath, type MarketingLang } from "@/lib/marketing-routes";

/**
 * Arabic pages have their own addresses (/ar/...). Until the Arabic wording has been reviewed they are kept out of search:
 * the pages answer with "noindex" and are left out of the sitemap. Set ARABIC_PAGES_INDEXABLE=1 to open them to search engines
 * (this also adds the English/Arabic "hreflang" links and the Arabic sitemap entries).
 */
export function arabicPagesIndexable(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ARABIC_PAGES_INDEXABLE === "1";
}

const stripTags = (html: string): string =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

/** The Arabic text inside the first element of a page's HTML matching `open` (for example its <h1>), or null when the page has none. */
function firstArabic(pageHtml: string, open: RegExp, close: string): string | null {
  const m = open.exec(pageHtml);
  if (!m) return null;
  const end = pageHtml.indexOf(close, m.index);
  const block = pageHtml.slice(m.index, end === -1 ? undefined : end);
  const span = /<span class="lang-ar[^"]*"[^>]*>([\s\S]*?)<\/span>/.exec(block);
  const text = span ? stripTags(span[1]) : "";
  return text || null;
}

/** An Arabic title and description for a page, taken from its own Arabic headline and first lead paragraph. Either may be null. */
export function arabicPageText(pageHtml: string): { title: string | null; description: string | null } {
  const title = firstArabic(pageHtml, /<h1[\s>]/, "</h1>");
  const description = firstArabic(pageHtml, /<p class="cx-lead"/, "</p>");
  return { title, description: description ? description.slice(0, 200) : null };
}

/** The "this page in other languages" links for search engines. Only when Arabic pages are open to search. */
export function languageAlternates(path: string): { en: string; ar: string; "x-default": string } {
  return { en: localizedPath(path, "en"), ar: localizedPath(path, "ar"), "x-default": localizedPath(path, "en") };
}

export type { MarketingLang };
