import { brand } from "../brand";
import { fontFamily } from "../lib/fonts";
import { fade, slideUp } from "../lib/motion";

type EnterpriseLabelProps = {
  children: string;
  frame: number;
  delay?: number;
};

export const EnterpriseLabel: React.FC<EnterpriseLabelProps> = ({
  children,
  frame,
  delay = 0,
}) => (
  <div
    style={{
      fontFamily,
      fontSize: 13,
      fontWeight: 700,
      letterSpacing: "0.28em",
      textTransform: "uppercase",
      color: brand.colors.cyan,
      marginBottom: 20,
      opacity: fade(frame, delay, 16),
    }}
  >
    {children}
  </div>
);

type EnterpriseHeadlineProps = {
  children: React.ReactNode;
  frame: number;
  size?: number;
  delay?: number;
  align?: "left" | "center";
  maxWidth?: number;
};

export const EnterpriseHeadline: React.FC<EnterpriseHeadlineProps> = ({
  children,
  frame,
  size = 64,
  delay = 0,
  align = "left",
  maxWidth = 900,
}) => (
  <div
    style={{
      fontFamily,
      fontSize: size,
      fontWeight: 800,
      color: brand.colors.white,
      textAlign: align,
      lineHeight: 1.06,
      maxWidth,
      letterSpacing: "-0.02em",
      opacity: fade(frame, delay, 22),
      transform: `translateY(${slideUp(frame, delay, 26)}px)`,
      textShadow: `0 0 80px ${brand.colors.cyan}33`,
    }}
  >
    {children}
  </div>
);

type EnterpriseSubtextProps = {
  children: string;
  frame: number;
  delay?: number;
  align?: "left" | "center";
  maxWidth?: number;
};

export const EnterpriseSubtext: React.FC<EnterpriseSubtextProps> = ({
  children,
  frame,
  delay = 12,
  align = "left",
  maxWidth = 640,
}) => (
  <div
    style={{
      fontFamily,
      fontSize: 24,
      fontWeight: 400,
      color: brand.colors.muted,
      textAlign: align,
      lineHeight: 1.55,
      maxWidth,
      marginTop: 24,
      opacity: fade(frame, delay, 20),
      transform: `translateY(${slideUp(frame, delay, 24, 24)}px)`,
    }}
  >
    {children}
  </div>
);

export const GlassPanel: React.FC<{
  children: React.ReactNode;
  frame: number;
  delay?: number;
  style?: React.CSSProperties;
}> = ({ children, frame, delay = 0, style }) => (
  <div
    style={{
      background: "rgba(10, 10, 16, 0.72)",
      backdropFilter: "blur(24px)",
      border: `1px solid ${brand.colors.cyan}33`,
      borderRadius: 20,
      padding: "36px 40px",
      boxShadow: `0 24px 80px rgba(0,0,0,0.5), inset 0 1px 0 ${brand.colors.white}11`,
      opacity: fade(frame, delay, 20),
      transform: `translateY(${slideUp(frame, delay, 24, 30)}px)`,
      ...style,
    }}
  >
    {children}
  </div>
);

export const VignetteOverlay: React.FC = () => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      pointerEvents: "none",
      background:
        "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.55) 100%)",
    }}
  />
);

export const ScanLineOverlay: React.FC<{ frame: number }> = ({ frame }) => {
  const y = (frame * 3) % 1080;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: y,
          height: 2,
          background: `linear-gradient(90deg, transparent, ${brand.colors.cyan}44, transparent)`,
          opacity: 0.35,
        }}
      />
    </div>
  );
};
