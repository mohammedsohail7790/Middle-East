import { interpolate, useCurrentFrame } from "remotion";
import { brand } from "../../brand";
import { fontFamily } from "../../lib/fonts";

type FeatureScreenProps = {
  headline: string;
  bullets: string[];
  icon?: string;
  stat?: { label: string; value: string };
};

export const FeatureScreen: React.FC<FeatureScreenProps> = ({
  headline,
  bullets,
  icon = "✦",
  stat,
}) => {
  const frame = useCurrentFrame();

  return (
    <div
      style={{
        display: "flex",
        gap: 48,
        height: "100%",
        fontFamily,
        alignItems: "center",
      }}
    >
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: 48,
            marginBottom: 20,
            opacity: interpolate(frame, [0, 15], [0, 1], {
              extrapolateRight: "clamp",
            }),
          }}
        >
          {icon}
        </div>
        <h2
          style={{
            fontSize: 36,
            fontWeight: 700,
            color: brand.colors.white,
            marginBottom: 28,
            lineHeight: 1.2,
            opacity: interpolate(frame, [5, 20], [0, 1], {
              extrapolateRight: "clamp",
            }),
          }}
        >
          {headline}
        </h2>
        {bullets.map((bullet, i) => {
          const opacity = interpolate(frame, [15 + i * 10, 25 + i * 10], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <div
              key={bullet}
              style={{
                display: "flex",
                gap: 14,
                alignItems: "flex-start",
                marginBottom: 16,
                opacity,
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: brand.colors.cyan,
                  marginTop: 8,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: 20,
                  color: brand.colors.muted,
                  lineHeight: 1.5,
                }}
              >
                {bullet}
              </span>
            </div>
          );
        })}
      </div>

      {stat && (
        <div
          style={{
            width: 280,
            padding: 32,
            borderRadius: 16,
            background: brand.colors.gray,
            border: `1px solid ${brand.colors.grayLight}`,
            textAlign: "center",
            opacity: interpolate(frame, [30, 45], [0, 1], {
              extrapolateRight: "clamp",
            }),
          }}
        >
          <div
            style={{
              fontSize: 48,
              fontWeight: 800,
              color: brand.colors.cyan,
              marginBottom: 8,
            }}
          >
            {stat.value}
          </div>
          <div style={{ fontSize: 16, color: brand.colors.muted }}>
            {stat.label}
          </div>
        </div>
      )}
    </div>
  );
};
