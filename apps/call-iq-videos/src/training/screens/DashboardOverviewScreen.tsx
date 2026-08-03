import { interpolate, useCurrentFrame } from "remotion";
import { brand } from "../../brand";
import { dashboardStats, northline, recentCalls } from "../../data/demo";
import { fontFamily } from "../../lib/fonts";
import { countUpDisplay } from "../../lib/motion";
import { DashboardShell } from "../DashboardShell";

const stats = [
  { label: "Calls Today", key: "callsToday" as const },
  { label: "Leads Captured", key: "leadsCaptured" as const },
  { label: "Appointments", key: "appointmentsBooked" as const },
  { label: "Conversion Rate", key: "conversionRate" as const, suffix: "%" },
];

export const DashboardOverviewScreen: React.FC = () => {
  const frame = useCurrentFrame();
  const zoom = interpolate(frame, [0, 90], [1.02, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <DashboardShell
      activeNav="Dashboard"
      pageTitle="Good afternoon, Rachel"
      tenantName={northline.dba}
    >
      <div
        style={{
          transform: `scale(${zoom})`,
          transformOrigin: "top center",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 16,
            marginBottom: 28,
            fontFamily,
          }}
        >
          {stats.map((stat, i) => {
            const opacity = interpolate(frame, [i * 6, i * 6 + 12], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            const raw = dashboardStats[stat.key];
            const display =
              stat.suffix === "%"
                ? `${countUpDisplay(frame, raw, 10 + i * 6, 40)}%`
                : countUpDisplay(frame, raw, 10 + i * 6, 40);
            return (
              <div
                key={stat.label}
                style={{
                  padding: 20,
                  borderRadius: 12,
                  background: brand.colors.gray,
                  border: `1px solid ${brand.colors.grayLight}`,
                  opacity,
                }}
              >
                <div style={{ fontSize: 12, color: brand.colors.muted }}>
                  {stat.label}
                </div>
                <div
                  style={{
                    fontSize: 28,
                    fontWeight: 800,
                    color: brand.colors.cyan,
                    marginTop: 6,
                  }}
                >
                  {display}
                </div>
              </div>
            );
          })}
        </div>

        <div
          style={{
            padding: 20,
            borderRadius: 12,
            background: brand.colors.gray,
            border: `1px solid ${brand.colors.grayLight}`,
            fontFamily,
          }}
        >
          <div
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: brand.colors.white,
              marginBottom: 16,
            }}
          >
            Recent Calls
          </div>
          {recentCalls.map((call, i) => {
            const opacity = interpolate(frame, [30 + i * 8, 40 + i * 8], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            return (
              <div
                key={call.name}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto auto",
                  gap: 24,
                  padding: "12px 0",
                  borderBottom: `1px solid ${brand.colors.grayLight}`,
                  opacity,
                }}
              >
                <span style={{ color: brand.colors.white }}>{call.name}</span>
                <span style={{ color: brand.colors.cyan, fontSize: 13 }}>
                  {call.status}
                </span>
                <span style={{ color: brand.colors.muted, fontSize: 13 }}>
                  {call.time}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </DashboardShell>
  );
};
