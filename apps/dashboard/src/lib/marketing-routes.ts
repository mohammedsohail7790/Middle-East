/** Canonical marketing URLs — keep in sync with public/calliq_main.js */
export const MARKETING_ROUTES: Record<string, string> = {
  home: "/",
  features: "/features",
  pricing: "/pricing",
  "how-it-works": "/how-it-works",
  roi: "/roi",
  blog: "/blog",
  forwarding: "/forwarding",
  "ai-vs-human": "/ai-vs-human",
  "vs-smith": "/vs-smith",
  "vs-ruby": "/vs-ruby",
  alternatives: "/alternatives",
  faq: "/faq",
  about: "/about",
  security: "/security",
  compliance: "/security",
  privacy: "/privacy",
  terms: "/terms",
  "ai-disclosure": "/privacy",
  contact: "/signup",
  signup: "/signup",
  login: "/login",
  dashboard: "/dashboard",
  industries: "/industries",
  "industries-all": "/industries",
  solutions: "/solutions/answering",
  "blog-emergency": "/blog/emergency-calls",
  "blog-ai-disclosure": "/blog/ai-disclosure",
  "blog-crm-integrations": "/blog/crm-integrations",
  "blog-per-minute": "/blog/per-minute-pricing",
  "blog-forwarding-guide": "/blog/forwarding-guide",
};

export function marketingPathForPage(page: string): string | null {
  if (MARKETING_ROUTES[page]) return MARKETING_ROUTES[page];
  if (page.startsWith("solutions-")) {
    const slug = page.slice("solutions-".length);
    return `/solutions/${slug}`;
  }
  if (page.startsWith("industry-")) {
    const slug = page.slice("industry-".length);
    if (slug === "home-services") return "/industries/cleaning";
    return `/industries/${slug}`;
  }
  return null;
}

export function industryPath(slug: string): string {
  if (!slug || slug === "all") return "/industries";
  if (slug === "realestate") return "/industries/realestate";
  if (slug === "home-services") return "/industries/cleaning";
  return `/industries/${slug}`;
}

export function solutionPath(slug: string): string {
  return `/solutions/${slug}`;
}
