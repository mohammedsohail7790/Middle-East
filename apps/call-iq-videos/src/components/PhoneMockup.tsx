import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { brand } from "../brand";

type PhoneMockupProps = {
  children: React.ReactNode;
  enterFrom?: "bottom" | "right" | "scale";
  delay?: number;
};

export const PhoneMockup: React.FC<PhoneMockupProps> = ({
  children,
  enterFrom = "bottom",
  delay = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const localFrame = Math.max(0, frame - delay);

  const enterDuration = 0.6 * fps;
  const progress = interpolate(localFrame, [0, enterDuration], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  const translateY =
    enterFrom === "bottom" ? interpolate(progress, [0, 1], [120, 0]) : 0;
  const translateX =
    enterFrom === "right" ? interpolate(progress, [0, 1], [80, 0]) : 0;
  const scale =
    enterFrom === "scale"
      ? interpolate(progress, [0, 1], [0.7, 1])
      : interpolate(progress, [0, 1], [0.92, 1]);
  const opacity = interpolate(progress, [0, 0.4], [0, 1], {
    extrapolateRight: "clamp",
  });

  const floatY = Math.sin(localFrame / 20) * 4;

  return (
    <div
      style={{
        width: 320,
        height: 660,
        borderRadius: 40,
        border: `3px solid ${brand.colors.grayLight}`,
        background: brand.colors.gray,
        padding: 12,
        boxShadow: `0 24px 80px ${brand.colors.cyan}33, inset 0 0 0 1px ${brand.colors.white}11`,
        transform: `translate(${translateX}px, ${translateY + floatY}px) scale(${scale})`,
        opacity,
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 10,
          left: "50%",
          transform: "translateX(-50%)",
          width: 80,
          height: 24,
          borderRadius: 12,
          background: brand.colors.dark,
          zIndex: 2,
        }}
      />
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: 30,
          overflow: "hidden",
          background: brand.colors.dark,
        }}
      >
        {children}
      </div>
    </div>
  );
};
