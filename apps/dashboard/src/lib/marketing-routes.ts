/** Map public marketing URL paths to SPA page ids (page-{id} in marketing-body.html). */
export const MARKETING_PATH_TO_PAGE: Record<string, string> = {
  "/": "consultancy",
  "/home": "home",
  "/consultancy": "consultancy",
  "/ai-consultancy": "ai-consultancy",
  "/automation": "intelligence",
  "/solutions": "solutions",
  "/blog/emergency-calls": "blog-emergency",
  "/blog/ai-disclosure": "blog-ai-disclosure",
  "/blog/crm-integrations": "blog-crm-integrations",
  "/blog/per-minute-pricing": "blog-per-minute",
  "/consult-signup": "consult-signup",
  "/fit-check": "fit-check",
  "/opportunity-audit": "audit-info",
  "/audit": "audit",
  "/audit/pay": "audit-pay",
  "/audit/paid": "audit-paid",
  "/pricing": "pricing",
  "/features": "features",
  "/how-it-works": "how-it-works",
  "/integrations": "integrations",
  "/compliance": "compliance",
  "/roi": "roi",
  "/blog": "blog",
  "/faq": "faq",
  "/about": "about",
  "/contact": "contact",
  "/privacy": "privacy",
  "/terms": "terms",
  "/forwarding": "forwarding",
  "/ai-vs-human": "ai-vs-human",
  "/vs-smith": "vs-smith",
  "/vs-ruby": "vs-ruby",
  "/security": "security",
  "/industries": "industries-all",
  "/services/operations": "svc-operations",
  // Retired services: old links and search results land on the operations page.
  "/services/acquisition": "svc-operations",
  "/services/brand": "svc-operations",
};

/** True for public marketing SPA paths (no /en prefix). */
export function isMarketingHref(href: string): boolean {
  const path = href.split(/[?#]/)[0] || "/";
  if (MARKETING_PATH_TO_PAGE[path]) return true;
  if (/^\/industries\//.test(path)) return true;
  if (/^\/solutions\//.test(path)) return true;
  if (/^\/services\//.test(path)) return true;
  return false;
}

export type MarketingLang = "en" | "ar";

/**
 * Splits a leading /en or /ar language segment off a marketing address. "/ar/solutions" is Arabic, "/solutions" and "/en/solutions" are English.
 * `explicit` says whether the address named a language, so a plain address can still follow the visitor's saved choice.
 */
export function splitLocale(pathname: string): { lang: MarketingLang; path: string; explicit: boolean } {
  const clean = pathname.replace(/\/+$/, "") || "/";
  const m = clean.match(/^\/(en|ar)(\/.*)?$/);
  if (!m) return { lang: "en", path: clean, explicit: false };
  return { lang: m[1] as MarketingLang, path: m[2] || "/", explicit: true };
}

/** The address of a page in a language: English is the plain address, Arabic puts /ar in front ("/" becomes "/ar"). */
export function localizedPath(path: string, lang: MarketingLang): string {
  const clean = path.replace(/\/+$/, "") || "/";
  if (lang !== "ar") return clean;
  return clean === "/" ? "/ar" : `/ar${clean}`;
}

export function resolveMarketingPage(pathname: string): string {
  const path = splitLocale(pathname).path;
  if (MARKETING_PATH_TO_PAGE[path]) return MARKETING_PATH_TO_PAGE[path];

  const industryMatch = path.match(/^\/industries\/([a-z0-9-]+)$/i);
  if (industryMatch) return `industry-${industryMatch[1]}`;

  const solutionsMatch = path.match(/^\/solutions\/([a-z0-9-]+)$/i);
  if (solutionsMatch) return `solutions-${solutionsMatch[1]}`;

  return "consultancy";
}

/** The web address for a page id: the reverse of resolveMarketingPage. "/" is used for the home (consultancy) page. */
export function pagePath(pageId: string): string | null {
  if (pageId === "consultancy") return "/";
  for (const [path, id] of Object.entries(MARKETING_PATH_TO_PAGE)) {
    if (id === pageId) return path;
  }
  if (pageId.startsWith("industry-")) return `/industries/${pageId.slice("industry-".length)}`;
  if (pageId.startsWith("solutions-")) return `/solutions/${pageId.slice("solutions-".length)}`;
  return null;
}

/**
 * True when the path is a real marketing page, so an unknown address can answer 404 instead of showing the home page.
 * A leading /en or /ar language segment is allowed. `pageIds` are the ids of the pages that exist in marketing-body.html.
 */
export function isKnownMarketingPath(pathname: string, pageIds: ReadonlySet<string>): boolean {
  const path = splitLocale(pathname).path;
  if (path === "/") return true;
  if (MARKETING_PATH_TO_PAGE[path]) return true;
  const dynamic = path.match(/^\/(industries|solutions)\/([a-z0-9-]+)$/i);
  if (dynamic) return pageIds.has(`${dynamic[1] === "industries" ? "industry" : "solutions"}-${dynamic[2]}`);
  return false;
}

/** App pages that exist without a language segment. A language-aware link such as /en/onboarding must land on the plain address. */
const APP_PAGES = ["login", "signup", "onboarding", "forgot-password"];

/** For "/en/onboarding" and similar, the plain address ("/onboarding"); null for anything else. */
export function plainAppPath(pathname: string): string | null {
  const m = pathname.replace(/\/+$/, "").match(/^\/(?:en|ar)\/([a-z-]+)$/);
  return m && APP_PAGES.includes(m[1]) ? `/${m[1]}` : null;
}
