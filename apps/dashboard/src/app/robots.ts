import type { MetadataRoute } from "next";
import { headers } from "next/headers";

const SITE = process.env.NEXT_PUBLIC_MARKETING_URL || "https://www.hallaai.com";

/** The marketing site is open to search engines, except the private audit links. The app host (app.hallaai.com) is closed to them entirely. */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get("host") ?? "";
  if (host.startsWith("app.")) return { rules: { userAgent: "*", disallow: "/" } };
  return { rules: { userAgent: "*", allow: "/", disallow: ["/audit", "/dashboard", "/api/", "/onboarding"] }, sitemap: `${SITE}/sitemap.xml` };
}
