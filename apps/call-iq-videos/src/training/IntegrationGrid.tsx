import { interpolate, useCurrentFrame } from "remotion";
import { brand } from "../brand";
import { fontFamily } from "../lib/fonts";

export type Integration = {
  name: string;
  category: string;
  connected?: boolean;
};

type IntegrationGridProps = {
  integrations: Integration[];
};

export const IntegrationGrid: React.FC<IntegrationGridProps> = ({
  integrations,
}) => {
  const frame = useCurrentFrame();

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 20,
        fontFamily,
      }}
    >
      {integrations.map((integration, i) => {
        const opacity = interpolate(frame, [i * 8, i * 8 + 15], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const scale = interpolate(frame, [i * 8, i * 8 + 15], [0.9, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

        return (
          <div
            key={integration.name}
            style={{
              padding: "24px 20px",
              borderRadius: 14,
              background: brand.colors.gray,
              border: `1px solid ${integration.connected ? brand.colors.cyan : brand.colors.grayLight}`,
              opacity,
              transform: `scale(${scale})`,
            }}
          >
            <div
              style={{
                display: "inline-block",
                padding: "6px 14px",
                borderRadius: 8,
                background: `${brand.colors.cyan}22`,
                color: brand.colors.cyan,
                fontSize: 16,
                fontWeight: 700,
                marginBottom: 12,
              }}
            >
              {integration.name}
            </div>
            <div
              style={{
                fontSize: 13,
                color: brand.colors.muted,
                marginBottom: 10,
              }}
            >
              {integration.category}
            </div>
            {integration.connected && (
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#22C55E",
                }}
              >
                Connected
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
