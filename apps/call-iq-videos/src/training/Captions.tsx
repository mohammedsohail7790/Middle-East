import { interpolate, useCurrentFrame } from "remotion";
import { brand } from "../brand";
import { fontFamily } from "../lib/fonts";

type CaptionsProps = {
  text: string;
  wordsPerSecond?: number;
};

/**
 * Progressive word-by-word caption reveal for burned-in subtitles.
 */
export const Captions: React.FC<CaptionsProps> = ({
  text,
  wordsPerSecond = 2.8,
}) => {
  const frame = useCurrentFrame();
  const words = text.split(/\s+/);
  const visibleCount = Math.min(
    words.length,
    Math.floor((frame / 30) * wordsPerSecond) + 1,
  );
  const visible = words.slice(0, visibleCount).join(" ");
  const opacity = interpolate(frame, [0, 12], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        padding: "20px 48px 28px",
        background: `linear-gradient(0deg, ${brand.colors.dark}ee 0%, transparent 100%)`,
        opacity,
      }}
    >
      <div
        style={{
          fontFamily,
          fontSize: 18,
          fontWeight: 500,
          color: brand.colors.white,
          lineHeight: 1.5,
          maxWidth: 1200,
          margin: "0 auto",
          padding: "16px 24px",
          borderLeft: `3px solid ${brand.colors.cyan}`,
          background: `${brand.colors.gray}88`,
          borderRadius: "0 8px 8px 0",
        }}
      >
        {visible}
        {visibleCount < words.length ? (
          <span style={{ opacity: 0.4 }}> …</span>
        ) : null}
      </div>
    </div>
  );
};
