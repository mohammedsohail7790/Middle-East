import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { brand } from "../brand";
import { CallIqLogo } from "../components/CallIqLogo";
import { fontFamily } from "../lib/fonts";
import { SceneBackground } from "../components/SceneBackground";

export const OutroBumper: React.FC = () => {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: "clamp",
  });
  const ctaOpacity = interpolate(frame, [30, 50], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ opacity: fadeIn }}>
      <SceneBackground variant="gradient" />
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          gap: 28,
        }}
      >
        <CallIqLogo size="md" showTagline />
        <div
          style={{
            fontFamily,
            fontSize: 28,
            fontWeight: 700,
            color: brand.colors.white,
            opacity: ctaOpacity,
          }}
        >
          Start your free trial
        </div>
        <div
          style={{
            fontFamily,
            fontSize: 20,
            color: brand.colors.cyan,
            opacity: ctaOpacity,
          }}
        >
          {brand.website}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
