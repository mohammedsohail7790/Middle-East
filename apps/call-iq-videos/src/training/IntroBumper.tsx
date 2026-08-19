import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { brand } from "../brand";
import { HallaAiLogo } from "../components/HallaAiLogo";
import { SceneBackground } from "../components/SceneBackground";

export const IntroBumper: React.FC = () => {
  const frame = useCurrentFrame();
  const lineWidth = interpolate(frame, [20, 50], [0, 320], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(frame, [90, 119], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ opacity: fadeOut }}>
      <SceneBackground variant="cyan-glow" />
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          gap: 32,
        }}
      >
        <HallaAiLogo size="lg" />
        <div
          style={{
            width: lineWidth,
            height: 2,
            background: `linear-gradient(90deg, transparent, ${brand.colors.cyan}, transparent)`,
          }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
