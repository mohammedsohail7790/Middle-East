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
        "inline bg-gradient-to-r from-[#8C6F3E] via-[#C7A25A] to-[#8C6F3E] bg-[length:200%_auto] bg-clip-text text-transparent animate-gradient",
        className,
      )}
    >
      {children}
    </span>
  );
}
