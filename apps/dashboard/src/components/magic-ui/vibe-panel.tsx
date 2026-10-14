"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type VibePanelProps = {
  children: ReactNode;
  className?: string;
  innerClassName?: string;
  beam?: boolean;
};

/** `beam` is accepted for call-site compatibility; the Apple surface system uses flat panels, so it renders nothing extra. */
export function VibePanel({ children, className, innerClassName }: VibePanelProps) {
  return (
    <div className={cn("vibe-panel relative overflow-hidden", className)}>
      <div className={cn("relative z-[1]", innerClassName)}>{children}</div>
    </div>
  );
}
