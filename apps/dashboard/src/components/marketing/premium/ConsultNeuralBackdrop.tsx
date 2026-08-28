"use client";

import dynamic from "next/dynamic";
import { Component, type ErrorInfo, type ReactNode, Suspense, useEffect, useState } from "react";
import { createPortal } from "react-dom";

const ConsultNeuralCanvas = dynamic(
  () => import("./ConsultNeuralCanvas").then((m) => ({ default: m.ConsultNeuralCanvas })),
  { ssr: false },
);

class NeuralErrorBoundary extends Component<
  { children: ReactNode; onError?: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn("[consult-neural]", error, info.componentStack);
    this.props.onError?.();
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

function useConsultancyActive() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const sync = () => {
      const page = document.getElementById("page-consultancy");
      const on =
        Boolean(page?.classList.contains("active")) ||
        document.body.getAttribute("data-section") === "consultancy";
      setActive(on);
      document.body.classList.toggle("consult-neural-active", on);
    };

    sync();
    const root = document.getElementById("marketing-spa-root");
    const observer = new MutationObserver(sync);
    if (root) {
      observer.observe(root, {
        subtree: true,
        attributes: true,
        childList: true,
        attributeFilter: ["class"],
      });
    }
    observer.observe(document.body, { attributes: true, attributeFilter: ["data-section"] });
    window.addEventListener("halla-marketing-mounted", sync);
    return () => {
      observer.disconnect();
      window.removeEventListener("halla-marketing-mounted", sync);
    };
  }, []);

  return active;
}

function useConsultMount(active: boolean) {
  const [mount, setMount] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) {
      setMount(null);
      return;
    }

    const attach = () => {
      const stage = document.getElementById("consultNeuralMount");
      if (!stage) return false;
      setMount(stage);
      return true;
    };

    if (attach()) return;

    const root = document.getElementById("marketing-spa-root");
    const observer = new MutationObserver(() => attach());
    if (root) {
      observer.observe(root, { childList: true, subtree: true, attributes: true });
    }

    const onMounted = () => attach();
    window.addEventListener("halla-marketing-mounted", onMounted);

    const interval = window.setInterval(() => {
      if (attach()) window.clearInterval(interval);
    }, 100);
    const stop = window.setTimeout(() => window.clearInterval(interval), 15000);

    return () => {
      observer.disconnect();
      window.removeEventListener("halla-marketing-mounted", onMounted);
      window.clearInterval(interval);
      window.clearTimeout(stop);
    };
  }, [active]);

  return mount;
}

function releaseVanillaConsultScene() {
  const halla = (window as Window & { HallaNeural?: { releaseConsult?: () => void } }).HallaNeural;
  halla?.releaseConsult?.();
}

function markReactConsultReady() {
  const stage = document.getElementById("consultNeuralMount");
  if (!stage) return;
  stage.dataset.react3d = "true";
  releaseVanillaConsultScene();
}

function clearReactConsultMark() {
  const stage = document.getElementById("consultNeuralMount");
  if (!stage) return;
  delete stage.dataset.react3d;
  stage.querySelector(".consult-neural-react-stage")?.remove();
  const halla = (window as Window & { HallaNeural?: { init?: () => void; refreshForPage?: (p: string) => void } })
    .HallaNeural;
  halla?.init?.();
  halla?.refreshForPage?.("consultancy");
}

export function ConsultNeuralBackdrop() {
  const active = useConsultancyActive();
  const mount = useConsultMount(active);
  const [reduced, setReduced] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const id = window.requestAnimationFrame(() => setReady(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (!active || !mount) return;

    const fallbackTimer = window.setTimeout(() => {
      const hasCanvas = mount.querySelector("canvas");
      if (!hasCanvas) clearReactConsultMark();
    }, 8000);

    return () => window.clearTimeout(fallbackTimer);
  }, [active, mount]);

  if (!active || !ready || !mount) return null;

  return createPortal(
    <div className="consult-neural-react-stage" aria-hidden>
      <NeuralErrorBoundary onError={clearReactConsultMark}>
        <Suspense fallback={null}>
          <ConsultNeuralCanvas reducedMotion={reduced} onReady={markReactConsultReady} />
        </Suspense>
      </NeuralErrorBoundary>
    </div>,
    mount,
  );
}
