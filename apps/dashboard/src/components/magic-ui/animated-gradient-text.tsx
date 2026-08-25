"use client";

import { cn } from "@/lib/utils";

export function AnimatedGradientText({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline bg-gradient-to-r from-[#0D9488] via-[#2DD4BF] to-[#0D9488] bg-[length:200%_auto] bg-clip-text text-transparent animate-gradient",
        className,
      )}
    >
      {children}
    </span>
  );
}
