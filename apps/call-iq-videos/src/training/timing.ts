import { TRANSITION_FRAMES } from "../lib/duration";
import { INTRO_FRAMES, OUTRO_FRAMES } from "./duration";

export const CHAPTER_INTRO_FRAMES = 75;

/** Absolute composition frame where each segment begins (intro, chapters, outro). */
export const computeTrainingSegmentStarts = (
  chapterDurations: number[],
): number[] => {
  const segments = [INTRO_FRAMES, ...chapterDurations, OUTRO_FRAMES];
  const starts: number[] = [0];
  for (let i = 1; i < segments.length; i++) {
    starts.push(starts[i - 1]! + segments[i - 1]! - TRANSITION_FRAMES);
  }
  return starts;
};

export const getChapterVoiceoverStart = (
  chapterIndex: number,
  chapterDurations: number[],
): number => {
  const starts = computeTrainingSegmentStarts(chapterDurations);
  return starts[chapterIndex + 1]! + CHAPTER_INTRO_FRAMES;
};
