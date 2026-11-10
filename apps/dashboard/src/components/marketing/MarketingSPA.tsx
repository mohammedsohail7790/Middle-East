"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef } from "react";
import { MarketingVibeLayer } from "@/components/marketing/MarketingVibeLayer";
import { MarketingPremiumLayer } from "@/components/marketing/premium/MarketingPremiumLayer";
import { MarketingConsultancyLayer } from "@/components/marketing/premium/MarketingConsultancyLayer";
import { Dashboard3DMounts } from "@/components/marketing/premium/Dashboard3DMounts";
import { MarketingAtmosphere } from "@/components/marketing/effects/MarketingAtmosphere";
import { pagePath, resolveMarketingPage } from "@/lib/marketing-routes";
import { linkifyPages, runInlineScripts, titleForPage } from "@/lib/marketing-dom";
import { pageTitle } from "@/lib/marketing-metadata";

interface Props {
  bodyHtml: string;
  initialPage?: string;
  /** One page's HTML rendered on the server, so crawlers and link previews get real text. The browser replaces it with the full app on mount. */
  ssrHtml?: string;
}

const NEXT_ROUTES: Record<string, string> = {
  signup: "/signup",
  login: "/login",
};

const GSAP_URL = "https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js";
const SCROLL_TRIGGER_URL =
  "https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/ScrollTrigger.min.js";

type HallaWindow = Window & {
  go?: (page: string) => void;
  setLang?: (lang: string) => void;
  HALLA_EMBEDDED?: boolean;
  THREE?: typeof import("three");
  HallaNeural?: { init: () => void; refreshForPage?: (page: string) => void };
};

function getHallaWindow(): HallaWindow {
  return window as HallaWindow;
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => resolve();
    document.body.appendChild(script);
  });
}


/**
 * Renders the static Halla AI marketing SPA inside the Next.js app.
 *
 * halla_main.js loads first so routing works even if THREE/GSAP fail.
 * Neural + GSAP are decorative and load in parallel afterward.
 */
export default function MarketingSPA({ bodyHtml, initialPage = "consultancy", ssrHtml }: Props) {
  const safeInitialPage = initialPage.replace(/[^a-z0-9-]/gi, "") || "consultancy";
  const bridgeInstalled = useRef(false);
  const decorStarted = useRef(false);
  const spaRootRef = useRef<HTMLDivElement>(null);
  const htmlInjected = useRef(false);

  useEffect(() => {
    const el = spaRootRef.current;
    if (!el || htmlInjected.current) return;
    el.innerHTML = bodyHtml;
    runInlineScripts(el);
    linkifyPages(el);
    htmlInjected.current = true;
    window.dispatchEvent(new CustomEvent("halla-marketing-mounted"));
  }, [bodyHtml]);

  useEffect(() => {
    const el = spaRootRef.current;
    if (!el) return;
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.("a[href^='/'][onclick]");
      if (!a) return;
      // Ctrl / Cmd / Shift / middle click: let the browser open the real address. A plain click: the page script already navigated, so do not reload.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
    };
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
  }, []);

  const ensureMarketingHtml = useCallback(() => {
    const el = spaRootRef.current;
    if (!el || htmlInjected.current) return;
    el.innerHTML = bodyHtml;
    runInlineScripts(el);
    linkifyPages(el);
    htmlInjected.current = true;
    window.dispatchEvent(new CustomEvent("halla-marketing-mounted"));
  }, [bodyHtml]);

  const installBridge = useCallback(() => {
    if (bridgeInstalled.current) return;

    const halla = getHallaWindow();
    const spaGo = halla.go;
    if (typeof spaGo !== "function") return;

    bridgeInstalled.current = true;

    let ready = false; // false while the first page is being shown
    let pushing = true; // false while handling the back button, so going back does not add a new history entry
    halla.go = function go(page: string) {
      const nextHref = NEXT_ROUTES[page];
      if (nextHref) {
        window.location.href = nextHref;
        return;
      }
      spaGo(page);
      if (!ready) return;
      // Keep the address bar and the tab title in step with the page, so a page can be shared, bookmarked and reached with the back button.
      const path = pagePath(page);
      if (pushing && path && window.location.pathname !== path) window.history.pushState(null, "", path);
      const title = pageTitle(page) ?? titleForPage(page);
      if (title) document.title = title;
    };
    window.addEventListener("popstate", () => {
      pushing = false;
      halla.go?.(resolveMarketingPage(window.location.pathname));
      pushing = true;
    });

    halla.setLang = function setLang(lang: string) {
      const root = document.getElementById("marketing-spa-root");
      if (root) {
        root.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");
        root.setAttribute("lang", lang);
      }
      document.documentElement.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");
      document.documentElement.setAttribute("lang", lang);
      document.querySelectorAll(".lang-toggle button").forEach((b) => {
        b.classList.toggle("active", b.getAttribute("data-lang") === lang);
      });
      // Dropdown options cannot hold two language spans, so they carry data-en / data-ar and are switched here.
      document.querySelectorAll<HTMLElement>("[data-en][data-ar]").forEach((node) => {
        node.textContent = (lang === "ar" ? node.dataset.ar : node.dataset.en) ?? node.textContent;
      });
      (window as unknown as { applyPrimaryCtaText?: () => void }).applyPrimaryCtaText?.();
      try {
        localStorage.setItem("halla_lang", lang);
      } catch {
        /* ignore */
      }
    };

    let saved = "en";
    try {
      saved = localStorage.getItem("halla_lang") || "en";
    } catch {
      /* ignore */
    }
    halla.setLang(saved);
    halla.go(safeInitialPage);
    ready = true; // from here on, every page change is a visitor action
  }, [safeInitialPage]);

  const bootDecor = useCallback(() => {
    if (decorStarted.current) return;
    decorStarted.current = true;
    getHallaWindow().HALLA_EMBEDDED = true;

    const refreshNeural = () => {
      const neural = getHallaWindow().HallaNeural;
      neural?.init();
      neural?.refreshForPage?.(safeInitialPage);
    };

    void import("three")
      .then((THREE) => {
        getHallaWindow().THREE = THREE;
        // halla_plexus.js (the consultancy graph backdrop) is WebGL-based
        // and needs window.THREE set before it runs, so it only starts
        // loading once the three import above has resolved.
        void loadScript("/halla_plexus.js");
        return loadScript("/halla_neural.js");
      })
      .then(refreshNeural)
      .catch(() => loadScript("/halla_neural.js").then(refreshNeural));

    void loadScript(GSAP_URL).then(() => loadScript(SCROLL_TRIGGER_URL));
  }, [safeInitialPage]);

  const onMainReady = useCallback(() => {
    ensureMarketingHtml();
    installBridge();
    bootDecor();
  }, [ensureMarketingHtml, installBridge, bootDecor]);

  useEffect(() => {
    getHallaWindow().HALLA_EMBEDDED = true;

    if (typeof getHallaWindow().go === "function") {
      onMainReady();
    }

    const fallback = window.setTimeout(() => {
      if (!bridgeInstalled.current && typeof getHallaWindow().go === "function") {
        onMainReady();
      }
    }, 5000);

    return () => window.clearTimeout(fallback);
  }, [onMainReady]);

  return (
    <>
      <MarketingAtmosphere variant="marketing" />
      <MarketingVibeLayer />
      <MarketingPremiumLayer />
      <MarketingConsultancyLayer />
      <div id="marketing-spa-root" ref={spaRootRef} suppressHydrationWarning dangerouslySetInnerHTML={ssrHtml ? { __html: ssrHtml } : undefined} />
      <Dashboard3DMounts />

      <Script
        src="/halla_main.js"
        strategy="afterInteractive"
        onLoad={onMainReady}
        onReady={onMainReady}
      />
    </>
  );
}
