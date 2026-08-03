import { TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
} from "remotion";
import { brand, copy, features } from "../brand";
import { CallIqLogo } from "../components/CallIqLogo";
import { CTAButton } from "../components/CTAButton";
import { FeaturePhoneScreen } from "../components/FeaturePhoneScreen";
import { PhoneMockup } from "../components/PhoneMockup";
import { SceneBackground } from "../components/SceneBackground";
import { BackgroundMusic, TransitionSfx } from "../lib/audio";
import { transitionTiming } from "../lib/duration";
import { fontFamily } from "../lib/fonts";

const SCENES = [100, 100, 110, 110, 110, 130] as const;

const transitionFrames = [SCENES[0], SCENES[0] + SCENES[1] - 12];

const HookScene = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  });
  const shake = Math.sin(frame / 3) * 2;

  return (
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
          padding: 48,
          opacity,
          transform: `translateX(${shake}px)`,
        }}
      >
        <div
          style={{
            fontFamily,
            fontSize: 52,
            fontWeight: 800,
            color: brand.colors.white,
            textAlign: "center",
            lineHeight: 1.15,
          }}
        >
          {copy.hook}
        </div>
        <div
          style={{
            fontFamily,
            fontSize: 22,
            color: brand.colors.muted,
            marginTop: 24,
            textAlign: "center",
          }}
        >
          {copy.problem}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const BrandScene = () => (
  <AbsoluteFill>
    <SceneBackground variant="gradient" />
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <CallIqLogo size="lg" />
    </div>
  </AbsoluteFill>
);

const FeatureScene: React.FC<{
  feature: (typeof features)[number];
  icon: string;
  lines: string[];
}> = ({ feature, icon, lines }) => (
  <AbsoluteFill>
    <SceneBackground />
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 32,
        padding: 40,
      }}
    >
      <div
        style={{
          fontFamily,
          fontSize: 28,
          fontWeight: 700,
          color: brand.colors.white,
          textAlign: "center",
        }}
      >
        {feature.title}
      </div>
      <PhoneMockup enterFrom="bottom">
        <FeaturePhoneScreen title={feature.title} lines={lines} icon={icon} />
      </PhoneMockup>
    </div>
  </AbsoluteFill>
);

const CTAScene = () => (
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
        gap: 40,
      }}
    >
      <CallIqLogo size="md" showTagline />
      <CTAButton label={copy.ctaShort} />
      <div
        style={{
          fontFamily,
          fontSize: 18,
          color: brand.colors.muted,
        }}
      >
        {brand.website}
      </div>
    </div>
  </AbsoluteFill>
);

export const ProductDemo20s = () => (
  <AbsoluteFill>
    <BackgroundMusic />
    <TransitionSfx frames={transitionFrames} />
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={SCENES[0]}>
        <HookScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={transitionTiming}
      />
      <TransitionSeries.Sequence durationInFrames={SCENES[1]}>
        <BrandScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-bottom" })}
        timing={transitionTiming}
      />
      <TransitionSeries.Sequence durationInFrames={SCENES[2]}>
        <FeatureScene
          feature={features[0]}
          icon="🤖"
          lines={[
            "Incoming call detected...",
            "AI: Hello! Thanks for calling. How can I help?",
            "Caller: I'd like to book an appointment.",
          ]}
        />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={transitionTiming}
      />
      <TransitionSeries.Sequence durationInFrames={SCENES[3]}>
        <FeatureScene
          feature={features[1]}
          icon="📋"
          lines={[
            "Lead qualified: High intent",
            "Name: Sarah M. | Service: Consultation",
            "Synced to dashboard ✓",
          ]}
        />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={transitionTiming}
      />
      <TransitionSeries.Sequence durationInFrames={SCENES[4]}>
        <FeatureScene
          feature={features[2]}
          icon="📈"
          lines={[
            "47 calls today",
            "23 leads captured",
            "49% conversion rate",
          ]}
        />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={transitionTiming}
      />
      <TransitionSeries.Sequence durationInFrames={SCENES[5]}>
        <CTAScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  </AbsoluteFill>
);
