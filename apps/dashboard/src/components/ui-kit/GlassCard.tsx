"use client";

import { motion, useMotionValue, useTransform, type HTMLMotionProps } from "framer-motion";
import { useRef, type ReactNode } from "react";

interface Props extends Omit<HTMLMotionProps<"div">, "children"> {
  children: ReactNode;
  tilt?: boolean;
  glow?: boolean;
  className?: string;
}

export function GlassCard({ children, tilt = true, glow = false, className = "", ...rest }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0.5);
  const y = useMotionValue(0.5);
  const rx = useTransform(y, [0, 1], [6, -6]);
  const ry = useTransform(x, [0, 1], [-6, 6]);

  return (
    <motion.div
      ref={ref}
      onMouseMove={(e) => {
        if (!tilt || !ref.current) return;
        const r = ref.current.getBoundingClientRect();
        x.set((e.clientX - r.left) / r.width);
        y.set((e.clientY - r.top) / r.height);
      }}
      onMouseLeave={() => {
        x.set(0.5);
        y.set(0.5);
      }}
      style={tilt ? { rotateX: rx, rotateY: ry, transformPerspective: 1000 } : undefined}
      className={`card rounded-[var(--radius-lg)] transition-shadow ${glow ? "glow-cyan" : ""} ${className}`}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
