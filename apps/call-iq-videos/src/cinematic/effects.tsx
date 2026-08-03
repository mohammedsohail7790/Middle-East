import { interpolate, useCurrentFrame } from "remotion";
import { brand } from "../brand";
import { fontFamily } from "../lib/fonts";
import { CINEMATIC, cFade, easeCinematic } from "./shared";

/* ── Cinematic camera drift / dolly ── */
export const CinematicCamera: React.FC<{
  children: React.ReactNode;
  intensity?: number;
  delay?: number;
}> = ({ children, intensity = 1, delay = 0 }) => {
  const frame = useCurrentFrame();
  const t = Math.max(0, frame - delay);
  const scale = interpolate(t, [0, 300], [1.06, 1], {
    extrapolateRight: "clamp",
    easing: easeCinematic,
  });
  const panX = Math.sin(t * 0.006) * 12 * intensity;
  const panY = Math.cos(t * 0.004) * 8 * intensity;
  const rot = Math.sin(t * 0.003) * 0.4 * intensity;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        transform: `scale(${scale}) translate(${panX}px, ${panY}px) rotate(${rot}deg)`,
        transformOrigin: "center center",
      }}
    >
      {children}
    </div>
  );
};

/* ── Volumetric light rays ── */
export const VolumetricRays: React.FC<{ color?: string; opacity?: number }> = ({
  color = brand.colors.cyan,
  opacity = 0.12,
}) => {
  const frame = useCurrentFrame();
  const rot = frame * 0.15;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          top: "-40%",
          left: "30%",
          width: "40%",
          height: "180%",
          background: `conic-gradient(from ${rot}deg, transparent, ${color}${Math.round(opacity * 255).toString(16).padStart(2, "0")}, transparent, ${color}18, transparent)`,
          filter: "blur(60px)",
          transform: `rotate(${rot * 0.5}deg)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "-20%",
          right: "10%",
          width: "50%",
          height: "80%",
          background: `radial-gradient(ellipse, ${color}14 0%, transparent 70%)`,
          filter: "blur(40px)",
        }}
      />
    </div>
  );
};

/* ── Energy particle burst (intro transition) ── */
export const EnergyBurst: React.FC<{ active?: boolean }> = ({ active = true }) => {
  const frame = useCurrentFrame();
  if (!active) return null;

  const particles = Array.from({ length: 48 }, (_, i) => {
    const angle = (i / 48) * Math.PI * 2;
    const dist = interpolate(frame, [0, 50], [0, 400 + (i % 5) * 80], {
      extrapolateRight: "clamp",
      easing: easeCinematic,
    });
    const opacity = cFade(frame, 0, 50, 1, 0);
    return {
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
      size: 2 + (i % 4),
      opacity,
    };
  });

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
        zIndex: 5,
      }}
    >
      {particles.map((p, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            width: p.size,
            height: p.size,
            borderRadius: "50%",
            background: brand.colors.cyan,
            boxShadow: `0 0 12px ${brand.colors.cyan}`,
            transform: `translate(${p.x}px, ${p.y}px)`,
            opacity: p.opacity,
          }}
        />
      ))}
      <div
        style={{
          position: "absolute",
          width: interpolate(frame, [0, 40], [0, 600], { extrapolateRight: "clamp" }),
          height: interpolate(frame, [0, 40], [0, 600], { extrapolateRight: "clamp" }),
          borderRadius: "50%",
          border: `2px solid ${brand.colors.cyan}`,
          opacity: cFade(frame, 5, 35, 0.8, 0),
          boxShadow: `0 0 80px ${brand.colors.cyan}66, inset 0 0 60px ${brand.colors.cyan}22`,
        }}
      />
    </div>
  );
};

/* ── Logo energy ring ── */
export const LogoEnergyRing: React.FC<{ size?: number }> = ({ size = 500 }) => {
  const frame = useCurrentFrame();
  const rot = frame * 1.2;
  const pulse = 1 + Math.sin(frame * 0.08) * 0.04;
  const opacity = cFade(frame, 10, 30);

  return (
    <div
      style={{
        position: "absolute",
        width: size,
        height: size,
        borderRadius: "50%",
        border: `1px solid ${brand.colors.cyan}55`,
        boxShadow: `0 0 60px ${brand.colors.cyan}33, inset 0 0 40px ${brand.colors.cyan}11`,
        transform: `rotate(${rot}deg) scale(${pulse})`,
        opacity,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 20,
          borderRadius: "50%",
          border: `1px dashed ${brand.colors.cyan}33`,
          transform: `rotate(${-rot * 1.5}deg)`,
        }}
      />
    </div>
  );
};

/* ── Phone ring pulse ── */
export const PhoneRingPulse: React.FC<{ count?: number; delay?: number }> = ({
  count = 3,
  delay = 0,
}) => {
  const frame = useCurrentFrame();

  return (
    <div style={{ display: "flex", gap: 32, alignItems: "center" }}>
      {Array.from({ length: count }).map((_, i) => {
        const local = Math.max(0, frame - delay - i * 8);
        const ring = Math.sin(local * 0.25) * 6;
        const glow = 0.5 + Math.sin(local * 0.2 + i) * 0.5;
        return (
          <div key={i} style={{ position: "relative", transform: `translateY(${ring}px)` }}>
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: 16,
                background: "rgba(239,68,68,0.12)",
                border: `1px solid ${CINEMATIC.red}66`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: `0 0 ${24 * glow}px ${CINEMATIC.red}44`,
              }}
            >
              <PhoneIcon color={CINEMATIC.red} size={32} />
            </div>
            {[0, 1, 2].map((r) => (
              <div
                key={r}
                style={{
                  position: "absolute",
                  inset: -8 - r * 12,
                  borderRadius: 20 + r * 4,
                  border: `1px solid ${CINEMATIC.red}`,
                  opacity: ((local + r * 10) % 40) / 40 * 0.5,
                }}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
};

/* ── Minimal phone SVG icon ── */
export const PhoneIcon: React.FC<{ color?: string; size?: number }> = ({
  color = brand.colors.cyan,
  size = 24,
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path
      d="M6.5 2h3l1.5 5.5-2 1.5c1.2 2.4 3.1 4.3 5.5 5.5l1.5-2L22 13.5V17c0 .8-.7 1.5-1.5 1.5C10.5 18.5 5.5 13.5 5 6.5 5 5.7 5.7 5 6.5 5V2z"
      fill={color}
      opacity={0.9}
    />
  </svg>
);

/* ── Business owner silhouette scene ── */
export const BusinessSilhouette: React.FC = () => {
  const frame = useCurrentFrame();
  const stress = Math.sin(frame * 0.1) * 2;

  return (
    <div
      style={{
        position: "absolute",
        left: 80,
        bottom: 120,
        opacity: cFade(frame, 15, 25, 0, 0.35),
      }}
    >
      <div
        style={{
          width: 280,
          height: 360,
          background: `linear-gradient(180deg, transparent 0%, ${brand.colors.cyan}08 100%)`,
          borderRadius: "0 0 140px 140px",
          position: "relative",
          transform: `translateY(${stress}px)`,
        }}
      >
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: "50%",
            transform: "translateX(-50%)",
            width: 120,
            height: 200,
            background: "linear-gradient(180deg, #1a1a22 0%, #0d0d12 100%)",
            borderRadius: "60px 60px 0 0",
            boxShadow: `0 -20px 60px ${CINEMATIC.red}22`,
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: 180,
            left: "50%",
            transform: "translateX(-50%)",
            width: 60,
            height: 60,
            borderRadius: "50%",
            background: "#1a1a22",
          }}
        />
      </div>
    </div>
  );
};

/* ── Animated counter ── */
export const AnimatedCounter: React.FC<{
  from: number;
  to: number;
  start?: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  color?: string;
  size?: number;
}> = ({
  from,
  to,
  start = 0,
  duration = 60,
  prefix = "",
  suffix = "",
  color = brand.colors.cyan,
  size = 48,
}) => {
  const frame = useCurrentFrame();
  const val = Math.round(
    interpolate(frame, [start, start + duration], [from, to], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: easeCinematic,
    }),
  );

  return (
    <span style={{ fontFamily, fontSize: size, fontWeight: 900, color, fontVariantNumeric: "tabular-nums" }}>
      {prefix}
      {val.toLocaleString()}
      {suffix}
    </span>
  );
};

/* ── Holographic shimmer border ── */
export const HolographicBorder: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ children, style }) => {
  const frame = useCurrentFrame();
  const shimmer = (frame * 2) % 360;

  return (
    <div
      style={{
        position: "relative",
        borderRadius: 16,
        padding: 1,
        background: `linear-gradient(${shimmer}deg, ${brand.colors.cyan}66, transparent, ${brand.colors.cyan}44, transparent)`,
        ...style,
      }}
    >
      <div
        style={{
          borderRadius: 15,
          background: "rgba(6,8,14,0.88)",
          backdropFilter: "blur(28px)",
          height: "100%",
        }}
      >
        {children}
      </div>
    </div>
  );
};

/* ── Speech recognition visualization ── */
export const SpeechRecognitionViz: React.FC<{ active?: boolean; delay?: number }> = ({
  active = true,
  delay = 0,
}) => {
  const frame = useCurrentFrame();
  const local = Math.max(0, frame - delay);
  const words = ["Schedule", "service", "appointment", "HVAC"];

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
      {words.map((word, i) => (
        <div
          key={word}
          style={{
            fontFamily,
            fontSize: 12,
            fontWeight: 600,
            padding: "6px 12px",
            borderRadius: 6,
            background: active && local > i * 12 ? `${brand.colors.cyan}22` : brand.colors.gray,
            border: `1px solid ${active && local > i * 12 ? brand.colors.cyan : brand.colors.grayLight}`,
            color: active && local > i * 12 ? brand.colors.cyan : brand.colors.muted,
            opacity: cFade(frame, delay + i * 12, 10),
            transform: `scale(${active && local > i * 12 ? 1 : 0.95})`,
          }}
        >
          {word}
        </div>
      ))}
    </div>
  );
};

/* ── AI thinking nodes ── */
export const AIThinkingGraph: React.FC<{ delay?: number }> = ({ delay = 0 }) => {
  const frame = useCurrentFrame();
  const nodes = [
    { x: 0, y: 0, label: "Intent" },
    { x: 80, y: -30, label: "Qualify" },
    { x: 160, y: 0, label: "Respond" },
  ];

  return (
    <svg width={200} height={60} style={{ marginTop: 12, opacity: cFade(frame, delay, 16) }}>
      {nodes.slice(0, -1).map((n, i) => {
        const next = nodes[i + 1];
        const lit = frame > delay + i * 20;
        return (
          <line
            key={i}
            x1={n.x + 30}
            y1={n.y + 20}
            x2={next.x + 10}
            y2={next.y + 20}
            stroke={lit ? brand.colors.cyan : brand.colors.grayLight}
            strokeWidth={2}
            opacity={lit ? 0.8 : 0.3}
          />
        );
      })}
      {nodes.map((n, i) => {
        const lit = frame > delay + i * 20;
        return (
          <g key={n.label}>
            <circle
              cx={n.x + 20}
              cy={n.y + 20}
              r={12}
              fill={lit ? brand.colors.cyan : brand.colors.gray}
              opacity={lit ? 0.9 : 0.5}
            />
            <text
              x={n.x + 20}
              y={n.y + 48}
              textAnchor="middle"
              fill={brand.colors.muted}
              fontSize={9}
              fontFamily={fontFamily}
            >
              {n.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

/* ── Industry SVG icons ── */
const iconPaths: Record<string, string> = {
  HVAC: "M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83",
  Plumbing: "M6 3v6M18 3v6M6 9h12v3a6 6 0 01-12 0V9z",
  Electrician: "M13 2L4 14h7l-1 8 9-12h-7l1-8z",
  Dental: "M12 4c-3 0-5 2-5 5 0 4 3 7 5 11 2-4 5-7 5-11 0-3-2-5-5-5z",
  MedicalSpa: "M12 2a7 7 0 00-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 00-7-7z",
  Roofing: "M3 12l9-9 9 9M5 10v10h14V10",
  Law: "M12 3l-8 5v2h16V8l-8-5zM6 12v8h12v-8",
  HomeServices: "M3 10l9-7 9 7v11H3V10z",
};

export const IndustryIcon: React.FC<{ industry: string; size?: number; color?: string }> = ({
  industry,
  size = 48,
  color = brand.colors.cyan,
}) => {
  const path = iconPaths[industry] ?? iconPaths.HomeServices;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5}>
      <path d={path} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

/* ── Metric growth bar ── */
export const GrowthBar: React.FC<{
  label: string;
  from: number;
  to: number;
  delay?: number;
  suffix?: string;
}> = ({ label, from, to, delay = 0, suffix = "" }) => {
  const frame = useCurrentFrame();
  const val = Math.round(
    interpolate(frame, [delay + 10, delay + 70], [from, to], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: easeCinematic,
    }),
  );
  const pct = interpolate(val, [from, to], [20, 100], { extrapolateRight: "clamp" });

  return (
    <div style={{ marginBottom: 20, opacity: cFade(frame, delay, 14) }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontFamily, fontSize: 13, color: brand.colors.muted, fontWeight: 600 }}>{label}</span>
        <span style={{ fontFamily, fontSize: 15, color: brand.colors.cyan, fontWeight: 800 }}>
          {val.toLocaleString()}{suffix}
        </span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: brand.colors.gray, overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            borderRadius: 3,
            background: `linear-gradient(90deg, ${brand.colors.cyan}, #38bdf8)`,
            boxShadow: `0 0 16px ${brand.colors.cyan}66`,
          }}
        />
      </div>
    </div>
  );
};
