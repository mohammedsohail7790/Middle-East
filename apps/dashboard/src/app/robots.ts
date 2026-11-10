import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_MARKETING_URL || "https://www.hallaai.com";

/** The marketing site is open to search engines, except the private audit links. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/", disallow: ["/audit", "/dashboard", "/api/", "/onboarding"] }, sitemap: `${SITE}/sitemap.xml` };
}
