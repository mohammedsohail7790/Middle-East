import { localizedPath, pagePath } from "@/lib/marketing-routes";
import { arabicPageText } from "@/lib/marketing-arabic";
import { extractPageHtml } from "@/lib/marketing-ssr";

/** Pages that must never be listed for search engines: private links, sign-in and the sign-up hand-off. */
const PRIVATE_PAGES = new Set(["audit", "audit-pay", "audit-paid", "signup", "login"]);

/** Every public marketing page in marketing-body.html that has a web address, as a path, in a stable order. */
export function sitemapPaths(bodyHtml: string): string[] {
  const ids = [...bodyHtml.matchAll(/<div id="page-([a-z0-9-]+)"/g)].map((m) => m[1]);
  const paths: string[] = [];
  for (const id of ids) {
    if (PRIVATE_PAGES.has(id)) continue;
    const path = pagePath(id);
    if (path && !paths.includes(path)) paths.push(path);
  }
  return paths;
}

export interface SitemapEntry {
  path: string;
  /** English and Arabic addresses of the same page, when Arabic pages are open to search. */
  languages?: { en: string; ar: string };
}

/** The sitemap list. With `arabic` on, every page that has Arabic text also gets its /ar address, and the two point at each other. English-only pages (some articles) get none. */
export function sitemapEntries(bodyHtml: string, arabic: boolean): SitemapEntry[] {
  const paths = sitemapPaths(bodyHtml);
  if (!arabic) return paths.map((path) => ({ path }));
  const hasArabic = new Set<string>();
  for (const m of bodyHtml.matchAll(/<div id="page-([a-z0-9-]+)"/g)) {
    const path = pagePath(m[1]);
    if (path && arabicPageText(extractPageHtml(bodyHtml, m[1])).title) hasArabic.add(path);
  }
  return paths.flatMap((path) => {
    if (!hasArabic.has(path)) return [{ path }];
    const languages = { en: localizedPath(path, "en"), ar: localizedPath(path, "ar") };
    return [{ path, languages }, { path: languages.ar, languages }];
  });
}
