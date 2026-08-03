import { interpolate, useCurrentFrame } from "remotion";
import { brand } from "../brand";
import { fontFamily } from "../lib/fonts";

type FeaturePhoneScreenProps = {
  title: string;
  lines: string[];
  icon: string;
};

export const FeaturePhoneScreen: React.FC<FeaturePhoneScreenProps> = ({
  title,
  lines,
  icon,
}) => {
  const frame = useCurrentFrame();

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: `linear-gradient(180deg, ${brand.colors.gray} 0%, ${brand.colors.dark} 100%)`,
        fontFamily,
        color: brand.colors.white,
        padding: "48px 20px 20px",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ fontSize: 40, marginBottom: 12 }}>{icon}</div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 700,
          color: brand.colors.cyan,
          marginBottom: 20,
        }}
      >
        {title}
      </div>
      {lines.map((line, i) => {
        const opacity = interpolate(frame, [10 + i * 8, 18 + i * 8], [0, 1], {
          extrapolateRight: "clamp",
          extrapolateLeft: "clamp",
        });
        return (
          <div
            key={line}
            style={{
              fontSize: 14,
              lineHeight: 1.5,
              marginBottom: 12,
              padding: "10px 14px",
              borderRadius: 12,
              background: brand.colors.gray,
              opacity,
            }}
          >
            {line}
          </div>
        );
      })}
    </div>
  );
};
