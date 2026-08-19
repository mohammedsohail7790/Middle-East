import { interpolate, useCurrentFrame } from "remotion";
import { brand } from "../brand";
import { fontFamily } from "../lib/fonts";

type Screen = "calls" | "leads" | "analytics";

type DashboardMockUIProps = {
  screen: Screen;
};

const calls = [
  { name: "Sarah M.", time: "2m ago", status: "Booked" },
  { name: "James K.", time: "8m ago", status: "Qualified" },
  { name: "Unknown", time: "12m ago", status: "Voicemail" },
];

const leads = [
  { name: "Sarah M.", score: 92, source: "Inbound" },
  { name: "James K.", score: 78, source: "Inbound" },
  { name: "Lisa T.", score: 85, source: "Callback" },
];

export const DashboardMockUI: React.FC<DashboardMockUIProps> = ({ screen }) => {
  const frame = useCurrentFrame();
  const slideIn = interpolate(frame, [0, 15], [30, 0], {
    extrapolateRight: "clamp",
  });
  const opacity = interpolate(frame, [0, 10], [0, 1], {
    extrapolateRight: "clamp",
  });

  const titles: Record<Screen, string> = {
    calls: "Recent Calls",
    leads: "New Leads",
    analytics: "Analytics",
  };

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: brand.colors.dark,
        fontFamily,
        color: brand.colors.white,
        padding: "48px 16px 16px",
        opacity,
        transform: `translateY(${slideIn}px)`,
      }}
    >
      <div
        style={{
          fontSize: 18,
          fontWeight: 700,
          marginBottom: 4,
          color: brand.colors.cyan,
        }}
      >
        Halla AI
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>
        {titles[screen]}
      </div>

      {screen === "calls" &&
        calls.map((call, i) => (
          <Row
            key={call.name}
            delay={i * 5}
            left={call.name}
            right={call.status}
            sub={call.time}
          />
        ))}

      {screen === "leads" &&
        leads.map((lead, i) => (
          <Row
            key={lead.name}
            delay={i * 5}
            left={lead.name}
            right={`${lead.score}%`}
            sub={lead.source}
          />
        ))}

      {screen === "analytics" && (
        <div style={{ marginTop: 8 }}>
          <StatBar label="Calls Today" value={47} max={60} delay={0} />
          <StatBar label="Leads Captured" value={23} max={30} delay={5} />
          <StatBar label="Conversion" value={49} max={100} delay={10} suffix="%" />
          <div
            style={{
              marginTop: 20,
              display: "flex",
              gap: 4,
              alignItems: "flex-end",
              height: 80,
            }}
          >
            {[40, 55, 35, 70, 60, 85, 75].map((h, i) => (
              <Bar key={i} height={h} delay={i * 3} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const Row: React.FC<{
  left: string;
  right: string;
  sub: string;
  delay: number;
}> = ({ left, right, sub, delay }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [delay, delay + 10], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "10px 12px",
        marginBottom: 8,
        borderRadius: 10,
        background: brand.colors.gray,
        opacity,
      }}
    >
      <div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{left}</div>
        <div style={{ fontSize: 11, color: brand.colors.muted }}>{sub}</div>
      </div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: brand.colors.cyan,
          background: `${brand.colors.cyan}22`,
          padding: "4px 8px",
          borderRadius: 6,
        }}
      >
        {right}
      </div>
    </div>
  );
};

const StatBar: React.FC<{
  label: string;
  value: number;
  max: number;
  delay: number;
  suffix?: string;
}> = ({ label, value, max, delay, suffix = "" }) => {
  const frame = useCurrentFrame();
  const width = interpolate(frame, [delay, delay + 20], [0, (value / max) * 100], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 12,
          marginBottom: 6,
        }}
      >
        <span>{label}</span>
        <span style={{ color: brand.colors.cyan }}>
          {value}
          {suffix}
        </span>
      </div>
      <div
        style={{
          height: 6,
          borderRadius: 3,
          background: brand.colors.gray,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${width}%`,
            height: "100%",
            background: brand.colors.cyan,
            borderRadius: 3,
          }}
        />
      </div>
    </div>
  );
};

const Bar: React.FC<{ height: number; delay: number }> = ({ height, delay }) => {
  const frame = useCurrentFrame();
  const h = interpolate(frame, [delay, delay + 15], [0, height], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  return (
    <div
      style={{
        flex: 1,
        height: `${h}%`,
        background: `linear-gradient(180deg, ${brand.colors.cyan}, ${brand.colors.cyan}66)`,
        borderRadius: 4,
        alignSelf: "flex-end",
      }}
    />
  );
};
