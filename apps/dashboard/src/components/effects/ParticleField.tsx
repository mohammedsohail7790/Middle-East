"use client";

import { useEffect, useRef } from "react";

export function ParticleField({ density = 70, className = "" }: { density?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      canvas.width = r.width * dpr;
      canvas.height = r.height * dpr;
    };
    resize();
    window.addEventListener("resize", resize);

    type P = { x: number; y: number; vx: number; vy: number };
    const pts: P[] = Array.from({ length: density }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.4 * dpr,
      vy: (Math.random() - 0.5) * 0.4 * dpr,
    }));

    const loop = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of pts) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
      }
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i].x - pts[j].x;
          const dy = pts[i].y - pts[j].y;
          const d = Math.hypot(dx, dy);
          if (d < 140 * dpr) {
            ctx.strokeStyle = `rgba(140,111,62,${(1 - d / (140 * dpr)) * 0.25})`;
            ctx.lineWidth = dpr;
            ctx.beginPath();
            ctx.moveTo(pts[i].x, pts[i].y);
            ctx.lineTo(pts[j].x, pts[j].y);
            ctx.stroke();
          }
        }
      }
      for (const p of pts) {
        ctx.fillStyle = "rgba(140,111,62,0.55)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.6 * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [density]);

  return <canvas ref={ref} className={`absolute inset-0 w-full h-full ${className}`} aria-hidden />;
}

export function AnimatedMesh({ className = "" }: { className?: string }) {
  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`} aria-hidden>
      <div
        className="absolute -top-40 -left-40 w-[60rem] h-[60rem] rounded-full opacity-30 blur-3xl animate-pulse-slow"
        style={{ background: "radial-gradient(circle, rgba(140,111,62,0.5), transparent 60%)" }}
      />
      <div
        className="absolute -bottom-40 -right-40 w-[60rem] h-[60rem] rounded-full opacity-25 blur-3xl animate-pulse-slow"
        style={{ background: "radial-gradient(circle, rgba(199,162,90,0.4), transparent 60%)" }}
      />
    </div>
  );
}
