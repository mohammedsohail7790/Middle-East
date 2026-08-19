import { TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
} from "remotion";
import { brand, copy, features } from "../brand";
import { HallaAiLogo } from "../components/HallaAiLogo";
import { CTAButton } from "../components/CTAButton";
import { DashboardMockUI } from "../components/DashboardMockUI";
import { FeaturePhoneScreen } from "../components/FeaturePhoneScreen";
import { PhoneMockup } from "../components/PhoneMockup";
import { SceneBackground } from "../components/SceneBackground";
import { transitionTiming } from "../lib/duration";
import { fontFamily } from "../lib/fonts";

/** Scene lengths — sum 1896 minus 8×12 transition frames = 1800 (60s @ 30fps). */
const SCENES = [200, 150, 220, 180, 220, 220, 220, 200, 286] as const;

const fadeIn = (frame: number, start = 0, duration = 18) =>
  interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

const slideUp = (frame: number, start = 0, duration = 22) =>
  interpolate(frame, [start, start + duration], [28, 0], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

const MinimalLabel: React.FC<{ children: string }> = ({ children }) => (
  <div
    style={{
      fontFamily,
      fontSize: 14,
      fontWeight: 600,
      letterSpacing: "0.2em",
      textTransform: "uppercase",
      color: brand.colors.cyan,
      marginBottom: 24,
    }}
  >
    {children}
  </div>
);

const HookScene = () => {
  const frame = useCurrentFrame();
  const opacity = fadeIn(frame);
  const y = slideUp(frame);

  return (
    <AbsoluteFill>
      <SceneBackground variant="default" />
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 160px",
          opacity,
          transform: `translateY(${y}px)`,
        }}
      >
        <MinimalLabel>Launch</MinimalLabel>
        <div
          style={{
            fontFamily,
            fontSize: 72,
            fontWeight: 800,
            color: brand.colors.white,
            textAlign: "center",
            lineHeight: 1.08,
            maxWidth: 1100,
          }}
        >
          {copy.hook}
        </div>
        <div
          style={{
            fontFamily,
            fontSize: 26,
            fontWeight: 400,
            color: brand.colors.muted,
            marginTop: 32,
            textAlign: "center",
            maxWidth: 720,
            lineHeight: 1.5,
          }}
        >
          {copy.problem}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const BrandScene = () => {
  const frame = useCurrentFrame();
  const lineWidth = interpolate(frame, [20, 50], [0, 120], {
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
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        <HallaAiLogo size="lg" />
        <div
          style={{
            width: lineWidth,
            height: 2,
            background: brand.colors.cyan,
            marginTop: 8,
            borderRadius: 1,
          }}
        />
        <div
          style={{
            fontFamily,
            fontSize: 20,
            fontWeight: 500,
            color: brand.colors.muted,
            letterSpacing: "0.12em",
            marginTop: 16,
            opacity: fadeIn(frame, 30),
          }}
        >
          {brand.tagline}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const ProblemScene = () => {
  const frame = useCurrentFrame();
  const statOpacity = fadeIn(frame, 10);
  const statScale = interpolate(frame, [10, 35], [0.92, 1], {
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  return (
    <AbsoluteFill>
      <SceneBackground variant="default" />
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 120px",
        }}
      >
        <MinimalLabel>The problem</MinimalLabel>
        <div
          style={{
            opacity: statOpacity,
            transform: `scale(${statScale})`,
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontFamily,
              fontSize: 160,
              fontWeight: 900,
              color: brand.colors.cyan,
              lineHeight: 1,
            }}
          >
            62%
          </div>
          <div
            style={{
              fontFamily,
              fontSize: 36,
              fontWeight: 600,
              color: brand.colors.white,
              marginTop: 20,
              maxWidth: 640,
              lineHeight: 1.35,
            }}
          >
            {copy.explainerProblem}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const SolutionScene = () => {
  const frame = useCurrentFrame();

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
          padding: "0 140px",
          opacity: fadeIn(frame),
          transform: `translateY(${slideUp(frame)}px)`,
        }}
      >
        <MinimalLabel>The solution</MinimalLabel>
        <div
          style={{
            fontFamily,
            fontSize: 48,
            fontWeight: 700,
            color: brand.colors.white,
            textAlign: "center",
            lineHeight: 1.25,
            maxWidth: 900,
          }}
        >
          {copy.solution}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const SplitFeatureScene: React.FC<{
  label: string;
  title: string;
  description: string;
  visual: React.ReactNode;
}> = ({ label, title, description, visual }) => {
  const frame = useCurrentFrame();
  const textOpacity = fadeIn(frame, 0);
  const visualOpacity = fadeIn(frame, 12);

  return (
    <AbsoluteFill>
      <SceneBackground variant="default" />
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          padding: "0 100px",
          gap: 80,
        }}
      >
        <div style={{ flex: 1, opacity: textOpacity, transform: `translateY(${slideUp(frame)}px)` }}>
          <MinimalLabel>{label}</MinimalLabel>
          <div
            style={{
              fontFamily,
              fontSize: 44,
              fontWeight: 800,
              color: brand.colors.white,
              lineHeight: 1.15,
              marginBottom: 20,
            }}
          >
            {title}
          </div>
          <div
            style={{
              fontFamily,
              fontSize: 22,
              color: brand.colors.muted,
              lineHeight: 1.55,
              maxWidth: 480,
            }}
          >
            {description}
          </div>
        </div>
        <div style={{ flex: "0 0 auto", opacity: visualOpacity }}>{visual}</div>
      </div>
    </AbsoluteFill>
  );
};

const IntegrationsScene = () => {
  const frame = useCurrentFrame();
  const integrations = [
    "HubSpot",
    "Salesforce",
    "Google Calendar",
    "Zoho CRM",
    "Twilio",
    "Stripe",
  ];

  return (
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
          padding: "0 120px",
        }}
      >
        <MinimalLabel>Integrations</MinimalLabel>
        <div
          style={{
            fontFamily,
            fontSize: 40,
            fontWeight: 800,
            color: brand.colors.white,
            textAlign: "center",
            marginBottom: 48,
            opacity: fadeIn(frame),
          }}
        >
          Connect in minutes, not weeks
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 20,
            width: "100%",
            maxWidth: 900,
          }}
        >
          {integrations.map((name, i) => {
            const delay = i * 6;
            const opacity = fadeIn(frame, delay, 14);
            const y = slideUp(frame, delay, 18);
            return (
              <div
                key={name}
                style={{
                  fontFamily,
                  fontSize: 18,
                  fontWeight: 600,
                  color: brand.colors.white,
                  background: `${brand.colors.gray}`,
                  border: `1px solid ${brand.colors.grayLight}`,
                  borderRadius: 12,
                  padding: "20px 24px",
                  textAlign: "center",
                  opacity,
                  transform: `translateY(${y}px)`,
                }}
              >
                {name}
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const CTAScene = () => {
  const frame = useCurrentFrame();

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
          gap: 36,
          opacity: fadeIn(frame),
        }}
      >
        <HallaAiLogo size="lg" showTagline />
        <div
          style={{
            fontFamily,
            fontSize: 28,
            fontWeight: 600,
            color: brand.colors.white,
            textAlign: "center",
            maxWidth: 720,
            lineHeight: 1.4,
          }}
        >
          Your AI receptionist is ready — start free today
        </div>
        <CTAButton label={copy.ctaShort} />
        <div
          style={{
            fontFamily,
            fontSize: 18,
            color: brand.colors.muted,
            letterSpacing: "0.04em",
          }}
        >
          {brand.website}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const Launch60s = () => (
  <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={SCENES[0]}>
        <HookScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={transitionTiming} />
      <TransitionSeries.Sequence durationInFrames={SCENES[1]}>
        <BrandScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={transitionTiming} />
      <TransitionSeries.Sequence durationInFrames={SCENES[2]}>
        <ProblemScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={transitionTiming} />
      <TransitionSeries.Sequence durationInFrames={SCENES[3]}>
        <SolutionScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={transitionTiming} />
      <TransitionSeries.Sequence durationInFrames={SCENES[4]}>
        <SplitFeatureScene
          label="Feature"
          title={features[0].title}
          description={features[0].description}
          visual={
            <PhoneMockup enterFrom="scale">
              <FeaturePhoneScreen
                title="Live call"
                icon="🤖"
                lines={[
                  "Incoming call...",
                  "AI: How can I help you today?",
                  "Caller: Book a consultation.",
                ]}
              />
            </PhoneMockup>
          }
        />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={transitionTiming} />
      <TransitionSeries.Sequence durationInFrames={SCENES[5]}>
        <SplitFeatureScene
          label="Feature"
          title={features[1].title}
          description={features[1].description}
          visual={
            <div
              style={{
                width: 320,
                height: 520,
                borderRadius: 24,
                overflow: "hidden",
                border: `1px solid ${brand.colors.grayLight}`,
              }}
            >
              <DashboardMockUI screen="leads" />
            </div>
          }
        />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={transitionTiming} />
      <TransitionSeries.Sequence durationInFrames={SCENES[6]}>
        <SplitFeatureScene
          label="Feature"
          title={features[2].title}
          description={features[2].description}
          visual={
            <div
              style={{
                width: 320,
                height: 520,
                borderRadius: 24,
                overflow: "hidden",
                border: `1px solid ${brand.colors.grayLight}`,
              }}
            >
              <DashboardMockUI screen="analytics" />
            </div>
          }
        />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={transitionTiming} />
      <TransitionSeries.Sequence durationInFrames={SCENES[7]}>
        <IntegrationsScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={transitionTiming} />
      <TransitionSeries.Sequence durationInFrames={SCENES[8]}>
        <CTAScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  </AbsoluteFill>
);
