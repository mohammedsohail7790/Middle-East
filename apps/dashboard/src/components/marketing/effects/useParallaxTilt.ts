"use client";

import { useEffect, useRef, useState } from "react";

/** Subtle mouse-tilt for CSS 3D scenes — disabled when reduced motion is preferred. */
export function useParallaxTilt(strength = 10) {
  const ref = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState<string>("");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const onMove = (event: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      setTransform(
        `rotateY(${x * strength}deg) rotateX(${-y * strength}deg) translateZ(8px)`,
      );
    };

    const onLeave = () => setTransform("");

    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    return () => {
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
    };
  }, [strength]);

  return { ref, transform };
}
