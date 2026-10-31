import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractPageHtml } from "@/lib/marketing-ssr";
import { marketingMetadata } from "@/lib/marketing-metadata";
import { resolveMarketingPage } from "@/lib/marketing-routes";

const body = readFileSync(path.resolve(__dirname, "../../public/marketing-body.html"), "utf8");

describe("extractPageHtml", () => {
  it("returns the consultancy page with its real headline, visible, and none of the other pages", () => {
    const html = extractPageHtml(body, "consultancy");
    expect(html).toContain("We design, build and run the AI systems your business depends on.");
    expect(html).toMatch(/^<div id="page-consultancy" class="page active"/);
    expect(html).not.toContain('id="page-pricing"');
    expect(html).not.toContain('id="page-security"');
    expect(html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length).toBeGreaterThan(300);
  });

  it("makes a page that is not active by default visible, because .page is hidden until .active", () => {
    const html = extractPageHtml(body, "consult-signup");
    expect(html).toMatch(/^<div id="page-consult-signup" class="page active"/);
    expect(html).toContain("Book Your Diagnostic Call");
  });

  it("returns nothing for an unknown or unsafe page id rather than guessing", () => {
    expect(extractPageHtml(body, "no-such-page")).toBe("");
    expect(extractPageHtml(body, "")).toBe("");
    expect(extractPageHtml(body, '"><script>')).toBe("");
  });
});

describe("marketingMetadata", () => {
  it("describes the home page as the consultancy, with its own canonical address and no doubled brand name", () => {
    const m = marketingMetadata("consultancy", "/en");
    expect(m.title).toEqual({ absolute: "Halla AI | AI Consultancy & AI Receptionist for the GCC" });
    expect(String(m.description)).toContain("we install it");
    expect(m.alternates?.canonical).toBe("/en");
    expect(m.openGraph?.url).toBe("/en");
  });

  it("leaves every other marketing page on its existing receptionist wording", () => {
    const m = marketingMetadata("pricing", "/pricing");
    expect(m.title).toBe("Halla AI – Smart • Seamless • Always");
    expect(String(m.description)).toContain("answers every call 24/7");
    expect(m.alternates).toBeUndefined();
  });

  it("gives the fit-check page its own title, description and canonical address", () => {
    const m = marketingMetadata("fit-check", "/fit-check");
    expect(m.title).toEqual({ absolute: "Is Halla AI a fit for your business? | Halla AI Consultancy" });
    expect(String(m.description)).toContain("quick questions about your company");
    expect(m.alternates?.canonical).toBe("/fit-check");
  });

  it("sends the fit-check form's real questions in the first HTML", () => {
    const html = extractPageHtml(body, "fit-check");
    expect(html).toMatch(/^<div id="page-fit-check" class="page active"/);
    expect(html).toContain("How many people work in the company?");
    expect(html).not.toContain('id="page-consult-signup"');
  });
  it("gives the AI Consultancy page its own address, title and first-HTML content", () => {
    expect(resolveMarketingPage("/ai-consultancy")).toBe("ai-consultancy");
    const m = marketingMetadata("ai-consultancy", "/ai-consultancy");
    expect(m.title).toEqual({ absolute: "AI Consultancy for Small and Mid-Sized Businesses | Halla AI" });
    expect(m.alternates?.canonical).toBe("/ai-consultancy");
    const html = extractPageHtml(body, "ai-consultancy");
    expect(html).toMatch(/^<div id="page-ai-consultancy" class="page active"/);
    expect(html).toContain("Custom software");
  });
});
