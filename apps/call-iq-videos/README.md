# Call IQ Training Videos

Professional 1920×1080 training videos for [Call IQ](https://www.calliqlabs.com) — AI voice receptionist SaaS.

**Tagline:** Smart • Seamless • Always  
**Brand colors:** Cyan `#0EA5E9`, Dark `#0A0A0A`, White `#FFFFFF`

## Setup

```bash
npm install
node scripts/create-silent-mp3.mjs   # creates placeholder audio (optional if files exist)
```

Replace placeholder audio in `public/audio/` with your own tracks:

| File | Usage |
|------|-------|
| `background-music.mp3` | Background music for all compositions |
| `transition-sfx.mp3` | Short SFX at scene transitions |

## Studio

From repo root:

```bash
npm run videos:studio
```

Or from this package:

```bash
npm run studio
```

## Compositions

| ID | Duration | Chapters |
|----|----------|----------|
| `WelcomeToCallIQ` | 2.5 min (4500 frames) | 9 |
| `ClientOnboarding` | 6 min (10800 frames) | 10 |
| `AIAgentConfiguration` | 10 min (18000 frames) | 13 |
| `PhoneNumberSetup` | 4 min (7200 frames) | 4 |
| `CallFlowBuilder` | 9 min (16200 frames) | 6 |
| `AnalyticsReporting` | 5 min (9000 frames) | 6 |
| `CRMIntegrations` | 6 min (10800 frames) | 6 |

All videos: **1920×1080**, **30 fps**, cinematic dark theme.

## Render commands

```bash
# Welcome overview
npx remotion render WelcomeToCallIQ out/WelcomeToCallIQ.mp4

# Client onboarding walkthrough
npx remotion render ClientOnboarding out/ClientOnboarding.mp4

# AI agent configuration (most important)
npx remotion render AIAgentConfiguration out/AIAgentConfiguration.mp4

# Phone number setup
npx remotion render PhoneNumberSetup out/PhoneNumberSetup.mp4

# Call flow builder
npx remotion render CallFlowBuilder out/CallFlowBuilder.mp4

# Analytics & reporting
npx remotion render AnalyticsReporting out/AnalyticsReporting.mp4

# CRM integrations
npx remotion render CRMIntegrations out/CRMIntegrations.mp4
```

### Render all

```bash
npx remotion render WelcomeToCallIQ out/WelcomeToCallIQ.mp4
npx remotion render ClientOnboarding out/ClientOnboarding.mp4
npx remotion render AIAgentConfiguration out/AIAgentConfiguration.mp4
npx remotion render PhoneNumberSetup out/PhoneNumberSetup.mp4
npx remotion render CallFlowBuilder out/CallFlowBuilder.mp4
npx remotion render AnalyticsReporting out/AnalyticsReporting.mp4
npx remotion render CRMIntegrations out/CRMIntegrations.mp4
```

From repo root:

```bash
npm run videos:render -- WelcomeToCallIQ out/WelcomeToCallIQ.mp4
```

## Project structure

```
src/
  brand.ts                  # Colors, copy, features
  Root.tsx                  # Composition registry (7 training videos)
  training/
    TrainingVideo.tsx       # Chapter sequencer with fade transitions
    IntroBumper.tsx         # Opening bumper
    OutroBumper.tsx         # Closing CTA bumper
    ChapterIntro.tsx        # Numbered chapter cards
    NarrationBar.tsx        # Voiceover script line
    ProgressHeader.tsx        # Video title + chapter progress
    DashboardShell.tsx      # Dashboard sidebar mock (matches real NAV)
    BrowserChrome.tsx       # Browser frame for signup flows
    WorkflowCanvas.tsx      # Animated workflow nodes + arrows
    IntegrationGrid.tsx     # Integration logo badges
    screens/                # Topic-specific screen mocks
  compositions/             # Seven training video compositions
  components/             # Legacy shared UI (logo, background)
  lib/                    # Fonts, audio, duration helpers
public/
  logo.png                # Call IQ logo
  audio/                  # Background music & SFX
```

## Notes

- Animations use `useCurrentFrame` + `interpolate` only (no CSS transitions).
- Chapter transitions use `@remotion/transitions` fade via `TransitionSeries`.
- Inter font loaded via `@remotion/google-fonts` in `lib/fonts.ts`.
