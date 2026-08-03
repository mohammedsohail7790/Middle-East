import { linearTiming } from "@remotion/transitions";

export const TRANSITION_FRAMES = 12;

export const transitionTiming = linearTiming({
  durationInFrames: TRANSITION_FRAMES,
});

export const totalWithTransitions = (
  sceneDurations: number[],
  transitionFrames: number = TRANSITION_FRAMES,
  fps: number = 30,
): number => {
  const transitionCount = sceneDurations.length - 1;
  const transitionDuration = linearTiming({
    durationInFrames: transitionFrames,
  }).getDurationInFrames({ fps });
  const sceneSum = sceneDurations.reduce((a, b) => a + b, 0);
  return sceneSum - transitionCount * transitionDuration;
};
