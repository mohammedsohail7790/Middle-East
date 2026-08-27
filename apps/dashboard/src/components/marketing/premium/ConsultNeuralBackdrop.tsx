"use client";

import dynamic from "next/dynamic";
import { Component, type ErrorInfo, type ReactNode, useEffect, useState } from "react";

const ConsultNeuralCanvas = dynamic(
  () => import("./ConsultNeuralCanvas").then((m) => ({ default: m.ConsultNeuralCanvas })),
  { ssr: false },
);

class NeuralErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn("[consult-neural]", error, info.componentStack);
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
      observer.observe(root, { subtree: true, attributes: true, attributeFilter: ["class"] });
    }
    observer.observe(document.body, { attributes: true, attributeFilter: ["data-section"] });
    return () => observer.disconnect();
  }, []);

  return active;
}

export function ConsultNeuralBackdrop() {
  const active = useConsultancyActive();
  const [reduced, setReduced] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const id = window.requestAnimationFrame(() => setReady(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  if (!active || reduced || !ready) return null;

  return (
    <NeuralErrorBoundary>
      <div
        id="consultPageNeuralMount"
        className="consult-neural-react-backdrop consult-page-neural-canvas"
        aria-hidden
      >
        <ConsultNeuralCanvas />
      </div>
    </NeuralErrorBoundary>
  );
}
