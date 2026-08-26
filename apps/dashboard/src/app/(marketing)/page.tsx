import type { Metadata } from "next";
import { readFileSync } from "fs";
import { join } from "path";
import MarketingSPA from "@/components/marketing/MarketingSPA";

export const metadata: Metadata = {
  title: "Halla AI – AI Consultancy & Pure AI Receptionist",
  description:
    "Halla AI Consultancy installs connected automation for small businesses. Plus a 24/7 AI receptionist that answers every call — starting at $39/month.",
  openGraph: {
    title: "Halla AI – Never Miss a Call",
    description:
      "Every call answered in under 2 seconds. Books appointments, captures leads, blocks spam.",
    type: "website",
    images: [{ url: "/logo.png" }],
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
  return <MarketingSPA bodyHtml={bodyHtml} initialPage="consultancy" />;
}
