import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { brand } from "../brand";

type SceneBackgroundProps = {
  variant?: "default" | "gradient" | "cyan-glow";
  animate?: boolean;
};

export const SceneBackground: React.FC<SceneBackgroundProps> = ({
  variant = "default",
  animate = true,
}) => {
  const frame = useCurrentFrame();
  const glowOpacity = animate
    ? interpolate(frame, [0, 30], [0, 0.15], {
        extrapolateRight: "clamp",
      })
    : 0.1;

  const background =
    variant === "gradient"
      ? `radial-gradient(ellipse at 50% 0%, ${brand.colors.cyan}22 0%, ${brand.colors.dark} 55%)`
      : brand.colors.dark;

  return (
    <AbsoluteFill style={{ background }}>
      <div
        style={{
          position: "absolute",
          top: -200,
          left: "50%",
          transform: "translateX(-50%)",
          width: 600,
          height: 600,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${brand.colors.cyan} 0%, transparent 70%)`,
          opacity: variant === "cyan-glow" ? glowOpacity * 2 : glowOpacity,
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 4,
          background: `linear-gradient(90deg, transparent, ${brand.colors.cyan}, transparent)`,
          opacity: 0.4,
        }}
      />
    </AbsoluteFill>
  );
};
