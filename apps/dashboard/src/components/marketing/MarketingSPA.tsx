"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef } from "react";
import { MarketingVibeLayer } from "@/components/marketing/MarketingVibeLayer";
import { MarketingPremiumLayer } from "@/components/marketing/premium/MarketingPremiumLayer";
import { MarketingConsultancyLayer } from "@/components/marketing/premium/MarketingConsultancyLayer";
import { Dashboard3DMounts } from "@/components/marketing/premium/Dashboard3DMounts";
import { MarketingAtmosphere } from "@/components/marketing/effects/MarketingAtmosphere";

interface Props {
  bodyHtml: string;
  initialPage?: string;
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
export default function MarketingSPA({ bodyHtml, initialPage = "consultancy" }: Props) {
  const safeInitialPage = initialPage.replace(/[^a-z0-9-]/gi, "") || "consultancy";
  const bridgeInstalled = useRef(false);
  const decorStarted = useRef(false);
  const spaRootRef = useRef<HTMLDivElement>(null);
  const htmlInjected = useRef(false);

  useEffect(() => {
    const el = spaRootRef.current;
    if (!el || htmlInjected.current) return;
    el.innerHTML = bodyHtml;
    htmlInjected.current = true;
    window.dispatchEvent(new CustomEvent("halla-marketing-mounted"));
  }, [bodyHtml]);

  const ensureMarketingHtml = useCallback(() => {
    const el = spaRootRef.current;
    if (!el || htmlInjected.current) return;
    el.innerHTML = bodyHtml;
    htmlInjected.current = true;
    window.dispatchEvent(new CustomEvent("halla-marketing-mounted"));
  }, [bodyHtml]);

  const installBridge = useCallback(() => {
    if (bridgeInstalled.current) return;

    const halla = getHallaWindow();
    const spaGo = halla.go;
    if (typeof spaGo !== "function") return;

    bridgeInstalled.current = true;

    halla.go = function go(page: string) {
      const nextHref = NEXT_ROUTES[page];
      if (nextHref) {
        window.location.href = nextHref;
        return;
      }
      spaGo(page);
    };

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
        return loadScript("/halla_neural.js");
      })
      .then(refreshNeural)
      .catch(() => loadScript("/halla_neural.js").then(refreshNeural));

    void loadScript(GSAP_URL).then(() => loadScript(SCROLL_TRIGGER_URL));

    // No three.js dependency — plain 2D canvas, loads independently of the chain above.
    void loadScript("/halla_plexus.js");
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
      <div id="marketing-spa-root" ref={spaRootRef} />
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
