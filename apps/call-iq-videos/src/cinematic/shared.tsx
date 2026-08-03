import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { brand } from "../brand";
import { fontFamily } from "../lib/fonts";
import { ScanLineOverlay, VignetteOverlay } from "../components/EnterpriseOverlay";
import { EnterpriseBackground } from "../three/EnterpriseBackground";
import { VolumetricRays } from "./effects";

export const CINEMATIC = {
  company: "CALL IQ LABS",
  website: "CALLIQLABS.COM",
  accent: brand.colors.cyan,
  dark: "#050508",
  red: "#EF4444",
} as const;

export const easeCinematic = Easing.bezier(0.16, 1, 0.3, 1);

export function cFade(frame: number, start = 0, dur = 12, from = 0, to = 1) {
  return interpolate(frame, [start, start + dur], [from, to], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeCinematic,
  });
}

export function cSlide(frame: number, start = 0, dur = 14, dist = 40) {
  return interpolate(frame, [start, start + dur], [dist, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeCinematic,
  });
}

export function cScale(frame: number, start = 0, dur = 16, from = 0.88, to = 1) {
  return interpolate(frame, [start, start + dur], [from, to], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeCinematic,
  });
}

type ShellProps = {
  children: React.ReactNode;
  variant?: "hero" | "feature" | "cta" | "minimal" | "dramatic";
  show3D?: boolean;
  letterbox?: boolean;
  rays?: boolean;
};

export const CinematicShell: React.FC<ShellProps> = ({
  children,
  variant = "hero",
  show3D = true,
  letterbox = true,
  rays = true,
}) => {
  const frame = useCurrentFrame();
  const bg =
    variant === "dramatic"
      ? `radial-gradient(ellipse at 50% 80%, ${CINEMATIC.red}14 0%, ${CINEMATIC.dark} 55%)`
      : CINEMATIC.dark;

  return (
    <AbsoluteFill style={{ background: bg }}>
      {show3D && (
        <EnterpriseBackground
          frame={frame}
          variant={variant === "dramatic" ? "minimal" : variant}
        />
      )}
      {rays && variant !== "dramatic" && <VolumetricRays />}
      <AbsoluteFill style={{ zIndex: 1 }}>{children as JSX.Element}</AbsoluteFill>
      {letterbox && (
        <>
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: 52,
              background: "linear-gradient(180deg, #000 0%, transparent 100%)",
              zIndex: 10,
              opacity: 0.9,
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: 52,
              background: "linear-gradient(0deg, #000 0%, transparent 100%)",
              zIndex: 10,
              opacity: 0.9,
            }}
          />
        </>
      )}
      <ScanLineOverlay frame={frame} />
      <VignetteOverlay />
    </AbsoluteFill>
  );
};

type TitleProps = {
  lines: string[];
  size?: number;
  align?: "left" | "center";
  delay?: number;
  accent?: boolean;
};

export const CinematicTitle: React.FC<TitleProps> = ({
  lines,
  size = 56,
  align = "center",
  delay = 0,
  accent = true,
}) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ textAlign: align }}>
      {lines.map((line, i) => (
        <div
          key={line}
          style={{
            fontFamily,
            fontSize: size - i * 8,
            fontWeight: 800,
            letterSpacing: i === 0 ? "-0.03em" : "0.14em",
            textTransform: i === 0 ? "none" : "uppercase",
            color: i === 0 ? brand.colors.white : accent ? brand.colors.cyan : brand.colors.muted,
            lineHeight: 1.08,
            marginTop: i > 0 ? 16 : 0,
            opacity: cFade(frame, delay + i * 5, 10),
            transform: `translateY(${cSlide(frame, delay + i * 5, 12, 32)}px)`,
            textShadow:
              i === 0
                ? "0 4px 40px rgba(0,0,0,0.5)"
                : accent
                  ? `0 0 80px ${brand.colors.cyan}44`
                  : undefined,
          }}
        >
          {line}
        </div>
      ))}
    </div>
  );
};

export const VoiceoverBar: React.FC<{ text: string; delay?: number }> = ({ text, delay = 0 }) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        position: "absolute",
        bottom: 72,
        left: 96,
        right: 96,
        zIndex: 20,
        opacity: cFade(frame, delay, 16),
        transform: `translateY(${cSlide(frame, delay, 20, 16)}px)`,
      }}
    >
      <div
        style={{
          fontFamily,
          fontSize: 17,
          fontWeight: 500,
          color: "rgba(255,255,255,0.92)",
          lineHeight: 1.55,
          padding: "16px 24px",
          borderLeft: `3px solid ${brand.colors.cyan}`,
          background: "rgba(6,8,14,0.82)",
          backdropFilter: "blur(20px)",
          borderRadius: "0 12px 12px 0",
          maxWidth: 880,
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        }}
      >
        {text}
      </div>
    </div>
  );
};

export const GlassCard: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
  delay?: number;
  glow?: boolean;
}> = ({ children, style, delay = 0, glow = true }) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        background: "rgba(8,10,16,0.78)",
        backdropFilter: "blur(28px)",
        border: `1px solid ${brand.colors.cyan}33`,
        borderRadius: 18,
        boxShadow: glow
          ? `0 24px 80px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.07), 0 0 40px ${brand.colors.cyan}08`
          : "0 24px 80px rgba(0,0,0,0.5)",
        opacity: cFade(frame, delay, 10),
        transform: `translateY(${cSlide(frame, delay, 12, 24)}px) scale(${cScale(frame, delay, 14)})`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};
