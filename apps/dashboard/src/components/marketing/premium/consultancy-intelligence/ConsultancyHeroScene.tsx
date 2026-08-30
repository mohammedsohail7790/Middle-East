"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const ConsultNeuralCanvas = dynamic(
  () => import("../ConsultNeuralCanvas").then((m) => ({ default: m.ConsultNeuralCanvas })),
  { ssr: false },
);

/**
 * Drops the existing AIIntelligenceScene (instanced particle network, real
 * three.js/@react-three/fiber, purple/red palette matching this page's own
 * [data-brand="consultancy"] tokens) behind the hero as a background layer.
 * Renders nothing for prefers-reduced-motion — the hero reads fine as flat
 * text on the dark background with no scene at all.
 */
export function ConsultancyHeroScene() {
  const [reduced, setReduced] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  if (!mounted || reduced) return null;

  return (
    <div className="absolute inset-0 opacity-90">
      <ConsultNeuralCanvas reducedMotion={reduced} />
      {/* Left-to-transparent scrim keeps the hero copy (left-aligned) legible
          regardless of what the scene is doing behind it. */}
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(90deg, var(--background) 0%, rgba(10,7,8,0.55) 45%, transparent 78%)" }}
      />
    </div>
  );
}
