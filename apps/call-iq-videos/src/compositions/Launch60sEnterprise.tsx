import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { brand, copy, features } from "../brand";
import { HallaAiLogo } from "../components/HallaAiLogo";
import { CTAButton } from "../components/CTAButton";
import { ProductMockScene } from "../components/ProductMockScene";
import {
  EnterpriseHeadline,
  EnterpriseLabel,
  EnterpriseSubtext,
  GlassPanel,
  ScanLineOverlay,
  VignetteOverlay,
} from "../components/EnterpriseOverlay";
import { fade as motionFade, scaleIn } from "../lib/motion";
import { fontFamily } from "../lib/fonts";
import { DashboardOverviewScreen } from "../training/screens/DashboardOverviewScreen";
import { FeatureScreen } from "../training/screens/FeatureScreen";
import { EnterpriseBackground } from "../three/EnterpriseBackground";
import { IntegrationOrbit3D } from "../three/IntegrationOrbit3D";
import { PhoneDevice3D } from "../three/PhoneDevice3D";
import { StatRing3D } from "../three/StatRing3D";

const TRANSITION = 20;
/** Scene sum 1940 − 7×20 = 1800 frames (60s @ 30fps) */
const SCENES = [200, 140, 280, 200, 180, 220, 220, 240, 260] as const;

const proTiming = linearTiming({ durationInFrames: TRANSITION });

const HookScene = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: "#050508" }}>
      <EnterpriseBackground frame={frame} variant="hero" />
      <AbsoluteFill
        style={{
          zIndex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 120px",
        }}
      >
        <GlassPanel frame={frame} style={{ textAlign: "center", maxWidth: 1040 }}>
          <EnterpriseLabel frame={frame}>Halla AI Launch</EnterpriseLabel>
          <EnterpriseHeadline frame={frame} size={68} align="center" maxWidth={920}>
            The AI receptionist built for enterprise teams
          </EnterpriseHeadline>
          <EnterpriseSubtext frame={frame} align="center" maxWidth={720} delay={14}>
            Answer every call. Capture every lead. Scale without adding headcount.
          </EnterpriseSubtext>
        </GlassPanel>
      </AbsoluteFill>
      <ScanLineOverlay frame={frame} />
      <VignetteOverlay />
    </AbsoluteFill>
  );
};

const BrandScene = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: "#050508" }}>
      <EnterpriseBackground frame={frame} variant="cta" />
      <AbsoluteFill
        style={{
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          transform: `scale(${scaleIn(frame, 6, 32)})`,
        }}
      >
        <HallaAiLogo size="lg" animate={false} showTagline={false} />
        <div
          style={{
            fontFamily,
            fontSize: 28,
            fontWeight: 700,
            color: brand.colors.white,
            marginTop: 24,
            letterSpacing: "0.06em",
            opacity: motionFade(frame, 20, 18),
          }}
        >
          {brand.tagline}
        </div>
      </AbsoluteFill>
      <VignetteOverlay />
    </AbsoluteFill>
  );
};

const ProblemScene = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      <StatRing3D frame={frame} value={62} />
      <AbsoluteFill style={{ zIndex: 1 }}>
        <div
          style={{
            position: "absolute",
            left: 96,
            top: "50%",
            transform: "translateY(-50%)",
            maxWidth: 520,
          }}
        >
          <GlassPanel frame={frame}>
            <EnterpriseLabel frame={frame}>The challenge</EnterpriseLabel>
            <EnterpriseHeadline frame={frame} size={108} delay={6}>
              62%
            </EnterpriseHeadline>
            <EnterpriseSubtext frame={frame} delay={14}>
              {copy.explainerProblem}
            </EnterpriseSubtext>
          </GlassPanel>
        </div>
      </AbsoluteFill>
      <VignetteOverlay />
    </AbsoluteFill>
  );
};

const SolutionScene = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: "#050508" }}>
      <EnterpriseBackground frame={frame} variant="cta" />
      <AbsoluteFill
        style={{
          zIndex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 120px",
        }}
      >
        <GlassPanel frame={frame} style={{ maxWidth: 960, textAlign: "center" }}>
          <EnterpriseLabel frame={frame}>The solution</EnterpriseLabel>
          <EnterpriseHeadline frame={frame} size={52} align="center" delay={6}>
            {copy.solution}
          </EnterpriseHeadline>
        </GlassPanel>
      </AbsoluteFill>
      <VignetteOverlay />
    </AbsoluteFill>
  );
};

const PhoneFeatureScene = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      <PhoneDevice3D frame={frame} />
      <AbsoluteFill style={{ zIndex: 1 }}>
        <div
          style={{
            position: "absolute",
            left: 88,
            top: "50%",
            transform: "translateY(-50%)",
            maxWidth: 480,
          }}
        >
          <GlassPanel frame={frame}>
            <EnterpriseLabel frame={frame}>Core capability</EnterpriseLabel>
            <EnterpriseHeadline frame={frame} size={42} delay={4}>
              {features[0].title}
            </EnterpriseHeadline>
            <EnterpriseSubtext frame={frame} delay={12}>
              {features[0].description}
            </EnterpriseSubtext>
          </GlassPanel>
        </div>
      </AbsoluteFill>
      <VignetteOverlay />
    </AbsoluteFill>
  );
};

const IntegrationsScene = () => {
  const frame = useCurrentFrame();
  const names = ["HubSpot", "Salesforce", "Google Calendar", "Zoho CRM", "Twilio", "Stripe"];

  return (
    <AbsoluteFill>
      <IntegrationOrbit3D frame={frame} />
      <AbsoluteFill style={{ zIndex: 1 }}>
        <div style={{ position: "absolute", top: 72, left: 0, right: 0, textAlign: "center" }}>
          <EnterpriseLabel frame={frame}>Enterprise ready</EnterpriseLabel>
          <EnterpriseHeadline frame={frame} size={46} align="center" delay={4}>
            Integrates with your stack
          </EnterpriseHeadline>
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 56,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
            gap: 14,
            flexWrap: "wrap",
            padding: "0 80px",
          }}
        >
          {names.map((name, i) => (
            <div
              key={name}
              style={{
                fontFamily,
                fontSize: 13,
                fontWeight: 600,
                color: brand.colors.white,
                background: "rgba(10,10,16,0.8)",
                border: `1px solid ${brand.colors.cyan}44`,
                borderRadius: 999,
                padding: "9px 18px",
                opacity: motionFade(frame, 18 + i * 4, 12),
              }}
            >
              {name}
            </div>
          ))}
        </div>
      </AbsoluteFill>
      <VignetteOverlay />
    </AbsoluteFill>
  );
};

const CTAScene = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: "#050508" }}>
      <EnterpriseBackground frame={frame} variant="cta" />
      <AbsoluteFill
        style={{
          zIndex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <GlassPanel frame={frame} style={{ textAlign: "center", minWidth: 640 }}>
          <HallaAiLogo size="lg" animate={false} showTagline={false} />
          <EnterpriseHeadline frame={frame} size={36} align="center" delay={8}>
            Start your free trial today
          </EnterpriseHeadline>
          <EnterpriseSubtext frame={frame} align="center" delay={16}>
            {copy.solution}
          </EnterpriseSubtext>
          <div style={{ marginTop: 32 }}>
            <CTAButton label={copy.ctaShort} pulse />
          </div>
          <div
            style={{
              fontFamily,
              fontSize: 17,
              color: brand.colors.muted,
              marginTop: 20,
              letterSpacing: "0.06em",
              opacity: motionFade(frame, 28, 16),
            }}
          >
            {brand.website}
          </div>
        </GlassPanel>
      </AbsoluteFill>
      <ScanLineOverlay frame={frame} />
      <VignetteOverlay />
    </AbsoluteFill>
  );
};

/** 60s enterprise launch — 3D + polished UI mocks (no screen recordings). */
export const CallIQLaunch = () => (
  <AbsoluteFill style={{ background: brand.colors.dark }}>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={SCENES[0]}>
        <HookScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={wipe({ direction: "from-left" })} timing={proTiming} />
      <TransitionSeries.Sequence durationInFrames={SCENES[1]}>
        <BrandScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={proTiming} />
      <TransitionSeries.Sequence durationInFrames={SCENES[2]}>
        <ProductMockScene
          label="Platform"
          headline="Your command center for every call"
          subtext="Real-time metrics, recent activity, and lead conversion — all in one dashboard."
        >
          <DashboardOverviewScreen />
        </ProductMockScene>
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-bottom" })} timing={proTiming} />
      <TransitionSeries.Sequence durationInFrames={SCENES[3]}>
        <ProblemScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={wipe({ direction: "from-right" })} timing={proTiming} />
      <TransitionSeries.Sequence durationInFrames={SCENES[4]}>
        <SolutionScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={proTiming} />
      <TransitionSeries.Sequence durationInFrames={SCENES[5]}>
        <PhoneFeatureScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-left" })} timing={proTiming} />
      <TransitionSeries.Sequence durationInFrames={SCENES[6]}>
        <ProductMockScene
          label="Capabilities"
          headline="AI voice agents that sound human"
          subtext="Configure personality, knowledge base, and business rules in minutes."
        >
          <FeatureScreen
            headline="Natural AI voice agents"
            icon="🤖"
            bullets={[
              "Multiple voice options and personalities",
              "Context-aware responses from your knowledge base",
              "Seamless handoff to live agents when needed",
            ]}
          />
        </ProductMockScene>
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={wipe({ direction: "from-top" })} timing={proTiming} />
      <TransitionSeries.Sequence durationInFrames={SCENES[7]}>
        <IntegrationsScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={proTiming} />
      <TransitionSeries.Sequence durationInFrames={SCENES[8]}>
        <CTAScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  </AbsoluteFill>
);

export const Launch60sEnterprise = CallIQLaunch;
