import "./index.css";
import "@react-three/fiber";
import { Composition } from "remotion";
import { WelcomeToCallIQ } from "./compositions/WelcomeToCallIQ";
import { ClientOnboarding } from "./compositions/ClientOnboarding";
import { AIAgentConfiguration } from "./compositions/AIAgentConfiguration";
import { PhoneNumberSetup } from "./compositions/PhoneNumberSetup";
import { CallFlowBuilder } from "./compositions/CallFlowBuilder";
import { AnalyticsReporting } from "./compositions/AnalyticsReporting";
import { CRMIntegrations } from "./compositions/CRMIntegrations";
import { Launch60s } from "./compositions/Launch60s";
import { CallIQLaunch, Launch60sEnterprise } from "./compositions/Launch60sEnterprise";
import {
  CallIQLabsCinematic,
  CINEMATIC_LAUNCH_DURATION,
} from "./compositions/CinematicLaunch105";

const FPS = 30;
const HORIZONTAL = { width: 1920, height: 1080 } as const;

export const RemotionRoot = () => {
  return (
    <>
      {/* Marketing */}
      <Composition
        id="CallIQLabsCinematic"
        component={CallIQLabsCinematic as never}
        durationInFrames={CINEMATIC_LAUNCH_DURATION}
        fps={FPS}
        {...HORIZONTAL}
      />
      <Composition
        id="CallIQLaunch"
        component={CallIQLaunch as never}
        durationInFrames={1800}
        fps={FPS}
        {...HORIZONTAL}
      />
      <Composition
        id="Launch60sEnterprise"
        component={Launch60sEnterprise as never}
        durationInFrames={1800}
        fps={FPS}
        {...HORIZONTAL}
      />
      <Composition
        id="Launch60s"
        component={Launch60s as never}
        durationInFrames={1800}
        fps={FPS}
        {...HORIZONTAL}
      />

      {/* Video 1 — Welcome to Call IQ (~2.5 min) */}
      <Composition
        id="WelcomeToCallIQ"
        component={WelcomeToCallIQ as never}
        durationInFrames={4500}
        fps={FPS}
        {...HORIZONTAL}
      />
      {/* Video 2 — Client Onboarding (~6 min) */}
      <Composition
        id="ClientOnboarding"
        component={ClientOnboarding as never}
        durationInFrames={10800}
        fps={FPS}
        {...HORIZONTAL}
      />
      {/* Video 3 — AI Agent Configuration (~15 min) */}
      <Composition
        id="AIAgentConfiguration"
        component={AIAgentConfiguration as never}
        durationInFrames={27000}
        fps={FPS}
        {...HORIZONTAL}
      />
      {/* Video 4 — Phone Number Setup (~4 min) */}
      <Composition
        id="PhoneNumberSetup"
        component={PhoneNumberSetup as never}
        durationInFrames={7200}
        fps={FPS}
        {...HORIZONTAL}
      />
      {/* Video 5 — Call Flow Builder (~12 min) */}
      <Composition
        id="CallFlowBuilder"
        component={CallFlowBuilder as never}
        durationInFrames={21600}
        fps={FPS}
        {...HORIZONTAL}
      />
      {/* Video 6 — Analytics & Reporting (~5 min) */}
      <Composition
        id="AnalyticsReporting"
        component={AnalyticsReporting as never}
        durationInFrames={9000}
        fps={FPS}
        {...HORIZONTAL}
      />
      {/* Video 7 — CRM & Integrations (~6 min) */}
      <Composition
        id="CRMIntegrations"
        component={CRMIntegrations as never}
        durationInFrames={10800}
        fps={FPS}
        {...HORIZONTAL}
      />
    </>
  );
};
