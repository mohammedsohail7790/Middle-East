import { Audio } from "@remotion/media";
import { Sequence, staticFile } from "remotion";

type BackgroundMusicProps = {
  volume?: number;
};

export const BackgroundMusic: React.FC<BackgroundMusicProps> = ({
  volume = 0.35,
}) => (
  <Audio src={staticFile("audio/background-music.mp3")} volume={volume} />
);

type TransitionSfxProps = {
  frames: number[];
  volume?: number;
};

export const TransitionSfx: React.FC<TransitionSfxProps> = ({
  frames,
  volume = 0.5,
}) => (
  <>
    {frames.map((from) => (
      <Sequence key={from} from={from} layout="none">
        <Audio
          src={staticFile("audio/transition-sfx.mp3")}
          volume={volume}
        />
      </Sequence>
    ))}
  </>
);
