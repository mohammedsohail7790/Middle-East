import { TransitionSeries } from "@remotion/transitions";
import { slide } from "@remotion/transitions/slide";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { brand, copy } from "../brand";
import { CallIqLogo } from "../components/CallIqLogo";
import { CTAButton } from "../components/CTAButton";
import { DashboardMockUI } from "../components/DashboardMockUI";
import { PhoneMockup } from "../components/PhoneMockup";
import { SceneBackground } from "../components/SceneBackground";
import { BackgroundMusic } from "../lib/audio";
import { transitionTiming } from "../lib/duration";
import { fontFamily } from "../lib/fonts";

const SCENES = [150, 190, 200, 204, 204] as const;

const TextOverlay: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 12], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        top: 80,
        left: 0,
        right: 0,
        textAlign: "center",
        fontFamily,
        fontSize: 32,
        fontWeight: 700,
        color: brand.colors.white,
        opacity,
        padding: "0 32px",
      }}
    >
      {text}
    </div>
  );
};

const IntroScene = () => (
  <AbsoluteFill>
    <SceneBackground variant="gradient" />
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
      }}
    >
      <CallIqLogo size="lg" />
      <div
        style={{
          fontFamily,
          fontSize: 24,
          color: brand.colors.muted,
          textAlign: "center",
          padding: "0 40px",
        }}
      >
        Your AI receptionist dashboard
      </div>
    </div>
  </AbsoluteFill>
);

const ScreenScene: React.FC<{
  screen: "calls" | "leads" | "analytics";
  overlay: string;
}> = ({ screen, overlay }) => (
  <AbsoluteFill>
    <SceneBackground />
    <TextOverlay text={overlay} />
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        paddingTop: 60,
      }}
    >
      <PhoneMockup enterFrom="right">
        <DashboardMockUI screen={screen} />
      </PhoneMockup>
    </div>
  </AbsoluteFill>
);

const DownloadCTAScene = () => (
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
        gap: 32,
        padding: 48,
      }}
    >
      <CallIqLogo size="md" />
      <div
        style={{
          fontFamily,
          fontSize: 36,
          fontWeight: 800,
          color: brand.colors.white,
          textAlign: "center",
        }}
      >
        Ready to transform your calls?
      </div>
      <CTAButton label={copy.downloadCta} />
      <div style={{ fontFamily, fontSize: 20, color: brand.colors.cyan }}>
        {brand.website}
      </div>
    </div>
  </AbsoluteFill>
);

export const Walkthrough30s = () => (
  <AbsoluteFill>
    <BackgroundMusic volume={0.3} />
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={SCENES[0]}>
        <IntroScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-bottom" })}
        timing={transitionTiming}
      />
      <TransitionSeries.Sequence durationInFrames={SCENES[1]}>
        <ScreenScene screen="calls" overlay="Track every call in real time" />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={transitionTiming}
      />
      <TransitionSeries.Sequence durationInFrames={SCENES[2]}>
        <ScreenScene screen="leads" overlay="Capture and qualify leads instantly" />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-left" })}
        timing={transitionTiming}
      />
      <TransitionSeries.Sequence durationInFrames={SCENES[3]}>
        <ScreenScene screen="analytics" overlay="Insights that drive growth" />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-bottom" })}
        timing={transitionTiming}
      />
      <TransitionSeries.Sequence durationInFrames={SCENES[4]}>
        <DownloadCTAScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  </AbsoluteFill>
);
