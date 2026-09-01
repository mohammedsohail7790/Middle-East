"use client";

import type { ReactNode } from "react";
import { BorderBeam } from "@/components/magic-ui/border-beam";
import { cn } from "@/lib/utils";

type VibePanelProps = {
  children: ReactNode;
  className?: string;
  innerClassName?: string;
  beam?: boolean;
};

export function VibePanel({ children, className, innerClassName, beam = false }: VibePanelProps) {
  return (
    <div className={cn("vibe-panel relative overflow-hidden", className)}>
      {beam && (
        <BorderBeam size={85} duration={10} colorFrom="#C7A25A" colorTo="#8C6F3E" borderWidth={1.5} />
      )}
      <div className={cn("relative z-[1]", innerClassName)}>{children}</div>
    </div>
  );
}
