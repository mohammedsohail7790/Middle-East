import { TRANSITION_FRAMES } from "../lib/duration";

export const INTRO_FRAMES = 120;
export const OUTRO_FRAMES = 120;

export const distributeChapterDurations = (
  totalFrames: number,
  numChapters: number,
  introFrames = INTRO_FRAMES,
  outroFrames = OUTRO_FRAMES,
  transitionFrames = TRANSITION_FRAMES,
): number[] => {
  const numTransitions = numChapters + 1;
  const contentTotal =
    totalFrames - introFrames - outroFrames + numTransitions * transitionFrames;
  const perChapter = Math.floor(contentTotal / numChapters);
  const remainder = contentTotal % numChapters;
  return Array.from({ length: numChapters }, (_, i) =>
    perChapter + (i < remainder ? 1 : 0),
  );
};

export const trainingVideoDuration = (
  chapterDurations: number[],
  introFrames = INTRO_FRAMES,
  outroFrames = OUTRO_FRAMES,
  transitionFrames = TRANSITION_FRAMES,
): number => {
  const numTransitions = chapterDurations.length + 1;
  const chapterSum = chapterDurations.reduce((a, b) => a + b, 0);
  return (
    introFrames + outroFrames + chapterSum - numTransitions * transitionFrames
  );
};
