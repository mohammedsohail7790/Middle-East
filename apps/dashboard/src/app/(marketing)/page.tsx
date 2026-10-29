import type { Metadata } from "next";
import { readFileSync } from "fs";
import { join } from "path";
import MarketingSPA from "@/components/marketing/MarketingSPA";
import { extractPageHtml } from "@/lib/marketing-ssr";

export const metadata: Metadata = {
  title: "Halla AI | AI Consultancy & AI Receptionist for the GCC",
  description:
    "We don’t sell AI — we install it. Halla AI builds connected AI systems for operations, client acquisition and brand visibility for businesses in the UAE, Saudi Arabia and the wider GCC, plus a 24/7 Arabic and English AI receptionist.",
  openGraph: {
    title: "Halla AI – Never Miss a Call",
    description:
      "Every call answered in under 2 seconds. Books appointments, captures leads, blocks spam.",
    type: "website",
    images: [{ url: "/logo-receptionist.jpg" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Halla AI – Never Miss a Call",
    description:
      "Every call answered in under 2 seconds. Books appointments, captures leads, blocks spam.",
  },
};

function getMarketingBodyHtml(): string {
  try {
    const filePath = join(process.cwd(), "public", "marketing-body.html");
    const html = readFileSync(filePath, "utf8");
    // Extract content between <body> and </body>
    const bodyStart = html.indexOf("<body");
    const bodyContentStart = html.indexOf(">", bodyStart) + 1;
    const bodyEnd = html.lastIndexOf("</body>");
    if (bodyStart === -1 || bodyEnd === -1) return "<p>Marketing site loading…</p>";
    return html.slice(bodyContentStart, bodyEnd);
  } catch {
    return "<p>Marketing site loading…</p>";
  }
}

export default function HomePage() {
  const bodyHtml = getMarketingBodyHtml();
  return <MarketingSPA bodyHtml={bodyHtml} initialPage="consultancy" ssrHtml={extractPageHtml(bodyHtml, "consultancy")} />;
}
