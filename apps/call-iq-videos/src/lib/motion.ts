import { Easing, interpolate } from "remotion";

export const easeOutExpo = Easing.bezier(0.16, 1, 0.3, 1);
export const easeInOutCubic = Easing.bezier(0.65, 0, 0.35, 1);

export function fade(
  frame: number,
  start = 0,
  duration = 20,
  from = 0,
  to = 1,
): number {
  return interpolate(frame, [start, start + duration], [from, to], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
    easing: easeOutExpo,
  });
}

export function slideUp(
  frame: number,
  start = 0,
  duration = 24,
  distance = 40,
): number {
  return interpolate(frame, [start, start + duration], [distance, 0], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
    easing: easeOutExpo,
  });
}

export function scaleIn(
  frame: number,
  start = 0,
  duration = 28,
  from = 0.85,
  to = 1,
): number {
  return interpolate(frame, [start, start + duration], [from, to], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
    easing: easeOutExpo,
  });
}

export function cameraDrift(frame: number, speed = 0.008): number {
  return frame * speed;
}

/** Animate a numeric display value (e.g. "1,284" → count up). */
export function countUpDisplay(
  frame: number,
  target: number,
  start = 15,
  duration = 45,
  decimals = 0,
): string {
  const progress = interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeOutExpo,
  });
  const value = target * progress;
  return decimals > 0
    ? value.toFixed(decimals)
    : Math.round(value).toLocaleString("en-US");
}
