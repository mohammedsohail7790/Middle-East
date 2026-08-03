"use client";

import Script from "next/script";

// Tawk.to widget IDs are public by design — they're embedded directly in the
// <script src> tag that ships to every visitor's browser. Env vars can still
// override these (e.g. a second property for staging).
const DEFAULT_PROPERTY_ID = "6a527cd09a72601d480b42c5";
const DEFAULT_WIDGET_ID = "1jt93f4bi";

const PROPERTY_ID = process.env.NEXT_PUBLIC_TAWK_PROPERTY_ID || DEFAULT_PROPERTY_ID;
const WIDGET_ID = process.env.NEXT_PUBLIC_TAWK_WIDGET_ID || DEFAULT_WIDGET_ID;

/**
 * Loads the Tawk.to live-chat widget via next/script instead of a manual
 * document.body.appendChild — a raw DOM mutation in a useEffect can race
 * with React's own Suspense-boundary reveal, which also manipulates
 * document.body's children right after hydration.
 *
 * strategy="afterInteractive" (not "lazyOnload") — lazyOnload waits for the
 * browser to report a true idle period, which can be delayed indefinitely on
 * a busy page and made the chat bubble show up inconsistently.
 */
export function TawkChatWidget() {
  return (
    <Script id="tawk-embed-script" strategy="afterInteractive">
      {`
        var Tawk_API = Tawk_API || {};
        var Tawk_LoadStart = new Date();
        (function(){
          var s1 = document.createElement("script"), s0 = document.getElementsByTagName("script")[0];
          s1.async = true;
          s1.src = "https://embed.tawk.to/${PROPERTY_ID}/${WIDGET_ID}";
          s1.charset = "UTF-8";
          s1.setAttribute("crossorigin", "*");
          s0.parentNode.insertBefore(s1, s0);
        })();
      `}
    </Script>
  );
}
