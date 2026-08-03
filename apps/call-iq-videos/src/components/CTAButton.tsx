import { interpolate, useCurrentFrame } from "remotion";
import { brand } from "../brand";
import { fontFamily } from "../lib/fonts";

type CTAButtonProps = {
  label: string;
  pulse?: boolean;
};

export const CTAButton: React.FC<CTAButtonProps> = ({ label, pulse = true }) => {
  const frame = useCurrentFrame();
  const scale = pulse
    ? 1 + Math.sin(frame / 8) * 0.03
    : 1;
  const opacity = interpolate(frame, [0, 12], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        fontFamily,
        fontSize: 20,
        fontWeight: 700,
        color: brand.colors.dark,
        background: brand.colors.cyan,
        padding: "16px 40px",
        borderRadius: 50,
        opacity,
        transform: `scale(${scale})`,
        boxShadow: `0 8px 32px ${brand.colors.cyan}55`,
      }}
    >
      {label}
    </div>
  );
};
