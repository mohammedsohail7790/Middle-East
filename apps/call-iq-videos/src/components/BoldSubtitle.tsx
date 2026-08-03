import { interpolate, useCurrentFrame } from "remotion";
import { brand } from "../brand";
import { fontFamily } from "../lib/fonts";

type BoldSubtitleProps = {
  text: string;
  size?: number;
  position?: "top" | "center" | "bottom";
  highlight?: boolean;
};

export const BoldSubtitle: React.FC<BoldSubtitleProps> = ({
  text,
  size = 42,
  position = "bottom",
  highlight = true,
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 6], [0, 1], {
    extrapolateRight: "clamp",
  });
  const scale = interpolate(frame, [0, 8], [0.9, 1], {
    extrapolateRight: "clamp",
  });

  const positionStyle: React.CSSProperties =
    position === "top"
      ? { top: 120 }
      : position === "center"
        ? { top: "50%", transform: `translateY(-50%) scale(${scale})` }
        : { bottom: 180, transform: `scale(${scale})` };

  return (
    <div
      style={{
        position: "absolute",
        left: 32,
        right: 32,
        fontFamily,
        fontSize: size,
        fontWeight: 800,
        color: brand.colors.white,
        textAlign: "center",
        lineHeight: 1.2,
        opacity,
        textShadow: highlight
          ? `0 4px 24px ${brand.colors.dark}, 0 0 40px ${brand.colors.cyan}44`
          : undefined,
        WebkitTextStroke: highlight ? `1px ${brand.colors.dark}` : undefined,
        ...positionStyle,
      }}
    >
      {text}
    </div>
  );
};
