import { interpolate, useCurrentFrame } from "remotion";
import { brand } from "../../brand";
import { fontFamily } from "../../lib/fonts";
import { DashboardShell } from "../DashboardShell";

type AgentConfigScreenProps = {
  section: string;
  fields: { label: string; value: string; type?: "text" | "select" | "textarea" }[];
  tabs?: string[];
  activeTab?: string;
};

export const AgentConfigScreen: React.FC<AgentConfigScreenProps> = ({
  section,
  fields,
  tabs,
  activeTab,
}) => {
  const frame = useCurrentFrame();

  return (
    <DashboardShell activeNav="AI Agent" pageTitle={section}>
      {tabs && (
        <div style={{ display: "flex", gap: 8, marginBottom: 28, fontFamily }}>
          {tabs.map((tab, i) => {
            const isActive = tab === activeTab;
            const opacity = interpolate(frame, [i * 5, i * 5 + 10], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            return (
              <div
                key={tab}
                style={{
                  padding: "10px 18px",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  opacity,
                  color: isActive ? brand.colors.white : brand.colors.muted,
                  background: isActive ? brand.colors.gray : "transparent",
                  border: `1px solid ${isActive ? brand.colors.cyan : brand.colors.grayLight}`,
                }}
              >
                {tab}
              </div>
            );
          })}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 20,
          fontFamily,
        }}
      >
        {fields.map((field, i) => {
          const opacity = interpolate(frame, [10 + i * 8, 20 + i * 8], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const isTextarea = field.type === "textarea";
          return (
            <div
              key={field.label}
              style={{
                gridColumn: isTextarea ? "1 / -1" : undefined,
                opacity,
              }}
            >
              <label
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 600,
                  color: brand.colors.muted,
                  marginBottom: 8,
                }}
              >
                {field.label}
              </label>
              <div
                style={{
                  padding: isTextarea ? "16px" : "12px 16px",
                  borderRadius: 10,
                  background: brand.colors.gray,
                  border: `1px solid ${brand.colors.grayLight}`,
                  fontSize: 14,
                  color: brand.colors.white,
                  minHeight: isTextarea ? 100 : undefined,
                  lineHeight: 1.5,
                }}
              >
                {field.value}
              </div>
            </div>
          );
        })}
      </div>
    </DashboardShell>
  );
};
