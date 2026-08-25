"use client";

import Script from "next/script";

interface Props {
  bodyHtml: string;
  initialPage?: string;
}

/**
 * Renders the static Halla AI marketing SPA inside the Next.js app.
 *
 * Styles/fonts load from (marketing)/layout.tsx in SSR <head>.
 * Loads halla_main.js after render and bridges SPA routing to Next.js auth routes.
 */
export default function MarketingSPA({ bodyHtml, initialPage = "home" }: Props) {
  const safeInitialPage = initialPage.replace(/[^a-z0-9-]/gi, "") || "home";

  return (
    <>
      <div
        id="marketing-spa-root"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />

      <Script src="/halla_main.js" strategy="afterInteractive" />

      <Script id="marketing-bridge" strategy="afterInteractive">{`
        (function() {
          var INITIAL_PAGE = ${JSON.stringify(safeInitialPage)};
          var NEXT_ROUTES = {
            signup: '/signup',
            login: '/login',
          };

          function installPatch() {
            var orig = window.go;
            window.go = function(page) {
              if (NEXT_ROUTES[page]) {
                window.location.href = NEXT_ROUTES[page];
                return;
              }
              if (typeof orig === 'function') {
                orig.call(window, page);
                return;
              }
              setTimeout(function() { window.go(page); }, 80);
            };

            window.setLang = function(lang) {
              var root = document.getElementById('marketing-spa-root');
              if (root) {
                root.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
                root.setAttribute('lang', lang);
              }
              document.documentElement.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
              document.documentElement.setAttribute('lang', lang);
              document.querySelectorAll('.lang-toggle button').forEach(function(b) {
                b.classList.toggle('active', b.getAttribute('data-lang') === lang);
              });
              try { localStorage.setItem('halla_lang', lang); } catch(e) {}
            };

            var saved = 'en';
            try { saved = localStorage.getItem('halla_lang') || 'en'; } catch(e) {}
            window.setLang(saved);

            var initial = INITIAL_PAGE || 'home';
            window.go(initial);
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
