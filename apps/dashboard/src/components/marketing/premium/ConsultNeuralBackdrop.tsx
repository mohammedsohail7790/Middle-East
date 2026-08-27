"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const ConsultNeuralCanvas = dynamic(
  () => import("./ConsultNeuralCanvas").then((m) => ({ default: m.ConsultNeuralCanvas })),
  { ssr: false },
);

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

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  if (!active || reduced) return null;

  return (
    <div
      id="consultPageNeuralMount"
      className="consult-neural-react-backdrop consult-page-neural-canvas"
      aria-hidden
    >
      <ConsultNeuralCanvas />
    </div>
  );
}
