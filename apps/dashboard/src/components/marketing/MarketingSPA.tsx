"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
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

type HallaWindow = Window & {
  go?: (page: string) => void;
  setLang?: (lang: string) => void;
  HALLA_EMBEDDED?: boolean;
  HallaNeural?: { init: () => void };
};

function getHallaWindow(): HallaWindow {
  return window as HallaWindow;
}

/**
 * Renders the static Halla AI marketing SPA inside the Next.js app.
 *
 * Styles/fonts load from (marketing)/layout.tsx in SSR <head>.
 * Vendor scripts are chained so Three.js loads before halla_neural.js.
 */
export default function MarketingSPA({ bodyHtml, initialPage = "consultancy" }: Props) {
  const safeInitialPage = initialPage.replace(/[^a-z0-9-]/gi, "") || "consultancy";
  const bridgeInstalled = useRef(false);
  const [scriptStep, setScriptStep] = useState(0);

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

  useEffect(() => {
    getHallaWindow().HALLA_EMBEDDED = true;
  }, []);

  useEffect(() => {
    if (scriptStep >= 4) installBridge();
  }, [scriptStep, installBridge]);

  return (
    <>
      <MarketingAtmosphere variant="marketing" />
      <div id="siteNeuralMount" className="site-neural-canvas" aria-hidden />
      <div id="consultPageNeuralMount" className="consult-page-neural-canvas" aria-hidden />
      <MarketingVibeLayer />
      <MarketingPremiumLayer />
      <MarketingConsultancyLayer />
      <div
        id="marketing-spa-root"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />
      <Dashboard3DMounts />

      <Script
        src="https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.min.js"
        strategy="afterInteractive"
        onLoad={() => setScriptStep(1)}
      />
      {scriptStep >= 1 && (
        <Script
          src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"
          strategy="afterInteractive"
          onLoad={() => setScriptStep(2)}
        />
      )}
      {scriptStep >= 2 && (
        <Script
          src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/ScrollTrigger.min.js"
          strategy="afterInteractive"
          onLoad={() => setScriptStep(3)}
        />
      )}
      {scriptStep >= 3 && (
        <Script
          src="/halla_neural.js"
          strategy="afterInteractive"
          onLoad={() => {
            getHallaWindow().HallaNeural?.init();
            setScriptStep(4);
          }}
        />
      )}
      {scriptStep >= 4 && (
        <Script
          src="/halla_main.js"
          strategy="afterInteractive"
          onLoad={installBridge}
          onReady={installBridge}
        />
      )}
    </>
  );
}
