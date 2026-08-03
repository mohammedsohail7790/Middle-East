import type { ReactNode } from "react";
import { distributeChapterDurations } from "./duration";
import type { TrainingChapter } from "./types";

type ChapterDef = {
  title: string;
  narration: string;
  content: ReactNode;
  lowerThird?: { label: string; detail?: string };
};

export const buildChapters = (
  totalFrames: number,
  defs: ChapterDef[],
): TrainingChapter[] => {
  const durations = distributeChapterDurations(totalFrames, defs.length);
  return defs.map((def, i) => ({
    number: i + 1,
    title: def.title,
    narration: def.narration,
    content: def.content,
    durationInFrames: durations[i],
    lowerThird: def.lowerThird,
  }));
};
