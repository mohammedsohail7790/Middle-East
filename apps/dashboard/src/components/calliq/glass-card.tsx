"use client";

import { cn } from "@/lib/utils";
import { motion, type HTMLMotionProps } from "framer-motion";
import { forwardRef } from "react";

interface Props extends HTMLMotionProps<"div"> {
  glow?: boolean;
  tilt?: boolean;
}

export const GlassCard = forwardRef<HTMLDivElement, Props>(
  ({ className, glow, tilt, children, ...props }, ref) => (
    <motion.div
      ref={ref}
      whileHover={tilt ? { y: -4 } : undefined}
      transition={{ type: "spring", stiffness: 200, damping: 20 }}
      className={cn(
        "card rounded-[var(--radius-lg)] relative overflow-hidden",
        glow && "glow-cyan",
        tilt && "lift card-interactive",
        className,
      )}
      {...props}
    >
      {children}
    </motion.div>
  ),
);
GlassCard.displayName = "GlassCard";

export function GradientButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm",
        "gradient-cyan text-white shadow-lg shadow-[var(--cyan-glow)]",
        "hover:shadow-xl hover:shadow-[var(--cyan-glow)] hover:-translate-y-0.5 transition-all",
        "disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm",
        "btn-ghost cursor-pointer",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function StatusBadge({
  status,
  children,
}: {
  status: "success" | "warning" | "error" | "info" | "neutral";
  children: React.ReactNode;
}) {
  const map = {
    success: "bg-success/15 text-success border-success/30",
    warning: "bg-warning/15 text-warning border-warning/30",
    error: "bg-destructive/15 text-destructive border-destructive/30",
    info: "bg-primary/15 text-primary border-primary/30",
    neutral: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span
      role="status"
      className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border", map[status])}
    >
      {children}
    </span>
  );
}
