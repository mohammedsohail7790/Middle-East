import type { BlogArticle } from "./types";
import { emergencyCallsArticle } from "./emergency-calls";
import { aiDisclosureArticle } from "./ai-disclosure";
import { crmIntegrationsArticle } from "./crm-integrations";
import { perMinutePricingArticle } from "./per-minute-pricing";
import { forwardingGuideArticle } from "./forwarding-guide";

export type { BlogArticle } from "./types";

export const BLOG_ARTICLES: BlogArticle[] = [
  emergencyCallsArticle,
  aiDisclosureArticle,
  crmIntegrationsArticle,
  perMinutePricingArticle,
  forwardingGuideArticle,
];

export function getBlogArticle(slug: string): BlogArticle | undefined {
  return BLOG_ARTICLES.find((a) => a.slug === slug);
}
