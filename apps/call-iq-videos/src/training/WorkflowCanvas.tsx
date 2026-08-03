import { interpolate, useCurrentFrame } from "remotion";
import { brand } from "../brand";
import { fontFamily } from "../lib/fonts";

export type WorkflowNode = {
  id: string;
  label: string;
  description: string;
  x: number;
  y: number;
};

type WorkflowCanvasProps = {
  nodes: WorkflowNode[];
  activeIndex?: number;
};

function curvePath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): string {
  const cx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`;
}

export const WorkflowCanvas: React.FC<WorkflowCanvasProps> = ({
  nodes,
  activeIndex = 0,
}) => {
  const frame = useCurrentFrame();

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: 520,
        fontFamily,
        background: `radial-gradient(ellipse at 50% 0%, ${brand.colors.cyan}12 0%, ${brand.colors.dark} 60%)`,
        borderRadius: 16,
        border: `1px solid ${brand.colors.grayLight}`,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `linear-gradient(${brand.colors.cyan}08 1px, transparent 1px), linear-gradient(90deg, ${brand.colors.cyan}08 1px, transparent 1px)`,
          backgroundSize: "40px 40px",
          opacity: 0.5,
        }}
      />

      <svg
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
        }}
      >
        <defs>
          <linearGradient id="flowGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={brand.colors.cyan} stopOpacity={0.2} />
            <stop offset="50%" stopColor={brand.colors.cyan} stopOpacity={1} />
            <stop offset="100%" stopColor="#6366f1" stopOpacity={0.8} />
          </linearGradient>
        </defs>

        {nodes.slice(0, -1).map((node, i) => {
          const next = nodes[i + 1];
          const progress = interpolate(
            frame,
            [i * 28 + 15, i * 28 + 50],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );
          const x1 = node.x + 200;
          const y1 = node.y + 48;
          const x2 = next.x;
          const y2 = next.y + 48;
          const path = curvePath(x1, y1, x2, y2);
          const dashOffset = 1 - progress;
          const pulseT = (frame * 0.02 + i * 0.2) % 1;
          const pulseX = x1 + (x2 - x1) * pulseT;
          const pulseY = y1 + (y2 - y1) * pulseT;

          return (
            <g key={`edge-${node.id}`}>
              <path
                d={path}
                fill="none"
                stroke={brand.colors.grayLight}
                strokeWidth={2}
                opacity={0.35}
              />
              <path
                d={path}
                fill="none"
                stroke="url(#flowGrad)"
                strokeWidth={3}
                strokeDasharray="1"
                strokeDashoffset={dashOffset}
                opacity={0.85}
              />
              {progress > 0.15 && (
                <circle
                  cx={pulseX}
                  cy={pulseY}
                  r={5}
                  fill={brand.colors.cyan}
                  opacity={0.9}
                />
              )}
            </g>
          );
        })}
      </svg>

      {nodes.map((node, i) => {
        const nodeOpacity = interpolate(
          frame,
          [i * 28, i * 28 + 20],
          [0, 1],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        );
        const slideY = interpolate(
          frame,
          [i * 28, i * 28 + 22],
          [20, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        );
        const isActive = i === activeIndex;
        const isComplete = i < activeIndex;
        const pulse = isActive
          ? interpolate(frame % 50, [0, 25, 50], [1, 1.04, 1])
          : 1;

        return (
          <div
            key={node.id}
            style={{
              position: "absolute",
              left: node.x,
              top: node.y,
              width: 200,
              padding: "18px 20px",
              borderRadius: 14,
              background: isActive
                ? "rgba(14, 165, 233, 0.12)"
                : "rgba(17, 19, 24, 0.92)",
              backdropFilter: "blur(12px)",
              border: `2px solid ${
                isActive
                  ? brand.colors.cyan
                  : isComplete
                    ? `${brand.colors.cyan}66`
                    : brand.colors.grayLight
              }`,
              opacity: nodeOpacity,
              transform: `translateY(${slideY}px) scale(${pulse})`,
              boxShadow: isActive
                ? `0 0 32px ${brand.colors.cyan}44, inset 0 1px 0 ${brand.colors.white}11`
                : "0 8px 24px rgba(0,0,0,0.35)",
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.15em",
                color: brand.colors.cyan,
                marginBottom: 8,
              }}
            >
              {isComplete ? "✓ COMPLETE" : isActive ? "● ACTIVE" : `STEP ${i + 1}`}
            </div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: brand.colors.white,
                marginBottom: 6,
                lineHeight: 1.2,
              }}
            >
              {node.label}
            </div>
            <div style={{ fontSize: 12, color: brand.colors.muted, lineHeight: 1.4 }}>
              {node.description}
            </div>
          </div>
        );
      })}
    </div>
  );
};
