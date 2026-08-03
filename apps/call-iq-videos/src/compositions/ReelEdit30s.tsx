import { TransitionSeries } from "@remotion/transitions";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
} from "remotion";
import { brand, copy } from "../brand";
import { BoldSubtitle } from "../components/BoldSubtitle";
import { CallIqLogo } from "../components/CallIqLogo";
import { FeaturePhoneScreen } from "../components/FeaturePhoneScreen";
import { PhoneMockup } from "../components/PhoneMockup";
import { SceneBackground } from "../components/SceneBackground";
import { BackgroundMusic } from "../lib/audio";
import { linearTiming } from "@remotion/transitions";
import { fontFamily } from "../lib/fonts";

const REEL_TRANSITION = linearTiming({ durationInFrames: 8 });
const SCENES = [60, 168, 172, 176, 180, 184] as const;

const reelClips = [
  { subtitle: "POV: You never miss a call again", bg: "cyan-glow" as const },
  { subtitle: "AI picks up in 0.5 seconds", bg: "default" as const },
  { subtitle: "Qualifies leads while you sleep", bg: "gradient" as const },
  { subtitle: "Books appointments automatically", bg: "default" as const },
  { subtitle: "Real-time dashboard updates", bg: "gradient" as const },
];

const MockVideoClip: React.FC<{
  clipIndex: number;
  showPhone?: boolean;
}> = ({ clipIndex, showPhone = true }) => {
  const frame = useCurrentFrame();
  const zoom = 1 + interpolate(frame, [0, 30], [0, 0.05], {
    extrapolateRight: "clamp",
  });
  const clip = reelClips[clipIndex % reelClips.length];

  return (
    <AbsoluteFill>
      <SceneBackground variant={clip.bg} />
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `scale(${zoom})`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {showPhone ? (
          <PhoneMockup enterFrom="scale" delay={0}>
            <FeaturePhoneScreen
              title="Call IQ"
              icon={clipIndex % 2 === 0 ? "🤖" : "📊"}
              lines={[
                "Live call in progress...",
                "AI handling conversation",
                "Lead captured ✓",
              ]}
            />
          </PhoneMockup>
        ) : (
          <CallIqLogo size="lg" />
        )}
      </div>
      <BoldSubtitle text={clip.subtitle} size={38} position="bottom" />
    </AbsoluteFill>
  );
};

const HookOverlay = () => {
  const frame = useCurrentFrame();
  const opacity =
    frame < 50
      ? interpolate(frame, [0, 8], [0, 1], { extrapolateRight: "clamp" })
      : interpolate(frame, [50, 60], [1, 0], {
          extrapolateRight: "clamp",
          extrapolateLeft: "clamp",
        });

  return (
    <AbsoluteFill style={{ opacity }}>
      <SceneBackground variant="cyan-glow" />
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 20,
        }}
      >
        <div
          style={{
            fontFamily,
            fontSize: 56,
            fontWeight: 900,
            color: brand.colors.white,
            textAlign: "center",
            padding: "0 32px",
            lineHeight: 1.1,
          }}
        >
          {copy.reelHook}
        </div>
        <div
          style={{
            fontFamily,
            fontSize: 22,
            color: brand.colors.cyan,
            fontWeight: 600,
          }}
        >
          {brand.tagline}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const FinalClip = () => (
  <AbsoluteFill>
    <SceneBackground variant="cyan-glow" />
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 28,
      }}
    >
      <CallIqLogo size="lg" />
      <BoldSubtitle
        text={`Follow @calliq · ${brand.website}`}
        size={28}
        position="center"
        highlight={false}
      />
    </div>
  </AbsoluteFill>
);

export const ReelEdit30s = () => (
  <AbsoluteFill>
    <BackgroundMusic volume={0.45} />
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={SCENES[0]}>
        <HookOverlay />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={wipe({ direction: "from-top" })}
        timing={REEL_TRANSITION}
      />
      <TransitionSeries.Sequence durationInFrames={SCENES[1]}>
        <MockVideoClip clipIndex={0} />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-left" })}
        timing={REEL_TRANSITION}
      />
      <TransitionSeries.Sequence durationInFrames={SCENES[2]}>
        <MockVideoClip clipIndex={1} />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={wipe({ direction: "from-right" })}
        timing={REEL_TRANSITION}
      />
      <TransitionSeries.Sequence durationInFrames={SCENES[3]}>
        <MockVideoClip clipIndex={2} />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-bottom" })}
        timing={REEL_TRANSITION}
      />
      <TransitionSeries.Sequence durationInFrames={SCENES[4]}>
        <MockVideoClip clipIndex={3} showPhone />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={wipe({ direction: "from-left" })}
        timing={REEL_TRANSITION}
      />
      <TransitionSeries.Sequence durationInFrames={SCENES[5]}>
        <FinalClip />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  </AbsoluteFill>
);
