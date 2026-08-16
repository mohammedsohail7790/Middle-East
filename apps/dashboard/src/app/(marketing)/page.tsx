import type { Metadata } from "next";
import { readFileSync } from "fs";
import { join } from "path";
import MarketingSPA from "@/components/marketing/MarketingSPA";

export const metadata: Metadata = {
  title: "Halla AI – Pure AI Receptionist | Never Miss a Call Again",
  description:
    "Halla AI answers every call 24/7, books appointments, captures leads, and routes emergencies — automatically. Starting at $39/month.",
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
    const filePath = join(process.cwd(), "public", "index.html");
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
  return <MarketingSPA bodyHtml={bodyHtml} />;
}
