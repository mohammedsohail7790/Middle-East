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
  "/privacy": "privacy",
  "/terms": "terms",
  "/forwarding": "forwarding",
  "/ai-vs-human": "ai-vs-human",
  "/vs-smith": "vs-smith",
  "/vs-ruby": "vs-ruby",
  "/security": "security",
  "/industries": "industries-all",
  "/services/operations": "svc-operations",
  "/services/acquisition": "svc-acquisition",
  "/services/brand": "svc-brand",
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

export function resolveMarketingPage(pathname: string): string {
  const path = pathname.replace(/\/$/, "") || "/";
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
