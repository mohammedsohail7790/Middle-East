import { interpolate, useCurrentFrame } from "remotion";
import { brand } from "../../brand";
import { HallaAiLogo } from "../../components/HallaAiLogo";
import { fontFamily } from "../../lib/fonts";

export const WelcomeScreen: React.FC = () => {
  const frame = useCurrentFrame();
  const subtitleOpacity = interpolate(frame, [20, 40], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        gap: 32,
        fontFamily,
      }}
    >
      <HallaAiLogo size="lg" />
      <div
        style={{
          fontSize: 32,
          fontWeight: 700,
          color: brand.colors.white,
          textAlign: "center",
          opacity: subtitleOpacity,
        }}
      >
        AI Voice Receptionist for Service Businesses
      </div>
      <div
        style={{
          fontSize: 18,
          color: brand.colors.muted,
          opacity: subtitleOpacity,
        }}
      >
        {brand.tagline}
      </div>
    </div>
  );
};
