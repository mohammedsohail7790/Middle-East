"use client";

import { Canvas } from "@react-three/fiber";
import { useEffect, useState } from "react";
import { AIIntelligenceScene } from "./consultancy-intelligence/AIIntelligenceScene";

export function ConsultNeuralCanvas() {
  const [mobile, setMobile] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setMobile(
      window.innerWidth < 768 || window.matchMedia("(pointer: coarse)").matches,
    );
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);

    const hero = document.querySelector(".consult-hero");
    if (!hero) return;

    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.08, rootMargin: "80px" },
    );
    observer.observe(hero);
    return () => observer.disconnect();
  }, []);

  return (
    <Canvas
      camera={{ position: [2.2, 0.12, 6.8], fov: mobile ? 42 : 36, near: 0.1, far: 100 }}
      gl={{ alpha: true, antialias: !mobile, powerPreference: "high-performance" }}
      dpr={mobile ? [1, 1.2] : [1, 1.5]}
      frameloop={visible && !reduced ? "always" : "demand"}
      style={{ width: "100%", height: "100%", display: "block" }}
    >
      <AIIntelligenceScene mobile={mobile} reduced={reduced} visible={visible} />
    </Canvas>
  );
}
