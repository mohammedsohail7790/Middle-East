import { interpolate, useCurrentFrame } from "remotion";
import { brand } from "../brand";
import { fontFamily } from "../lib/fonts";
import { cFade, easeCinematic } from "./shared";
import { HolographicBorder } from "./effects";
import { t } from "./timing";

const panels = [
  { title: "Call Analytics", metric: "1,247", sub: "+18% this week", x: -20, y: 0, delay: t(8) },
  { title: "Lead Pipeline", metric: "342", sub: "94% qualified", x: 280, y: -30, delay: t(14) },
  { title: "Conversion", metric: "49%", sub: "Above benchmark", x: 560, y: 10, delay: t(20) },
  { title: "Appointments", metric: "284", sub: "Booked this month", x: 140, y: 180, delay: t(26) },
  { title: "AI Summaries", metric: "1,198", sub: "Auto-generated", x: 420, y: 200, delay: t(32) },
  { title: "Customer Insights", metric: "4.9★", sub: "Satisfaction score", x: 700, y: 160, delay: t(38) },
];

export const HolographicDashboard: React.FC = () => {
  const frame = useCurrentFrame();
  const globalFloat = Math.sin(frame * 0.03) * 4;

  return (
    <div style={{ position: "relative", width: "100%", height: 420 }}>
      {/* Central holographic base */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "55%",
          transform: `translate(-50%, -50%) perspective(800px) rotateX(${12 + Math.sin(frame * 0.02) * 2}deg)`,
          width: "85%",
          height: 320,
          borderRadius: 20,
          background: "rgba(6,10,18,0.75)",
          border: `1px solid ${brand.colors.cyan}33`,
          boxShadow: `0 40px 120px rgba(0,0,0,0.6), 0 0 80px ${brand.colors.cyan}11`,
          opacity: cFade(frame, t(2), 10),
          overflow: "hidden",
        }}
      >
        {/* Grid lines */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `
              linear-gradient(${brand.colors.cyan}08 1px, transparent 1px),
              linear-gradient(90deg, ${brand.colors.cyan}08 1px, transparent 1px)
            `,
            backgroundSize: "40px 40px",
            transform: `translateY(${(frame * 0.5) % 40}px)`,
          }}
        />

        {/* Chart area */}
        <div style={{ padding: "32px 40px" }}>
          <div style={{ fontFamily, fontSize: 14, color: brand.colors.muted, marginBottom: 20 }}>
            Performance Overview — Last 30 Days
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 140 }}>
            {[35, 48, 42, 58, 52, 72, 68, 85, 78, 92, 88, 95].map((h, i) => {
              const barH = interpolate(
                frame,
                [t(8) + i * 2, t(18) + i * 2],
                [0, h],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeCinematic },
              );
              return (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: `${barH}%`,
                    borderRadius: "4px 4px 0 0",
                    background: `linear-gradient(180deg, ${brand.colors.cyan}, ${brand.colors.cyan}44)`,
                    boxShadow: `0 0 12px ${brand.colors.cyan}33`,
                    opacity: 0.85,
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* Floating panels */}
      {panels.map((p) => {
        const floatY = Math.sin(frame * 0.04 + p.x) * 6 + globalFloat;
        const opacity = cFade(frame, p.delay, 10);
        const scale = interpolate(frame, [p.delay, p.delay + t(10)], [0.9, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: easeCinematic,
        });

        return (
          <div
            key={p.title}
            style={{
              position: "absolute",
              left: p.x,
              top: p.y,
              width: 200,
              transform: `translateY(${floatY}px) scale(${scale})`,
              opacity,
              zIndex: 2,
            }}
          >
            <HolographicBorder>
              <div style={{ padding: "16px 18px" }}>
                <div style={{ fontFamily, fontSize: 11, color: brand.colors.muted, letterSpacing: "0.1em", marginBottom: 6 }}>
                  {p.title.toUpperCase()}
                </div>
                <div style={{ fontFamily, fontSize: 28, fontWeight: 800, color: brand.colors.cyan }}>
                  {p.metric}
                </div>
                <div style={{ fontFamily, fontSize: 11, color: brand.colors.muted, marginTop: 4 }}>{p.sub}</div>
              </div>
            </HolographicBorder>
          </div>
        );
      })}
    </div>
  );
};
