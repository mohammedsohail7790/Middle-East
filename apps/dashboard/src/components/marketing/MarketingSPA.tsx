"use client";

import { useEffect } from "react";
import Script from "next/script";

interface Props {
  bodyHtml: string;
}

/**
 * Renders the static Halla AI marketing SPA inside the Next.js app.
 *
 * - Injects halla_styles.css + external fonts/icons into <head>
 * - Renders the SPA body HTML via dangerouslySetInnerHTML
 * - Loads halla_main.js after render
 * - Patches go() to redirect sign-up/login to real Next.js routes
 */
export default function MarketingSPA({ bodyHtml }: Props) {
  useEffect(() => {
    // Inject the marketing stylesheet into <head> if not already present
    if (!document.getElementById("halla-styles")) {
      const link = document.createElement("link");
      link.id = "halla-styles";
      link.rel = "stylesheet";
      link.href = "/halla_styles.css";
      document.head.appendChild(link);
    }
    // Tabler Icons webfont
    if (!document.getElementById("tabler-icons")) {
      const link = document.createElement("link");
      link.id = "tabler-icons";
      link.rel = "stylesheet";
      link.href =
        "https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/dist/tabler-icons.min.css";
      document.head.appendChild(link);
    }
    // Google Fonts
    if (!document.getElementById("halla-fonts")) {
      const link = document.createElement("link");
      link.id = "halla-fonts";
      link.rel = "stylesheet";
      link.href =
        "https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@300;400;500;600;700;800;900&family=Cairo:wght@300;400;500;600;700;800;900&display=swap";
      document.head.appendChild(link);
    }
  }, []);

  return (
    <>
      {/* Render the entire SPA body */}
      <div
        id="marketing-spa-root"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />

      {/* Load the SPA JS after the DOM is painted */}
      <Script src="/halla_main.js" strategy="afterInteractive" />

      {/*
       * Bridge script: patch go() so key pages route to real Next.js routes.
       * halla_main.js already checks window.__NEXT_DATA__, but we patch early
       * just in case the SPA calls go() before the main script finishes patching.
       */}
      <Script id="marketing-bridge" strategy="afterInteractive">{`
        (function patchGoRouter() {
          var ROUTES = {
            signup: '/signup',
            login: '/login',
            pricing: '/pricing',
            contact: '/contact',
            dashboard: '/dashboard',
          };
          function installPatch() {
            var orig = window.go;
            window.go = function(page) {
              if (ROUTES[page]) { window.location.href = ROUTES[page]; return; }
              if (typeof orig === 'function') orig.call(window, page);
              else {
                // SPA not loaded yet — queue re-try
                setTimeout(function() { window.go(page); }, 80);
              }
            };
          }
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', installPatch);
          } else {
            installPatch();
          }
        })();
      `}</Script>
    </>
  );
}
