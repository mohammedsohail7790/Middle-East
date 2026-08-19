import { TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { brand, copy } from "../brand";
import { HallaAiLogo } from "../components/HallaAiLogo";
import { CTAButton } from "../components/CTAButton";
import { SceneBackground } from "../components/SceneBackground";
import { BackgroundMusic } from "../lib/audio";
import { transitionTiming } from "../lib/duration";
import { fontFamily } from "../lib/fonts";

const SCENES = [180, 180, 190, 194, 204] as const;

const Subtitle: React.FC<{ text: string; delay?: number }> = ({
  text,
  delay = 0,
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [delay, delay + 15], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        bottom: 60,
        left: 0,
        right: 0,
        textAlign: "center",
        fontFamily,
        fontSize: 28,
        fontWeight: 600,
        color: brand.colors.white,
        background: `${brand.colors.dark}CC`,
        padding: "16px 32px",
        opacity,
      }}
    >
      {text}
    </div>
  );
};

const ProblemScene = () => {
  const frame = useCurrentFrame();
  const ringScale = interpolate(frame, [20, 50], [0.5, 1.5], {
    extrapolateRight: "clamp",
  });
  const ringOpacity = interpolate(frame, [20, 50], [0.8, 0], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill>
      <SceneBackground variant="default" />
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 80,
          padding: 80,
        }}
      >
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontSize: 80, marginBottom: 20 }}>📵</div>
          <div
            style={{
              fontFamily,
              fontSize: 36,
              fontWeight: 800,
              color: brand.colors.white,
            }}
          >
            The Problem
          </div>
          <div
            style={{
              fontFamily,
              fontSize: 22,
              color: brand.colors.muted,
              marginTop: 16,
              lineHeight: 1.5,
            }}
          >
            {copy.explainerProblem}
          </div>
        </div>
        <div style={{ position: "relative", flex: 1, textAlign: "center" }}>
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              width: 200,
              height: 200,
              borderRadius: "50%",
              border: `3px solid ${brand.colors.cyan}`,
              transform: `translate(-50%, -50%) scale(${ringScale})`,
              opacity: ringOpacity,
            }}
          />
          <div style={{ fontSize: 100 }}>📞</div>
          <div
            style={{
              fontFamily,
              fontSize: 48,
              fontWeight: 900,
              color: "#EF4444",
              marginTop: 12,
            }}
          >
            MISSED
          </div>
        </div>
      </div>
      <Subtitle text={copy.explainerProblem} />
    </AbsoluteFill>
  );
};

const StepScene: React.FC<{
  step: number;
  title: string;
  description: string;
}> = ({ step, title, description }) => {
  const frame = useCurrentFrame();
  const barWidth = interpolate(frame, [10, 40], [0, 100], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill>
      <SceneBackground variant="gradient" />
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          padding: "0 120px",
          gap: 60,
        }}
      >
        <div
          style={{
            width: 100,
            height: 100,
            borderRadius: "50%",
            background: brand.colors.cyan,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily,
            fontSize: 48,
            fontWeight: 900,
            color: brand.colors.dark,
            flexShrink: 0,
          }}
        >
          {step}
        </div>
        <div>
          <div
            style={{
              fontFamily,
              fontSize: 40,
              fontWeight: 800,
              color: brand.colors.white,
              marginBottom: 16,
            }}
          >
            {title}
          </div>
          <div
            style={{
              fontFamily,
              fontSize: 24,
              color: brand.colors.muted,
              lineHeight: 1.5,
              maxWidth: 700,
            }}
          >
            {description}
          </div>
          <div
            style={{
              marginTop: 24,
              height: 6,
              width: 400,
              background: brand.colors.gray,
              borderRadius: 3,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${barWidth}%`,
                height: "100%",
                background: brand.colors.cyan,
              }}
            />
          </div>
        </div>
      </div>
      <Subtitle text={description} delay={5} />
    </AbsoluteFill>
  );
};

const OutroScene = () => (
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
      }}
    >
      <HallaAiLogo size="lg" />
      <div
        style={{
          fontFamily,
          fontSize: 32,
          color: brand.colors.white,
          fontWeight: 600,
        }}
      >
        {copy.solution}
      </div>
      <CTAButton label={copy.cta} />
      <Subtitle text={brand.website} delay={0} />
    </div>
  </AbsoluteFill>
);

export const Explainer30s = () => (
  <AbsoluteFill>
    <BackgroundMusic volume={0.25} />
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={SCENES[0]}>
        <ProblemScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={transitionTiming}
      />
      <TransitionSeries.Sequence durationInFrames={SCENES[1]}>
        <StepScene
          step={1}
          title="AI Answers Instantly"
          description={copy.explainerSteps[0]}
        />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={transitionTiming}
      />
      <TransitionSeries.Sequence durationInFrames={SCENES[2]}>
        <StepScene
          step={2}
          title="Qualify & Book"
          description={copy.explainerSteps[1]}
        />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={transitionTiming}
      />
      <TransitionSeries.Sequence durationInFrames={SCENES[3]}>
        <StepScene
          step={3}
          title="Dashboard Insights"
          description={copy.explainerSteps[2]}
        />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={transitionTiming}
      />
      <TransitionSeries.Sequence durationInFrames={SCENES[4]}>
        <OutroScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  </AbsoluteFill>
);
