import type { Metadata } from "next";
import { readFileSync } from "fs";
import { join } from "path";
import MarketingSPA from "@/components/marketing/MarketingSPA";
import { resolveMarketingPage } from "@/lib/marketing-routes";

export const metadata: Metadata = {
  title: "Halla AI – Smart • Seamless • Always",
  description:
    "Halla AI answers every call 24/7, books appointments, captures leads, and routes emergencies — automatically.",
};

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
  const bodyHtml = getMarketingBodyHtml();
  return <MarketingSPA bodyHtml={bodyHtml} initialPage={resolveMarketingPage(path)} />;
}
