"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef } from "react";
import { MarketingVibeLayer } from "@/components/marketing/MarketingVibeLayer";
import { MarketingPremiumLayer } from "@/components/marketing/premium/MarketingPremiumLayer";
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
};

function getHallaWindow(): HallaWindow {
  return window as HallaWindow;
}

/**
 * Renders the static Halla AI marketing SPA inside the Next.js app.
 *
 * Styles/fonts load from (marketing)/layout.tsx in SSR <head>.
 * halla_main.js must load before we patch routing — onLoad + mount fallback.
 */
export default function MarketingSPA({ bodyHtml, initialPage = "home" }: Props) {
  const safeInitialPage = initialPage.replace(/[^a-z0-9-]/gi, "") || "home";
  const bridgeInstalled = useRef(false);

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
    installBridge();
  }, [installBridge]);

  return (
    <>
      <MarketingAtmosphere variant="marketing" />
      <MarketingVibeLayer />
      <MarketingPremiumLayer />
      <div
        id="marketing-spa-root"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />

      <Script
        src="/halla_main.js"
        strategy="afterInteractive"
        onLoad={installBridge}
        onReady={installBridge}
      />
    </>
  );
}
