"use client";

import { cn } from "@/lib/utils";

export type AssistantMood = "idle" | "thinking" | "speaking";

/** Lightweight CSS orb — avoids WebGL / drei chunk failures in production. */
export function AssistantAvatar({
  mood = "idle",
  className,
}: {
  mood?: AssistantMood;
  className?: string;
}) {
  return (
    <div
      className={cn("assistant-avatar-css", `assistant-avatar-css--${mood}`, className)}
      aria-hidden
    >
      <div className="assistant-avatar-css-core" />
      <div className="assistant-avatar-css-glow" />
    </div>
  );
}
