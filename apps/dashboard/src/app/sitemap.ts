import type { MetadataRoute } from "next";
import { readFileSync } from "fs";
import { join } from "path";
import { sitemapEntries } from "@/lib/marketing-sitemap";
import { arabicPagesIndexable } from "@/lib/marketing-arabic";

const SITE = process.env.NEXT_PUBLIC_MARKETING_URL || "https://www.hallaai.com";

/** The list of public marketing pages for search engines, built from the pages that actually exist in marketing-body.html. */
export default function sitemap(): MetadataRoute.Sitemap {
  let body = "";
  try {
    body = readFileSync(join(process.cwd(), "public", "marketing-body.html"), "utf8");
  } catch {
    /* an empty list is better than a broken file */
  }
  const lastModified = new Date();
  const url = (path: string) => `${SITE}${path === "/" ? "" : path}`;
  return sitemapEntries(body, arabicPagesIndexable()).map(({ path, languages }) => ({
    url: url(path),
    lastModified,
    changeFrequency: "monthly",
    priority: path === "/" ? 1 : 0.7,
    ...(languages ? { alternates: { languages: { en: url(languages.en), ar: url(languages.ar) } } } : {}),
  }));
}
