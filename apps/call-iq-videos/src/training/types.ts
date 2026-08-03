import type { ReactNode } from "react";
import type { TrainingVideoId } from "./voiceover";

export type TrainingChapter = {
  number: number;
  title: string;
  narration: string;
  content: ReactNode;
  durationInFrames: number;
  lowerThird?: { label: string; detail?: string };
};

export type TrainingVideoConfig = {
  title: string;
  videoId: TrainingVideoId;
  chapters: TrainingChapter[];
  totalFrames: number;
};
