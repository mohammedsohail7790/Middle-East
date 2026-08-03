import { interpolate, useCurrentFrame } from "remotion";
import { brand } from "../brand";

type VoiceWaveformProps = {
  bars?: number;
  active?: boolean;
  color?: string;
};

export const VoiceWaveform: React.FC<VoiceWaveformProps> = ({
  bars = 32,
  active = true,
  color = brand.colors.cyan,
}) => {
  const frame = useCurrentFrame();

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3, height: 48 }}>
      {Array.from({ length: bars }).map((_, i) => {
        const h = active
          ? 8 + Math.abs(Math.sin(frame * 0.15 + i * 0.45)) * 36
          : 8;
        return (
          <div
            key={i}
            style={{
              width: 4,
              height: h,
              borderRadius: 2,
              background: color,
              opacity: 0.85,
              boxShadow: `0 0 12px ${color}66`,
            }}
          />
        );
      })}
    </div>
  );
};

export const ThinkingPulse: React.FC = () => {
  const frame = useCurrentFrame();
  const dots = [0, 1, 2].map((i) => ({
    opacity: interpolate((frame + i * 8) % 36, [0, 12, 24, 36], [0.3, 1, 0.3, 0.3]),
    scale: interpolate((frame + i * 8) % 36, [0, 12, 24, 36], [0.8, 1.2, 0.8, 0.8]),
  }));

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      {dots.map((d, i) => (
        <div
          key={i}
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: brand.colors.cyan,
            opacity: d.opacity,
            transform: `scale(${d.scale})`,
            boxShadow: `0 0 16px ${brand.colors.cyan}`,
          }}
        />
      ))}
    </div>
  );
};
