import { Audio } from "@remotion/media";
import { Sequence, staticFile } from "remotion";
import {
  CINEMATIC_SCENE_STARTS,
  CINEMATIC_VOICEOVERS,
  SCENE_FRAMES,
  TRANSITION,
  VOICEOVER_DELAY,
} from "./voiceover";

const TRANSITION_FRAMES = (() => {
  const frames: number[] = [];
  let pos = 0;
  for (let i = 0; i < SCENE_FRAMES.length - 1; i++) {
    pos += SCENE_FRAMES[i]! - TRANSITION;
    frames.push(pos);
  }
  return frames;
})();

export const CinematicAudio = () => (
  <>
    <Audio src={staticFile("audio/background-music.wav")} volume={0.2} />
    {TRANSITION_FRAMES.map((from) => (
      <Sequence key={from} from={from} layout="none">
        <Audio src={staticFile("audio/transition-sfx.wav")} volume={0.32} />
      </Sequence>
    ))}
    {CINEMATIC_VOICEOVERS.map((file, i) => (
      <Sequence
        key={file}
        from={CINEMATIC_SCENE_STARTS[i]! + VOICEOVER_DELAY}
        layout="none"
      >
        <Audio src={staticFile(file)} volume={0.95} />
      </Sequence>
    ))}
  </>
);
