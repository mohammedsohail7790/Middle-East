import { interpolate, useCurrentFrame } from "remotion";
import { brand } from "../brand";
import { fontFamily } from "../lib/fonts";

const NAV_GROUPS = [
  {
    label: "Overview",
    items: [{ name: "Dashboard", active: false }],
  },
  {
    label: "Operations",
    items: [
      { name: "Calls", active: false },
      { name: "Leads", active: false },
      { name: "AI Agent", active: false },
      { name: "Calendar", active: false },
      { name: "SMS", active: false },
      { name: "Analytics", active: false },
    ],
  },
  {
    label: "Platform",
    items: [
      { name: "Integrations", active: false },
      { name: "Phone Numbers", active: false },
      { name: "Knowledge", active: false },
      { name: "Billing", active: false },
      { name: "Settings", active: false },
    ],
  },
];

type DashboardShellProps = {
  activeNav?: string;
  pageTitle: string;
  tenantName?: string;
  children: React.ReactNode;
};

export const DashboardShell: React.FC<DashboardShellProps> = ({
  activeNav = "Dashboard",
  pageTitle,
  tenantName,
  children,
}) => {
  const frame = useCurrentFrame();
  const slideIn = interpolate(frame, [0, 20], [24, 0], {
    extrapolateRight: "clamp",
  });
  const opacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  });

  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.map((item) => ({
      ...item,
      active: item.name === activeNav,
    })),
  }));

  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        fontFamily,
        opacity,
        transform: `translateY(${slideIn}px)`,
      }}
    >
      <aside
        style={{
          width: 248,
          background: "#111318",
          borderRight: `1px solid ${brand.colors.grayLight}`,
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            height: 56,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "0 16px",
            borderBottom: `1px solid ${brand.colors.grayLight}`,
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: brand.colors.cyan,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 700,
              color: brand.colors.dark,
            }}
          >
            CQ
          </div>
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: brand.colors.white,
            }}
          >
            Halla AI
          </span>
        </div>

        <nav style={{ flex: 1, padding: "16px 8px", overflow: "hidden" }}>
          {groups.map((group) => (
            <div key={group.label} style={{ marginBottom: 20 }}>
              <p
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: 2,
                  textTransform: "uppercase",
                  color: brand.colors.muted,
                  padding: "0 12px",
                  marginBottom: 6,
                }}
              >
                {group.label}
              </p>
              {group.items.map((item) => (
                <div
                  key={item.name}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "8px 12px",
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 500,
                    marginBottom: 2,
                    color: item.active ? brand.colors.white : brand.colors.muted,
                    background: item.active ? brand.colors.gray : "transparent",
                    boxShadow: item.active
                      ? `inset 2px 0 0 ${brand.colors.cyan}`
                      : "none",
                  }}
                >
                  <NavDot active={item.active} />
                  {item.name}
                </div>
              ))}
            </div>
          ))}
        </nav>

        <div
          style={{
            padding: 12,
            borderTop: `1px solid ${brand.colors.grayLight}`,
          }}
        >
          <div
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              fontSize: 12,
              color: brand.colors.muted,
              background: brand.colors.gray,
              border: `1px solid ${brand.colors.grayLight}`,
            }}
          >
            Professional plan
            {tenantName ? (
              <div style={{ marginTop: 6, fontSize: 11, color: brand.colors.white }}>
                {tenantName}
              </div>
            ) : null}
          </div>
        </div>
      </aside>

      <main
        style={{
          flex: 1,
          background: brand.colors.dark,
          padding: "72px 40px 100px",
          overflow: "hidden",
        }}
      >
        <h1
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: brand.colors.white,
            marginBottom: 24,
          }}
        >
          {pageTitle}
        </h1>
        {children}
      </main>
    </div>
  );
};

const NavDot: React.FC<{ active: boolean }> = ({ active }) => (
  <div
    style={{
      width: 6,
      height: 6,
      borderRadius: "50%",
      background: active ? brand.colors.cyan : brand.colors.grayLight,
      flexShrink: 0,
    }}
  />
);
