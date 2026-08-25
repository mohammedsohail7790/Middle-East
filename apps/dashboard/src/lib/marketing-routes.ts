/** Map public marketing URL paths to SPA page ids (page-{id} in marketing-body.html). */
export const MARKETING_PATH_TO_PAGE: Record<string, string> = {
  "/": "home",
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
};

export function resolveMarketingPage(pathname: string): string {
  const path = pathname.replace(/\/$/, "") || "/";
  if (MARKETING_PATH_TO_PAGE[path]) return MARKETING_PATH_TO_PAGE[path];

  const industryMatch = path.match(/^\/industries\/([a-z0-9-]+)$/i);
  if (industryMatch) return `industry-${industryMatch[1]}`;

  const solutionsMatch = path.match(/^\/solutions\/([a-z0-9-]+)$/i);
  if (solutionsMatch) return `solutions-${solutionsMatch[1]}`;

  return "home";
}
