import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { SceneBackground } from "../components/SceneBackground";
import { VignetteOverlay } from "../components/EnterpriseOverlay";
import { TRANSITION_FRAMES, transitionTiming } from "../lib/duration";
import { ChapterIntro } from "./ChapterIntro";
import { IntroBumper } from "./IntroBumper";
import { LowerThird } from "./LowerThird";
import { NarrationBar } from "./NarrationBar";
import { OutroBumper } from "./OutroBumper";
import { ProgressHeader } from "./ProgressHeader";
import { TrainingAudio } from "./TrainingAudio";
import { INTRO_FRAMES, OUTRO_FRAMES } from "./duration";
import { CHAPTER_INTRO_FRAMES } from "./timing";
import type { TrainingVideoConfig } from "./types";

type TrainingVideoProps = {
  config: TrainingVideoConfig;
};

const ChapterSequence: React.FC<{
  chapterNumber: number;
  totalChapters: number;
  title: string;
  narration: string;
  videoTitle: string;
  durationInFrames: number;
  lowerThird?: { label: string; detail?: string };
  children: React.ReactNode;
}> = ({
  chapterNumber,
  totalChapters,
  title,
  narration,
  videoTitle,
  durationInFrames,
  lowerThird,
  children,
}) => {
  const contentFrames = durationInFrames - CHAPTER_INTRO_FRAMES;

  return (
    <AbsoluteFill>
      <Sequence durationInFrames={CHAPTER_INTRO_FRAMES}>
        <ChapterIntro
          number={chapterNumber}
          title={title}
          totalChapters={totalChapters}
        />
      </Sequence>
      <Sequence from={CHAPTER_INTRO_FRAMES} durationInFrames={contentFrames}>
        <AbsoluteFill>
          <SceneBackground variant="gradient" />
          <ProgressHeader
            videoTitle={videoTitle}
            chapterNumber={chapterNumber}
            totalChapters={totalChapters}
            chapterTitle={title}
          />
          <div
            style={{
              position: "absolute",
              inset: "72px 40px 100px",
            }}
          >
            {children}
          </div>
          {lowerThird ? (
            <LowerThird label={lowerThird.label} detail={lowerThird.detail} />
          ) : null}
          <NarrationBar text={narration} />
          <VignetteOverlay />
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
};

export const TrainingVideo: React.FC<TrainingVideoProps> = ({ config }) => {
  const { title, chapters, videoId } = config;
  const totalChapters = chapters.length;

  return (
    <AbsoluteFill>
      <TrainingAudio videoId={videoId} chapters={chapters} />
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={INTRO_FRAMES}>
          <IntroBumper />
        </TransitionSeries.Sequence>

        {chapters.map((chapter) => (
          <React.Fragment key={chapter.number}>
            <TransitionSeries.Transition
              presentation={fade()}
              timing={transitionTiming}
            />
            <TransitionSeries.Sequence
              durationInFrames={chapter.durationInFrames}
            >
              <ChapterSequence
                chapterNumber={chapter.number}
                totalChapters={totalChapters}
                title={chapter.title}
                narration={chapter.narration}
                videoTitle={title}
                durationInFrames={chapter.durationInFrames}
                lowerThird={chapter.lowerThird}
              >
                {chapter.content}
              </ChapterSequence>
            </TransitionSeries.Sequence>
          </React.Fragment>
        ))}

        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
        />
        <TransitionSeries.Sequence durationInFrames={OUTRO_FRAMES}>
          <OutroBumper />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
