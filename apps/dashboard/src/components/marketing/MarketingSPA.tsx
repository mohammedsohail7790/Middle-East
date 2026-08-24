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
        "https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.46.0/dist/tabler-icons.min.css";
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
       * Bridge script:
       * 1. Patch go() so key pages route to real Next.js routes.
       * 2. Patch setLang() to apply dir= on #marketing-spa-root instead of <html>
       *    so React hydration doesn't strip the dir attribute off <html>.
       */}
      <Script id="marketing-bridge" strategy="afterInteractive">{`
        (function() {
          // ── Route patching ──────────────────────────────────────────────
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
                setTimeout(function() { window.go(page); }, 80);
              }
            };

            // ── Language toggle patch ──────────────────────────────────────
            // Apply dir/lang on the SPA root div, not on <html>, so React
            // hydration does not reset the attribute.
            window.setLang = function(lang) {
              var root = document.getElementById('marketing-spa-root');
              if (root) {
                root.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
                root.setAttribute('lang', lang);
              }
              // Also set on <html> for font/body rules
              document.documentElement.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
              document.documentElement.setAttribute('lang', lang);
              document.querySelectorAll('.lang-toggle button').forEach(function(b) {
                b.classList.toggle('active', b.getAttribute('data-lang') === lang);
              });
              try { localStorage.setItem('halla_lang', lang); } catch(e) {}
            };

            // Apply saved language immediately
            var saved = 'en';
            try { saved = localStorage.getItem('halla_lang') || 'en'; } catch(e) {}
            window.setLang(saved);
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
