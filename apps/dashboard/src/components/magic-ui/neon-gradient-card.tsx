"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface NeonGradientCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  borderSize?: number;
  borderRadius?: number;
  firstColor?: string;
  secondColor?: string;
}

export function NeonGradientCard({
  className,
  children,
  borderSize = 2,
  borderRadius = 20,
  firstColor = "#0D9488",
  secondColor = "#2DD4BF",
  ...props
}: NeonGradientCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const updateDimensions = () => {
      if (!containerRef.current) return;
      const { offsetWidth, offsetHeight } = containerRef.current;
      setDimensions({ width: offsetWidth, height: offsetHeight });
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, [children]);

  return (
    <div
      ref={containerRef}
      style={
        {
          "--neon-border-size": `${borderSize}px`,
          "--neon-radius": `${borderRadius}px`,
          "--neon-first": firstColor,
          "--neon-second": secondColor,
          "--neon-w": `${dimensions.width + borderSize * 2}px`,
          "--neon-h": `${dimensions.height + borderSize * 2}px`,
          "--neon-blur": `${Math.max(40, dimensions.width / 3)}px`,
        } as CSSProperties
      }
      className={cn("neon-gradient-card relative z-10 size-full", className)}
      {...props}
    >
      <div className="neon-gradient-card-inner relative size-full min-h-[inherit] rounded-[calc(var(--neon-radius)-var(--neon-border-size))] bg-card p-5 sm:p-6">
        {children}
      </div>
    </div>
  );
}
