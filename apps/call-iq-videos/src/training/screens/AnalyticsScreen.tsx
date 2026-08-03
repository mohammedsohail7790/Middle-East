import { interpolate, useCurrentFrame } from "remotion";
import { analytics } from "../../data/demo";
import { brand } from "../../brand";
import { fontFamily } from "../../lib/fonts";
import { DashboardShell } from "../DashboardShell";

const DEFAULT_CHART_DATA = analytics.dailyCallVolume.map((d) => d.calls);

type Metric = {
  label: string;
  value: string;
  change?: string;
};

type AnalyticsScreenProps = {
  metrics: Metric[];
  chartLabel?: string;
  chartData?: number[];
};

export const AnalyticsScreen: React.FC<AnalyticsScreenProps> = ({
  metrics,
  chartLabel = "Weekly Performance",
  chartData = DEFAULT_CHART_DATA,
}) => {
  const frame = useCurrentFrame();
  const panX = interpolate(frame, [0, 120], [8, -8], {
    extrapolateRight: "clamp",
  });

  return (
    <DashboardShell activeNav="Analytics" pageTitle="Analytics & Reporting">
      <div style={{ transform: `translateX(${panX}px)` }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 16,
            marginBottom: 32,
            fontFamily,
          }}
        >
          {metrics.map((metric, i) => {
            const opacity = interpolate(frame, [i * 8, i * 8 + 15], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            const scale = interpolate(frame, [i * 8, i * 8 + 20], [0.92, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            return (
              <div
                key={metric.label}
                style={{
                  padding: "22px 20px",
                  borderRadius: 12,
                  background: brand.colors.gray,
                  border: `1px solid ${brand.colors.grayLight}`,
                  opacity,
                  transform: `scale(${scale})`,
                }}
              >
                <div style={{ fontSize: 13, color: brand.colors.muted, marginBottom: 8 }}>
                  {metric.label}
                </div>
                <div
                  style={{
                    fontSize: 32,
                    fontWeight: 800,
                    color: brand.colors.cyan,
                  }}
                >
                  {metric.value}
                </div>
                {metric.change && (
                  <div style={{ fontSize: 12, color: "#22C55E", marginTop: 6 }}>
                    {metric.change}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div
          style={{
            padding: 24,
            borderRadius: 14,
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
              marginBottom: 20,
            }}
          >
            {chartLabel}
          </div>
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "flex-end",
              height: 140,
            }}
          >
            {chartData.map((h, i) => {
              const max = Math.max(...chartData);
              const pct = (h / max) * 100;
              const barHeight = interpolate(
                frame,
                [20 + i * 5, 35 + i * 5],
                [0, pct],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
              );
              return (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: `${barHeight}%`,
                    background: `linear-gradient(180deg, ${brand.colors.cyan}, ${brand.colors.cyan}55)`,
                    borderRadius: 4,
                    alignSelf: "flex-end",
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>
    </DashboardShell>
  );
};
