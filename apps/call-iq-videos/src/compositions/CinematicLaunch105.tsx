import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { AbsoluteFill } from "remotion";
import {
  AIAnswersScene,
  AppointmentScene,
  DashboardScene,
  FinaleScene,
  IndustriesScene,
  IntegrationsScene,
  IntroScene,
  LeadCaptureScene,
  ProblemScene,
  ResultsScene,
} from "../cinematic/scenes";
import { CinematicAudio } from "../cinematic/CinematicAudio";
import {
  CINEMATIC_LAUNCH_DURATION,
  SCENE_FRAMES,
  TRANSITION,
} from "../cinematic/timing";
import { brand } from "../brand";

const proTiming = linearTiming({ durationInFrames: TRANSITION });

export { CINEMATIC_LAUNCH_DURATION };

export const CinematicLaunch105 = () => (
  <AbsoluteFill style={{ background: brand.colors.dark }}>
    <CinematicAudio />
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={SCENE_FRAMES[0]}>
        <ProblemScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={proTiming} />
      <TransitionSeries.Sequence durationInFrames={SCENE_FRAMES[1]}>
        <IntroScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={wipe({ direction: "from-left" })} timing={proTiming} />
      <TransitionSeries.Sequence durationInFrames={SCENE_FRAMES[2]}>
        <AIAnswersScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={proTiming} />
      <TransitionSeries.Sequence durationInFrames={SCENE_FRAMES[3]}>
        <LeadCaptureScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={proTiming} />
      <TransitionSeries.Sequence durationInFrames={SCENE_FRAMES[4]}>
        <AppointmentScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={wipe({ direction: "from-bottom" })} timing={proTiming} />
      <TransitionSeries.Sequence durationInFrames={SCENE_FRAMES[5]}>
        <DashboardScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-left" })} timing={proTiming} />
      <TransitionSeries.Sequence durationInFrames={SCENE_FRAMES[6]}>
        <IntegrationsScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={wipe({ direction: "from-top" })} timing={proTiming} />
      <TransitionSeries.Sequence durationInFrames={SCENE_FRAMES[7]}>
        <IndustriesScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={proTiming} />
      <TransitionSeries.Sequence durationInFrames={SCENE_FRAMES[8]}>
        <ResultsScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={wipe({ direction: "from-left" })} timing={proTiming} />
      <TransitionSeries.Sequence durationInFrames={SCENE_FRAMES[9]}>
        <FinaleScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  </AbsoluteFill>
);

export const CallIQLabsCinematic = CinematicLaunch105;
