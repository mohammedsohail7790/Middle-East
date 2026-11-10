import { describe, it, expect } from "vitest";
import { existsSync, statSync } from "fs";
import { join } from "path";
import { marketingMetadata } from "./marketing-metadata";

const imageOf = (pageId: string) => {
  const og = marketingMetadata(pageId, `/${pageId}`).openGraph as { images?: { url: string; width?: number; height?: number }[] } | undefined;
  return og?.images?.[0];
};

describe("marketing share images", () => {
  it("gives every receptionist page the receptionist card at 1200x630", () => {
    for (const id of ["home", "features", "pricing", "how-it-works", "integrations", "faq", "roi", "about", "vs-ruby", "solutions-answering", "industry-clinics", "blog"]) {
      const img = imageOf(id);
      expect(img?.url, id).toBe("/og-halla-receptionist.png");
      expect(img?.width).toBe(1200);
      expect(img?.height).toBe(630);
    }
  });

  it("gives the consultancy and automation pages the consultancy card", () => {
    for (const id of ["consultancy", "ai-consultancy", "intelligence", "svc-operations", "consult-signup", "fit-check", "audit-info"]) {
      expect(imageOf(id)?.url, id).toBe("/og-halla-consultancy.png");
    }
  });

  it("puts the same image in the X / LinkedIn card", () => {
    const tw = marketingMetadata("home", "/home").twitter as { card?: string; images?: string[] };
    expect(tw.card).toBe("summary_large_image");
    expect(tw.images).toEqual(["/og-halla-receptionist.png"]);
  });

  it("adds no preview to the private audit pages that open from an emailed link", () => {
    for (const id of ["audit", "audit-pay", "audit-paid"]) {
      const m = marketingMetadata(id, `/${id}`);
      expect(m.openGraph, id).toBeUndefined();
      expect(m.robots).toMatchObject({ index: false });
    }
  });

  it("keeps each page's own title and description", () => {
    const m = marketingMetadata("pricing", "/pricing");
    expect(m.title).toEqual({ absolute: "AI Receptionist Pricing | Halla AI" });
    expect((m.openGraph as { title?: string }).title).toBe("AI Receptionist Pricing | Halla AI");
  });

  it("points at image files that exist and are a sensible size", () => {
    for (const f of ["og-halla-receptionist.png", "og-halla-consultancy.png"]) {
      const p = join(process.cwd(), "public", f);
      expect(existsSync(p), f).toBe(true);
      expect(statSync(p).size, f).toBeLessThan(300 * 1024);
    }
  });
});
