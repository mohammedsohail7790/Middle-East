import { interpolate, useCurrentFrame } from "remotion";
import { brand } from "../../brand";
import { fontFamily } from "../../lib/fonts";
import { DashboardShell } from "../DashboardShell";

type PhoneSetupScreenProps = {
  step: string;
  numbers?: { number: string; area: string; status: string }[];
  routingRules?: { condition: string; action: string }[];
};

export const PhoneSetupScreen: React.FC<PhoneSetupScreenProps> = ({
  step,
  numbers,
  routingRules,
}) => {
  const frame = useCurrentFrame();

  return (
    <DashboardShell activeNav="Phone Numbers" pageTitle={step}>
      {numbers && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, fontFamily }}>
          {numbers.map((num, i) => {
            const opacity = interpolate(frame, [i * 10, i * 10 + 15], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            return (
              <div
                key={num.number}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "18px 22px",
                  borderRadius: 12,
                  background: brand.colors.gray,
                  border: `1px solid ${brand.colors.grayLight}`,
                  opacity,
                }}
              >
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: brand.colors.white }}>
                    {num.number}
                  </div>
                  <div style={{ fontSize: 13, color: brand.colors.muted }}>
                    {num.area}
                  </div>
                </div>
                <div
                  style={{
                    padding: "6px 14px",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    color: brand.colors.cyan,
                    background: `${brand.colors.cyan}22`,
                  }}
                >
                  {num.status}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {routingRules && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, fontFamily }}>
          {routingRules.map((rule, i) => {
            const opacity = interpolate(frame, [i * 12, i * 12 + 18], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            return (
              <div
                key={rule.condition}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 20,
                  padding: "16px 20px",
                  borderRadius: 10,
                  background: brand.colors.gray,
                  opacity,
                }}
              >
                <div style={{ flex: 1, fontSize: 15, color: brand.colors.white }}>
                  {rule.condition}
                </div>
                <div style={{ color: brand.colors.cyan, fontSize: 18 }}>→</div>
                <div
                  style={{
                    flex: 1,
                    fontSize: 15,
                    fontWeight: 600,
                    color: brand.colors.cyan,
                  }}
                >
                  {rule.action}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </DashboardShell>
  );
};
