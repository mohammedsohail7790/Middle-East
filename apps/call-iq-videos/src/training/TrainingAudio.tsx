import { Audio } from "@remotion/media";
import { Sequence, staticFile } from "remotion";
import type { TrainingChapter } from "./types";
import { getChapterVoiceoverStart } from "./timing";
import { getChapterVoiceover, type TrainingVideoId } from "./voiceover";

type TrainingAudioProps = {
  videoId: TrainingVideoId;
  chapters: TrainingChapter[];
};

/** Top-level audio tracks — nested Audio inside TransitionSeries often fails to encode. */
export const TrainingAudio: React.FC<TrainingAudioProps> = ({
  videoId,
  chapters,
}) => {
  const durations = chapters.map((c) => c.durationInFrames);

  return (
    <>
      {chapters.map((chapter, i) => (
        <Sequence
          key={chapter.number}
          from={getChapterVoiceoverStart(i, durations)}
          layout="none"
        >
          <Audio
            src={staticFile(getChapterVoiceover(videoId, chapter.number))}
            volume={1}
          />
        </Sequence>
      ))}
    </>
  );
};
