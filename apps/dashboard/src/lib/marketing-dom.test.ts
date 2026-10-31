import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { linkifyPages, runInlineScripts, titleForPage } from "@/lib/marketing-dom";
import { pagePath, resolveMarketingPage } from "@/lib/marketing-routes";
import { sitemapPaths } from "@/lib/marketing-sitemap";

const body = readFileSync(path.resolve(__dirname, "../../public/marketing-body.html"), "utf8");

describe("page web addresses", () => {
  it("gives every public page an address that resolves back to the same page", () => {
    const ids = [...body.matchAll(/<div id="page-([a-z0-9-]+)"/g)].map((m) => m[1]).filter((id) => !["audit", "audit-pay", "audit-paid", "signup", "login"].includes(id));
    const noAddress = ids.filter((id) => !pagePath(id));
    expect(noAddress).toEqual([]);
    for (const id of ids) expect(resolveMarketingPage(pagePath(id) as string)).toBe(id);
  });
  it("lists the public pages in the sitemap, and never the private audit links", () => {
    const paths = sitemapPaths(body);
    expect(paths).toContain("/pricing");
    expect(paths).toContain("/automation");
    expect(paths).toContain("/ai-consultancy");
    expect(paths.some((p) => p.startsWith("/audit"))).toBe(false);
    expect(new Set(paths).size).toBe(paths.length);
  });
});

describe("marketing page behaviour in the browser", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    delete (window as unknown as { HallaCur?: unknown }).HallaCur;
    document.documentElement.setAttribute("lang", "en");
    document.documentElement.removeAttribute("dir");
    try { localStorage.removeItem("halla_cur"); } catch { /* ignore */ }
  });

  it("re-creates the page's inline scripts so a browser runs them, and the converter code then works", () => {
    const root = document.getElementById("root") as HTMLElement;
    // The real converter script from the page, with a price on a receptionist page, injected the same way the site does it.
    const script = body.slice(body.indexOf("<script>\n/* Currency display"), body.indexOf("</script>", body.indexOf("/* Currency display")) + 9);
    root.innerHTML = `<div id="page-pricing"><span id="p">$39</span><span id="x">250 min · $0.20/min extra</span></div>${script}`;
    const before = root.querySelector("script");
    runInlineScripts(root);
    const after = root.querySelector("script");
    expect(after).not.toBe(before); // a fresh element is what makes a browser run it (the old one was inert)
    // jsdom does not run inserted scripts, so run the same code here to prove what a browser will now do.
    new Function((after as HTMLScriptElement).text)();
    expect((window as unknown as { HallaCur?: { get(): string } }).HallaCur?.get()).toBe("AED");
    expect(document.getElementById("p")?.textContent).toBe("AED 149");
    expect(document.getElementById("x")?.textContent).toBe("250 min · AED 0.75/min extra");
  });

  it("leaves module scripts alone", () => {
    const root = document.getElementById("root") as HTMLElement;
    root.innerHTML = '<script type="module">window.__ran = true;</script>';
    const before = root.querySelector("script");
    runInlineScripts(root);
    expect(root.querySelector("script")).toBe(before);
  });

  it("gives script-call links their real address, and leaves other links alone", () => {
    const root = document.getElementById("root") as HTMLElement;
    root.innerHTML = `<a id="a" href="javascript:void(0)" onclick="go('pricing');closeMob()">P</a><a id="b" href="javascript:void(0)" onclick="goSol('answering')">S</a><a id="c" href="javascript:void(0)" onclick="switchSection('intelligence')">I</a><a id="d" href="javascript:void(0)" onclick="go('signup')">U</a><a id="e" href="javascript:void(0)" onclick="scrollToHomeSection('home-pricing')">X</a>`;
    linkifyPages(root);
    const href = (id: string) => document.getElementById(id)?.getAttribute("href");
    expect(href("a")).toBe("/pricing");
    expect(href("b")).toBe("/solutions/answering");
    expect(href("c")).toBe("/automation");
    expect(href("d")).toBe("/signup");
    expect(href("e")).toBe("javascript:void(0)");
  });

  it("uses a page's own headline as the tab title", () => {
    document.body.innerHTML = '<div id="page-pricing"><h1>Simple pricing.  Start free.</h1></div>';
    Object.defineProperty(HTMLElement.prototype, "innerText", { configurable: true, get() { return this.textContent; } });
    expect(titleForPage("pricing")).toBe("Simple pricing. Start free. | Halla AI");
    expect(titleForPage("missing")).toBeNull();
  });
});
