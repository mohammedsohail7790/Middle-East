import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractPageHtml } from "@/lib/marketing-ssr";
import { marketingMetadata } from "@/lib/marketing-metadata";

const body = readFileSync(path.resolve(__dirname, "../../public/marketing-body.html"), "utf8");

describe("extractPageHtml", () => {
  it("returns the consultancy page with its real headline, visible, and none of the other pages", () => {
    const html = extractPageHtml(body, "consultancy");
    expect(html).toContain("We Don't Sell AI");
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
});
