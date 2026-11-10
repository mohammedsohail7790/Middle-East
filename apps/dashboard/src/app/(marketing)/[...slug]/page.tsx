import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { readFileSync } from "fs";
import { join } from "path";
import MarketingSPA from "@/components/marketing/MarketingSPA";
import { isKnownMarketingPath, plainAppPath, resolveMarketingPage } from "@/lib/marketing-routes";
import { marketingMetadata } from "@/lib/marketing-metadata";
import { extractPageHtml } from "@/lib/marketing-ssr";

export async function generateMetadata({ params }: { params: Promise<{ slug?: string[] }> }): Promise<Metadata> {
  const { slug } = await params;
  const path = slug?.length ? `/${slug.join("/")}` : "/";
  return marketingMetadata(resolveMarketingPage(path), path);
}

function getMarketingBodyHtml(): string {
  try {
    const filePath = join(process.cwd(), "public", "marketing-body.html");
    const html = readFileSync(filePath, "utf8");
    const bodyStart = html.indexOf("<body");
    const bodyContentStart = html.indexOf(">", bodyStart) + 1;
    const bodyEnd = html.lastIndexOf("</body>");
    if (bodyStart === -1 || bodyEnd === -1) return "<p>Marketing site loading…</p>";
    return html.slice(bodyContentStart, bodyEnd);
  } catch {
    return "<p>Marketing site loading…</p>";
  }
}

/** Catch-all for marketing SPA routes (/pricing, /faq, /industries/…, etc.). */
export default async function MarketingCatchAllPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  const path = slug?.length ? `/${slug.join("/")}` : "/";
  const plain = plainAppPath(path);
  if (plain) redirect(plain);
  const bodyHtml = getMarketingBodyHtml();
  const pageIds = new Set(Array.from(bodyHtml.matchAll(/<div id="page-([\w-]+)"/g), (m) => m[1]));
  if (!isKnownMarketingPath(path, pageIds)) notFound();
  const pageId = resolveMarketingPage(path);
  return <MarketingSPA bodyHtml={bodyHtml} initialPage={pageId} ssrHtml={extractPageHtml(bodyHtml, pageId)} />;
}
