import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { brand } from "../brand";
import { fontFamily } from "../lib/fonts";
import { SceneBackground } from "../components/SceneBackground";

type ChapterIntroProps = {
  number: number;
  title: string;
  totalChapters: number;
};

export const ChapterIntro: React.FC<ChapterIntroProps> = ({
  number,
  title,
  totalChapters,
}) => {
  const frame = useCurrentFrame();
  const cardScale = interpolate(frame, [0, 18], [0.92, 1], {
    extrapolateRight: "clamp",
  });
  const cardOpacity = interpolate(frame, [0, 12], [0, 1], {
    extrapolateRight: "clamp",
  });
  const titleOpacity = interpolate(frame, [12, 28], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill>
      <SceneBackground variant="gradient" />
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <div
          style={{
            opacity: cardOpacity,
            transform: `scale(${cardScale})`,
            background: brand.colors.gray,
            border: `1px solid ${brand.colors.grayLight}`,
            borderRadius: 20,
            padding: "48px 64px",
            textAlign: "center",
            boxShadow: `0 0 60px ${brand.colors.cyan}22`,
          }}
        >
          <div
            style={{
              fontFamily,
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: 3,
              textTransform: "uppercase",
              color: brand.colors.cyan,
              marginBottom: 16,
            }}
          >
            Chapter {number} of {totalChapters}
          </div>
          <div
            style={{
              fontFamily,
              fontSize: 42,
              fontWeight: 700,
              color: brand.colors.white,
              opacity: titleOpacity,
              maxWidth: 700,
              lineHeight: 1.2,
            }}
          >
            {title}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
