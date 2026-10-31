import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/script", () => ({ default: () => null }));
vi.mock("@/components/marketing/MarketingVibeLayer", () => ({ MarketingVibeLayer: () => null }));
vi.mock("@/components/marketing/premium/MarketingPremiumLayer", () => ({ MarketingPremiumLayer: () => null }));
vi.mock("@/components/marketing/premium/MarketingConsultancyLayer", () => ({ MarketingConsultancyLayer: () => null }));
vi.mock("@/components/marketing/premium/Dashboard3DMounts", () => ({ Dashboard3DMounts: () => null }));
vi.mock("@/components/marketing/effects/MarketingAtmosphere", () => ({ MarketingAtmosphere: () => null }));
import MarketingSPA from "@/components/marketing/MarketingSPA";
import { extractPageHtml } from "@/lib/marketing-ssr";

const body = readFileSync(path.resolve(__dirname, "../../../public/marketing-body.html"), "utf8");
const visibleWords = (html: string) => html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/g, "").replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;

describe("MarketingSPA on the server", () => {
  it("sends the page's real headline and text in the first HTML, where before it sent an empty container", () => {
    const before = renderToString(<MarketingSPA bodyHtml={body} initialPage="consultancy" />);
    const after = renderToString(<MarketingSPA bodyHtml={body} initialPage="consultancy" ssrHtml={extractPageHtml(body, "consultancy")} />);
    expect(visibleWords(before)).toBeLessThan(20);
    expect(after).toContain("We design, build and run the AI systems your business depends on.");
    expect(after).toContain("<h1");
    expect(visibleWords(after)).toBeGreaterThan(300);
  });
});
