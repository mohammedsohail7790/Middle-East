import { interpolate, useCurrentFrame } from "remotion";
import { brand } from "../brand";
import { fontFamily } from "../lib/fonts";

type LowerThirdProps = {
  label: string;
  detail?: string;
};

export const LowerThird: React.FC<LowerThirdProps> = ({ label, detail }) => {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [20, 35], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const translateX = interpolate(frame, [20, 35], [-24, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        top: 100,
        left: 48,
        opacity: enter,
        transform: `translateX(${translateX}px)`,
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <div
        style={{
          fontFamily,
          fontSize: 20,
          fontWeight: 700,
          color: brand.colors.white,
          background: `${brand.colors.dark}cc`,
          borderLeft: `4px solid ${brand.colors.cyan}`,
          padding: "8px 16px",
          borderRadius: "0 6px 6px 0",
        }}
      >
        {label}
      </div>
      {detail ? (
        <div
          style={{
            fontFamily,
            fontSize: 14,
            fontWeight: 500,
            color: brand.colors.muted,
            background: `${brand.colors.dark}cc`,
            padding: "4px 16px",
            marginLeft: 4,
            borderRadius: "0 6px 6px 0",
          }}
        >
          {detail}
        </div>
      ) : null}
    </div>
  );
};
