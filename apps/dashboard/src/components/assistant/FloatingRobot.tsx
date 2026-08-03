"use client";

import { cn } from "@/lib/utils";

export type RobotMood = "idle" | "thinking" | "speaking";

export function FloatingRobot({
  mood = "idle",
  className,
  compact = false,
}: {
  mood?: RobotMood;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "floating-robot",
        `floating-robot--${mood}`,
        compact && "floating-robot--compact",
        className
      )}
      aria-hidden
    >
      <div className="floating-robot-antenna" />
      <div className="floating-robot-head">
        <span className="floating-robot-eye floating-robot-eye--left" />
        <span className="floating-robot-eye floating-robot-eye--right" />
        <span className="floating-robot-mouth" />
      </div>
      <div className="floating-robot-body">
        <span className="floating-robot-arm floating-robot-arm--left" />
        <span className="floating-robot-arm floating-robot-arm--right" />
        <span className="floating-robot-core" />
      </div>
    </div>
  );
}
