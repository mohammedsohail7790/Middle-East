import { Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { brand } from "../brand";
import { fontFamily } from "../lib/fonts";

type CallIqLogoProps = {
  size?: "sm" | "md" | "lg";
  showTagline?: boolean;
  animate?: boolean;
};

const sizes = {
  sm: { width: 180, fontSize: 14 },
  md: { width: 280, fontSize: 18 },
  lg: { width: 400, fontSize: 22 },
};

export const CallIqLogo: React.FC<CallIqLogoProps> = ({
  size = "md",
  showTagline = true,
  animate = true,
}) => {
  const frame = useCurrentFrame();
  const { width, fontSize } = sizes[size];

  const opacity = animate
    ? interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" })
    : 1;
  const scale = animate
    ? interpolate(frame, [0, 20], [0.85, 1], { extrapolateRight: "clamp" })
    : 1;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
        opacity,
        transform: `scale(${scale})`,
      }}
    >
      <Img
        src={staticFile("logo.png")}
        style={{ width, height: "auto" }}
      />
      {showTagline && (
        <div
          style={{
            fontFamily,
            fontSize,
            color: brand.colors.muted,
            letterSpacing: 1,
          }}
        >
          {brand.tagline}
        </div>
      )}
    </div>
  );
};
