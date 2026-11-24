// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { MARKETING_PATH_TO_PAGE, localizedPath, pagePath, resolveMarketingPage, splitLocale, isKnownMarketingPath } from "@/lib/marketing-routes";
import { arabicPageText } from "@/lib/marketing-arabic";
import { localizedMarketingMetadata } from "@/lib/marketing-metadata";
import { sitemapEntries } from "@/lib/marketing-sitemap";
import { linkifyPages } from "@/lib/marketing-dom";

describe("language in the address", () => {
  it("reads /ar and /en off the front of an address", () => {
    expect(splitLocale("/ar/solutions")).toEqual({ lang: "ar", path: "/solutions", explicit: true });
    expect(splitLocale("/ar")).toEqual({ lang: "ar", path: "/", explicit: true });
    expect(splitLocale("/ar/")).toEqual({ lang: "ar", path: "/", explicit: true });
    expect(splitLocale("/en/pricing")).toEqual({ lang: "en", path: "/pricing", explicit: true });
    expect(splitLocale("/solutions")).toEqual({ lang: "en", path: "/solutions", explicit: false });
    expect(splitLocale("/")).toEqual({ lang: "en", path: "/", explicit: false });
  });

  it("does not mistake a page whose name starts with ar for a language", () => {
    expect(splitLocale("/area-guide")).toEqual({ lang: "en", path: "/area-guide", explicit: false });
  });

  it("builds the Arabic address and leaves the English one plain", () => {
    expect(localizedPath("/solutions", "ar")).toBe("/ar/solutions");
    expect(localizedPath("/", "ar")).toBe("/ar");
    expect(localizedPath("/solutions", "en")).toBe("/solutions");
    expect(localizedPath("/", "en")).toBe("/");
  });

  it("opens the same page in Arabic as in English, for every page", () => {
    const ids = new Set(Object.values(MARKETING_PATH_TO_PAGE));
    for (const id of ids) {
      const plain = pagePath(id) as string;
      expect(resolveMarketingPage(localizedPath(plain, "ar")), id).toBe(resolveMarketingPage(plain));
    }
    expect(resolveMarketingPage("/ar/industries/clinics")).toBe("industry-clinics");
    expect(resolveMarketingPage("/ar/solutions/answering")).toBe("solutions-answering");
    expect(resolveMarketingPage("/ar")).toBe("consultancy");
    expect(resolveMarketingPage("/en/pricing")).toBe("pricing");
  });

  it("still answers 404 for an unknown Arabic address", () => {
    const none = new Set<string>();
    expect(isKnownMarketingPath("/ar/pricing", none)).toBe(true);
    expect(isKnownMarketingPath("/ar/no-such-page", none)).toBe(false);
  });
});

const PAGE = `<div id="page-faq" class="page"><h1><span class="lang-en">Questions</span><span class="lang-ar">الأسئلة الشائعة</span></h1>
<p class="cx-lead"><span class="lang-en">English lead.</span><span class="lang-ar">جواب &amp; سريع</span></p></div>`;

describe("Arabic page text", () => {
  it("takes the Arabic headline and lead paragraph from the page", () => {
    expect(arabicPageText(PAGE)).toEqual({ title: "الأسئلة الشائعة", description: "جواب & سريع" });
  });
  it("gives null when the page has no Arabic text", () => {
    expect(arabicPageText('<div id="page-x"><h1>Only English</h1></div>')).toEqual({ title: null, description: null });
  });
});

describe("Arabic page metadata", () => {
  it("keeps Arabic pages out of search until they are opened up", () => {
    const m = localizedMarketingMetadata("faq", "/ar/faq", PAGE, false);
    expect(m.robots).toEqual({ index: false, follow: true });
    expect(m.alternates?.languages).toBeUndefined();
    expect(m.alternates?.canonical).toBe("/ar/faq");
    expect(m.title).toEqual({ absolute: "الأسئلة الشائعة | Halla AI" });
  });

  it("opens them to search, with links between the two languages, when switched on", () => {
    const ar = localizedMarketingMetadata("faq", "/ar/faq", PAGE, true);
    expect(ar.robots).toBeUndefined();
    expect(ar.alternates?.languages).toEqual({ en: "/faq", ar: "/ar/faq", "x-default": "/faq" });
    const en = localizedMarketingMetadata("faq", "/faq", "", true);
    expect(en.alternates?.languages).toEqual({ en: "/faq", ar: "/ar/faq", "x-default": "/faq" });
  });

  it("leaves English pages exactly as they were while Arabic is closed", () => {
    const m = localizedMarketingMetadata("faq", "/faq", "", false);
    expect(m.alternates?.canonical).toBe("/faq");
    expect(m.alternates?.languages).toBeUndefined();
    expect(m.robots).toBeUndefined();
  });

  it("points /en/... at the plain address so there is one copy", () => {
    expect(localizedMarketingMetadata("pricing", "/en/pricing", "", false).alternates?.canonical).toBe("/pricing");
  });

  it("never lists the private audit links, in any language", () => {
    for (const path of ["/audit", "/ar/audit"]) {
      const m = localizedMarketingMetadata("audit", path, "", true);
      expect(m.robots).toEqual({ index: false, follow: false });
    }
  });

  it("keeps an Arabic address out of search, and points at the English page, when the page has no Arabic text", () => {
    const m = localizedMarketingMetadata("faq", "/ar/faq", '<div id="page-faq"><h1>English</h1></div>', true);
    expect(m.robots).toEqual({ index: false, follow: true });
    expect(m.alternates?.canonical).toBe("/faq");
    expect(m.alternates?.languages).toBeUndefined();
  });
});

describe("sitemap", () => {
  const ar = (t: string) => `<h1><span class="lang-en">T</span><span class="lang-ar">${t}</span></h1>`;
  const body =
    `<div id="page-pricing" class="page">${ar("الأسعار")}</div><div id="page-faq" class="page">${ar("الأسئلة")}</div>` +
    '<div id="page-blog-per-minute" class="page"><h1>English only</h1></div><div id="page-audit" class="page"></div>';
  it("is unchanged while Arabic is closed", () => {
    expect(sitemapEntries(body, false).map((e) => e.path)).toEqual(["/pricing", "/faq", "/blog/per-minute-pricing"]);
  });
  it("adds every page's Arabic address, each pointing at the other, when open", () => {
    const entries = sitemapEntries(body, true);
    // The English-only article keeps its English entry and gets no Arabic one.
    expect(entries.map((e) => e.path)).toEqual(["/pricing", "/ar/pricing", "/faq", "/ar/faq", "/blog/per-minute-pricing"]);
    expect(entries[1].languages).toEqual({ en: "/pricing", ar: "/ar/pricing" });
  });
});

describe("links on an Arabic page", () => {
  it("point at the Arabic address, except sign-in and sign-up", () => {
    document.body.innerHTML = `<a id="a" onclick="go('pricing')" href="javascript:void(0)">p</a><a id="b" onclick="go('signup')" href="javascript:void(0)">s</a>`;
    linkifyPages(document.body, "ar");
    expect(document.getElementById("a")?.getAttribute("href")).toBe("/ar/pricing");
    expect(document.getElementById("b")?.getAttribute("href")).toBe("/signup");
    linkifyPages(document.body, "en");
    expect(document.getElementById("a")?.getAttribute("href")).toBe("/pricing");
  });
});
