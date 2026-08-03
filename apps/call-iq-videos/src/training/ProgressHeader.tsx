import { interpolate, useCurrentFrame } from "remotion";
import { brand } from "../brand";
import { fontFamily } from "../lib/fonts";

type ProgressHeaderProps = {
  videoTitle: string;
  chapterNumber: number;
  totalChapters: number;
  chapterTitle: string;
};

export const ProgressHeader: React.FC<ProgressHeaderProps> = ({
  videoTitle,
  chapterNumber,
  totalChapters,
  chapterTitle,
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 12], [0, 1], {
    extrapolateRight: "clamp",
  });
  const progress = chapterNumber / totalChapters;

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        padding: "20px 40px",
        opacity,
        zIndex: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
        }}
      >
        <div
          style={{
            fontFamily,
            fontSize: 13,
            fontWeight: 600,
            color: brand.colors.cyan,
            letterSpacing: 1,
          }}
        >
          {videoTitle}
        </div>
        <div
          style={{
            fontFamily,
            fontSize: 13,
            color: brand.colors.muted,
          }}
        >
          Chapter {chapterNumber} of {totalChapters}
        </div>
      </div>
      <div
        style={{
          fontFamily,
          fontSize: 22,
          fontWeight: 700,
          color: brand.colors.white,
          marginBottom: 12,
        }}
      >
        {chapterTitle}
      </div>
      <div
        style={{
          height: 3,
          background: brand.colors.gray,
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${progress * 100}%`,
            height: "100%",
            background: brand.colors.cyan,
            borderRadius: 2,
          }}
        />
      </div>
    </div>
  );
};
