"use client";

import { useEffect, useState } from "react";

/**
 * Real NASA photograph (ISS044-E-45215, public domain) of the Milky Way's
 * galactic core, cropped to the star/galaxy band via background-position —
 * not a procedural particle simulation. A slow Ken Burns zoom gives it
 * deliberate, restrained motion; a scrim keeps the left-aligned hero copy
 * legible; a sparse CSS-only twinkle layer adds a little life without any
 * canvas/WebGL. Renders as a static frame (no zoom, no twinkle) for
 * prefers-reduced-motion.
 */
export function ConsultancyHeroScene() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div
        className={reduced ? "absolute inset-0" : "absolute inset-0 animate-hero-kenburns"}
        style={{
          backgroundImage: "url(/milkyway-panorama.jpg)",
          backgroundSize: "cover",
          backgroundPosition: "center 32%",
          backgroundRepeat: "no-repeat",
          opacity: 0.85,
        }}
      />
      {!reduced && (
        <div className="absolute inset-0">
          {STAR_POSITIONS.map((star, i) => (
            <span
              key={i}
              className="absolute block rounded-full bg-white animate-hero-twinkle"
              style={{
                left: `${star.x}%`,
                top: `${star.y}%`,
                width: star.size,
                height: star.size,
                animationDelay: `${star.delay}s`,
                animationDuration: `${star.duration}s`,
              }}
            />
          ))}
        </div>
      )}
      {/* Left-to-transparent scrim keeps the left-aligned hero copy legible. */}
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(100deg, var(--background) 0%, rgba(10,7,8,0.7) 40%, rgba(10,7,8,0.25) 68%, transparent 100%)" }}
      />
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(10,7,8,0.3) 0%, transparent 25%, transparent 70%, rgba(10,7,8,0.55) 100%)" }} />
    </div>
  );
}

// Fixed, hand-placed positions (not random-on-every-render) so the layout
// doesn't shift between server and client render.
const STAR_POSITIONS = [
  { x: 12, y: 18, size: 2, delay: 0, duration: 3.2 },
  { x: 22, y: 42, size: 1.5, delay: 0.6, duration: 2.6 },
  { x: 35, y: 12, size: 2, delay: 1.2, duration: 3.8 },
  { x: 48, y: 28, size: 1.5, delay: 0.2, duration: 2.9 },
  { x: 58, y: 8, size: 2, delay: 1.8, duration: 3.4 },
  { x: 68, y: 38, size: 1.5, delay: 0.9, duration: 2.4 },
  { x: 78, y: 15, size: 2, delay: 0.4, duration: 3.6 },
  { x: 88, y: 32, size: 1.5, delay: 1.5, duration: 2.8 },
  { x: 15, y: 65, size: 1.5, delay: 0.7, duration: 3.1 },
  { x: 30, y: 72, size: 2, delay: 1.1, duration: 2.7 },
  { x: 52, y: 60, size: 1.5, delay: 0.3, duration: 3.3 },
  { x: 72, y: 68, size: 2, delay: 1.6, duration: 2.5 },
  { x: 90, y: 55, size: 1.5, delay: 0.8, duration: 3.7 },
  { x: 5, y: 45, size: 1.5, delay: 1.3, duration: 2.9 },
  { x: 42, y: 82, size: 1.5, delay: 0.5, duration: 3.0 },
];
