"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const buildId = process.env.NEXT_PUBLIC_BUILD_ID || "local";

function readIframeHeight(iframe: HTMLIFrameElement): number {
  const doc = iframe.contentDocument;
  if (!doc) return 0;

  const footer = doc.querySelector("footer");
  if (footer instanceof HTMLElement) {
    return footer.offsetTop + footer.offsetHeight;
  }

  return Math.max(
    doc.documentElement.scrollHeight,
    doc.body?.scrollHeight ?? 0
  );
}

/**
 * Exact root index.html in the Next.js app (unscoped calliq_styles.css inside iframe).
 * Grows to full document height so the parent page scrolls (nav → footer all visible).
 */
export function CallIQLandingFrame() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState<number | null>(null);

  const syncHeight = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const next = readIframeHeight(iframe);
    if (next > 0) setHeight(next);
  }, []);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframe.contentWindow) return;
      if (event.data?.type !== "calliq-iframe-height") return;
      const h = Number(event.data.height);
      if (h > 0) setHeight(h);
    };

    let ro: ResizeObserver | null = null;
    let mo: MutationObserver | null = null;
    let resizeHandler: (() => void) | null = null;

    const scheduleSync = () => {
      syncHeight();
      [100, 400, 1200].forEach((ms) => window.setTimeout(syncHeight, ms));
    };

    const onLoad = () => {
      scheduleSync();
      const doc = iframe.contentDocument;
      if (!doc) return;

      resizeHandler = scheduleSync;
      ro = new ResizeObserver(scheduleSync);
      ro.observe(doc.documentElement);
      if (doc.body) ro.observe(doc.body);

      mo = new MutationObserver(() => {
        requestAnimationFrame(scheduleSync);
      });
      mo.observe(doc.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class"],
      });

      window.addEventListener("resize", resizeHandler);
    };

    iframe.addEventListener("load", onLoad);
    window.addEventListener("message", onMessage);

    return () => {
      iframe.removeEventListener("load", onLoad);
      window.removeEventListener("message", onMessage);
      if (resizeHandler) window.removeEventListener("resize", resizeHandler);
      ro?.disconnect();
      mo?.disconnect();
    };
  }, [syncHeight]);

  return (
    <iframe
      ref={iframeRef}
      src={`/index.html?v=${buildId}`}
      title="Call IQ — AI Receptionist"
      className="w-full max-w-[100vw] border-0 block"
      style={{
        minHeight: "100dvh",
        height: height ? `${height}px` : "100dvh",
        width: "100%",
      }}
      scrolling="no"
      allow="clipboard-read; clipboard-write"
    />
  );
}
