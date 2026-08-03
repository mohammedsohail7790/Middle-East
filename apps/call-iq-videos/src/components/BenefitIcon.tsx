import { interpolate, useCurrentFrame } from "remotion";
import { brand } from "../brand";
import { fontFamily } from "../lib/fonts";

type BenefitIconProps = {
  icon: "phone" | "users" | "clock" | "chart" | "link";
  title: string;
  subtitle: string;
  index: number;
};

const icons: Record<BenefitIconProps["icon"], string> = {
  phone: "📞",
  users: "👥",
  clock: "⏱",
  chart: "📊",
  link: "🔗",
};

export const BenefitIcon: React.FC<BenefitIconProps> = ({
  icon,
  title,
  subtitle,
  index,
}) => {
  const frame = useCurrentFrame();
  const delay = index * 8;
  const opacity = interpolate(frame, [delay, delay + 12], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });
  const translateX = interpolate(frame, [delay, delay + 15], [-40, 0], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });
  const scale = interpolate(frame, [delay, delay + 15], [0.5, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        opacity,
        transform: `translateX(${translateX}px)`,
        marginBottom: 20,
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 16,
          background: `${brand.colors.cyan}22`,
          border: `2px solid ${brand.colors.cyan}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 28,
          transform: `scale(${scale})`,
        }}
      >
        {icons[icon]}
      </div>
      <div>
        <div
          style={{
            fontFamily,
            fontSize: 22,
            fontWeight: 700,
            color: brand.colors.white,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontFamily,
            fontSize: 14,
            color: brand.colors.muted,
            marginTop: 2,
          }}
        >
          {subtitle}
        </div>
      </div>
    </div>
  );
};
