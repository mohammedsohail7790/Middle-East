import { TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { wipe } from "@remotion/transitions/wipe";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { brand, benefits, copy } from "../brand";
import { BenefitIcon } from "../components/BenefitIcon";
import { HallaAiLogo } from "../components/HallaAiLogo";
import { CTAButton } from "../components/CTAButton";
import { FeaturePhoneScreen } from "../components/FeaturePhoneScreen";
import { PhoneMockup } from "../components/PhoneMockup";
import { SceneBackground } from "../components/SceneBackground";
import { BackgroundMusic } from "../lib/audio";
import { linearTiming } from "@remotion/transitions";
import { fontFamily } from "../lib/fonts";

const FAST_TRANSITION = linearTiming({ durationInFrames: 10 });
const SCENES = [60, 120, 180, 120] as const;

const HookScene = () => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, 20], [1.2, 1], {
    extrapolateRight: "clamp",
  });
  const opacity = interpolate(frame, [0, 8], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill>
      <SceneBackground variant="cyan-glow" />
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 40,
          opacity,
          transform: `scale(${scale})`,
        }}
      >
        <div
          style={{
            fontFamily,
            fontSize: 64,
            fontWeight: 900,
            color: brand.colors.white,
            textAlign: "center",
            lineHeight: 1.1,
          }}
        >
          STOP
          <br />
          <span style={{ color: brand.colors.cyan }}>MISSING</span>
          <br />
          CALLS
        </div>
      </div>
    </AbsoluteFill>
  );
};

const ProductScene = () => (
  <AbsoluteFill>
    <SceneBackground />
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <PhoneMockup enterFrom="scale">
        <FeaturePhoneScreen
          title="Halla AI"
          icon="🤖"
          lines={[
            "AI answering live call...",
            "Qualifying lead in real-time",
            "Booking confirmed ✓",
          ]}
        />
      </PhoneMockup>
    </div>
  </AbsoluteFill>
);

const BenefitsScene = () => (
  <AbsoluteFill>
    <SceneBackground variant="gradient" />
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "0 40px",
      }}
    >
      <BenefitIcon
        icon="phone"
        title={benefits[0].title}
        subtitle={benefits[0].subtitle}
        index={0}
      />
      <BenefitIcon
        icon="users"
        title={benefits[1].title}
        subtitle={benefits[1].subtitle}
        index={1}
      />
      <BenefitIcon
        icon="clock"
        title={benefits[2].title}
        subtitle={benefits[2].subtitle}
        index={2}
      />
    </div>
  </AbsoluteFill>
);

const LogoCTAScene = () => (
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
        gap: 36,
      }}
    >
      <HallaAiLogo size="lg" />
      <CTAButton label={copy.ctaShort} />
    </div>
  </AbsoluteFill>
);

export const SocialAd15s = () => (
  <AbsoluteFill>
    <BackgroundMusic volume={0.4} />
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={SCENES[0]}>
        <HookScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={wipe({ direction: "from-left" })}
        timing={FAST_TRANSITION}
      />
      <TransitionSeries.Sequence durationInFrames={SCENES[1]}>
        <ProductScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={FAST_TRANSITION}
      />
      <TransitionSeries.Sequence durationInFrames={SCENES[2]}>
        <BenefitsScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={wipe({ direction: "from-right" })}
        timing={FAST_TRANSITION}
      />
      <TransitionSeries.Sequence durationInFrames={SCENES[3]}>
        <LogoCTAScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  </AbsoluteFill>
);
