# Call IQ Demo Video Production Plan

**Version:** 2.0.0  
**Last updated:** June 14, 2026  
**Package:** `apps/call-iq-videos`  
**Output format:** 1920×1080 · 30 fps · H.264 MP4

---

## Executive Summary

This plan covers seven training/demo videos for Call IQ Labs — an enterprise AI voice receptionist SaaS for home services. Videos are authored in **Remotion** (`src/compositions/`) with optional **live dashboard screen recordings** for B-roll and marketing cut-downs. Primary deliverable is programmatic render; secondary deliverables include voiceover audio, burned-in captions, and social cut-downs.

| # | Composition ID | Title | Runtime | Scenes |
|---|----------------|-------|---------|--------|
| 1 | `WelcomeToCallIQ` | Welcome to Call IQ | 2:30 | 9 |
| 2 | `ClientOnboarding` | Client Onboarding | 6:00 | 10 |
| 3 | `AIAgentConfiguration` | AI Agent Configuration | 15:00 | 13 |
| 4 | `PhoneNumberSetup` | Phone Number Setup | 4:00 | 4 |
| 5 | `CallFlowBuilder` | Call Flow Builder | 12:00 | 6 |
| 6 | `AnalyticsReporting` | Analytics & Reporting | 5:00 | 6 |
| 7 | `CRMIntegrations` | CRM & Integrations | 6:00 | 6 |

**Total runtime:** ~50:30

---

## Global Visual Style

### Brand

| Element | Value |
|---------|-------|
| Product name | Call IQ |
| Tagline | Smart • Seamless • Always |
| Website | https://www.calliqlabs.com |
| Primary accent | Cyan `#0EA5E9` |
| Background | Near-black `#0A0A0A` |
| Surface | Charcoal `#1A1A1A` / `#2A2A2A` |
| Body text | White `#FFFFFF` |
| Muted text | Slate `#94A3B8` |
| Font | Inter (via `@remotion/google-fonts`) |

### Enterprise SaaS Aesthetic

- **Dark mode only** — matches production dashboard (`apps/dashboard`)
- **Blue accent bars** — left-border highlights on cards, lower thirds, and CTAs
- **Glass vignette** — subtle edge darkening via `VignetteOverlay`
- **No stock photography** — product UI, iconography, and workflow diagrams only
- **Motion discipline** — `useCurrentFrame` + `interpolate`; fade transitions via `@remotion/transitions` (12-frame crossfade)
- **Chapter structure** — numbered intro card (2.5s) → content → narration bar at bottom

### Lower Third Convention

Cyan left-border label, optional muted detail line. Appears on scenes with contextual metadata (phone numbers, plan pricing, test scores). Component: `src/training/LowerThird.tsx`.

---

## Demo Tenants

### Primary — Northline Home Services (Videos 1, 2, 4, 5, 6, 7)

| Field | Value |
|-------|-------|
| Legal name | Northline Home Services LLC |
| DBA | Northline Home Services |
| Location | Denver, CO (1842 Wazee Street, Suite 300) |
| Industry | Home Services |
| Services | Emergency Plumbing, HVAC Repair, Electrical Diagnostics, Water Heater Install |
| Service area | Denver Metro — 35 mile radius |
| Owner | Rachel Torres — `rachel@northlinehome.com` |
| Plan | Professional — $149/mo · 2,000 minutes · 14-day trial |
| Main line | **+1 (720) 555-0188** |
| Sales line | +1 (720) 555-0199 |
| AI agent | Sarah — Main Receptionist (voice: shimmer) |
| CRM | HubSpot |
| Calendar | Google Calendar |

**Key demo leads:** Maria Gonzalez (kitchen leak), David Chen (AC not cooling), Jennifer Walsh (panel upgrade).

### Flagship — Summit Comfort HVAC (Video 3 only)

| Field | Value |
|-------|-------|
| Legal name | Summit Comfort HVAC Inc. |
| DBA | Summit Comfort HVAC |
| Location | Boulder, CO (2901 Pearl Street) |
| Industry | HVAC |
| Operator | Marcus Chen — `marcus@summitcomforthvac.com` |
| Main line | **+1 (303) 555-0147** |
| AI agent | Morgan — HVAC Receptionist (voice: cedar) |
| Website crawl | 52 pages indexed, weekly Monday sync |

### Shared Analytics Benchmarks (Northline, May 15 – Jun 14, 2026)

| Metric | Value |
|--------|-------|
| Total calls | **1,284** |
| Answer rate | 96.0% |
| Conversion rate | **49%** |
| Leads generated | 634 |
| Appointments booked | 296 |
| Monthly savings vs. receptionist | **$3,051** (95% reduction) |

Data sources: `demo-data.json`, `demo-assets/sample-*.json`, `src/data/demo.ts`.

---

## Dashboard Routes Reference

All routes use the `/dashboard` prefix (Next.js App Router, `apps/dashboard/src/app/dashboard/`).

| Route | Purpose | Used in |
|-------|---------|---------|
| `/signup` | Account creation | Video 2 |
| `/onboarding` | Post-signup wizard | Video 2 |
| `/dashboard` | KPI overview | Videos 2, 6 |
| `/dashboard/calls` | Call log | Videos 1, 5 |
| `/dashboard/calls/[id]` | Transcript detail | Video 5 |
| `/dashboard/leads` | Lead pipeline | Videos 1, 5 |
| `/dashboard/agent` | AI agent config | Videos 1, 3 |
| `/dashboard/knowledge` | Knowledge base | Video 3 |
| `/dashboard/simulator` | Agent test calls | Video 3 |
| `/dashboard/calendar` | Appointments | Videos 1, 5, 7 |
| `/dashboard/analytics` | Metrics & charts | Videos 1, 6 |
| `/dashboard/integrations` | CRM connections | Videos 1, 7 |
| `/dashboard/phone-numbers` | Number provisioning | Videos 2, 4 |
| `/dashboard/automation` | Workflow builder | Video 5 |
| `/dashboard/sms` | SMS threads | Video 5 |
| `/dashboard/billing` | Plan & usage | Video 2 |
| `/dashboard/settings` | Business profile | Videos 2, 3 |

---

## Deliverables Checklist

### Per Video (×7)

- [ ] Remotion composition renders without TypeScript/lint errors
- [ ] Final MP4 in `out/<CompositionId>.mp4`
- [ ] Voiceover WAV/MP3 synced to narration script (storyboard)
- [ ] Burned-in captions match storyboard caption column
- [ ] Lower thirds verified on flagged scenes
- [ ] QA pass at 100% zoom — no text clipping at 1920×1080

### Global

- [ ] `demo-data.json` and `demo-assets/` populated with Northline + Summit data
- [ ] Dashboard seeded with demo tenant for live screen recordings
- [ ] Background music: `public/audio/background-music.mp3`
- [ ] Transition SFX: `public/audio/transition-sfx.mp3`
- [ ] Logo asset: `public/logo.png`
- [ ] All seven MP4s uploaded to CMS / YouTube unlisted
- [ ] Thumbnail set (1280×720, dark + cyan accent + video title)

### Optional Cut-Downs

| Cut | Source | Target length |
|-----|--------|---------------|
| Launch teaser | Video 1 scenes 1–3 + 9 | 30s |
| Onboarding highlight | Video 2 scenes 1, 4, 10 | 60s |
| Agent setup quickstart | Video 3 scenes 1, 5, 11, 13 | 90s |
| ROI clip | Video 6 scene 6 | 15s |

---

## Screen Recording Plan

### Environment Setup

1. Start gateway + dashboard locally or use staging with demo tenant `tenant_northline_001`
2. Log in as Rachel Torres (`rachel@northlinehome.com`)
3. Set browser to 1920×1080, 100% zoom, dark mode (default)
4. Hide dev tools; disable cursor smoothing for clean mouse paths
5. Use OBS or ShareX at 30 fps, CRF 18 equivalent

### Recording Matrix

| Video | Live dashboard routes to capture | Remotion mock (no recording needed) |
|-------|-------------------------------|-------------------------------------|
| 1 | `/dashboard/analytics`, `/dashboard/leads` (B-roll inserts) | `FeatureScreen`, `WelcomeScreen` |
| 2 | `/signup`, `/onboarding`, `/dashboard/phone-numbers`, `/dashboard` | `OnboardingScreen` |
| 3 | `/dashboard/agent`, `/dashboard/knowledge`, `/dashboard/simulator` | `AgentConfigScreen` (Summit tenant) |
| 4 | `/dashboard/phone-numbers` | `PhoneSetupScreen` |
| 5 | `/dashboard/automation`, `/dashboard/calls`, `/dashboard/leads`, `/dashboard/calendar` | `WorkflowScreen` |
| 6 | `/dashboard/analytics` (all tabs) | `AnalyticsScreen` |
| 7 | `/dashboard/integrations` | `IntegrationsScreen` |

### Recording Actions (Northline unless noted)

| Action | Route | Notes |
|--------|-------|-------|
| Scroll analytics KPI cards | `/dashboard/analytics` | Show 1,284 calls, 49% conversion |
| Open call transcript | `/dashboard/calls` → Maria Gonzalez | Kitchen leak scenario |
| Drag lead card | `/dashboard/leads` | Move Maria to "Appointment Scheduled" |
| Configure agent voice | `/dashboard/agent` | Sarah / shimmer selected |
| Upload KB document | `/dashboard/knowledge` | Summit: upload `summit-services-guide.pdf` |
| Run simulator | `/dashboard/simulator` | Summit no-cool emergency |
| Search 720 area code | `/dashboard/phone-numbers` | Select +1 (720) 555-0188 |
| Connect HubSpot | `/dashboard/integrations` | Show connected state |
| Build automation node | `/dashboard/automation` | Lead Qualification trigger |

---

## Voiceover Convention

### Voice Profile

| Attribute | Specification |
|-----------|---------------|
| Gender | Neutral professional (either) |
| Tone | Confident, warm, enterprise — not hype |
| Pace | ~140 words/minute |
| Language | US English |
| Recording | 48 kHz WAV, −16 LUFS integrated loudness |

### Script Rules

1. **Full scripts** live in each storyboard's Voiceover column — read verbatim unless timing requires minor trims
2. **Numbers** — speak naturally: "twelve hundred eighty-four calls," "forty-nine percent," "three thousand fifty-one dollars"
3. **Phone numbers** — group digits: "seven two zero, five five five, zero one eight eight"
4. **Product name** — always "Call IQ" (two words, IQ capitalized)
5. **Tenant names** — use DBA: "Northline Home Services," "Summit Comfort HVAC"
6. **Narration bar** — Remotion displays script line during render (`NarrationBar.tsx`); replace with recorded VO in post if desired

### Audio Generation

```powershell
# From apps/call-iq-videos
npm run audio:generate
# Runs generate-cinematic-audio.mjs + generate-voiceover.ps1
```

Place final mixes in `public/audio/` and wire via `src/lib/audio.tsx` if replacing narration bar with synced VO.

---

## Render Commands

### Prerequisites

```bash
cd apps/call-iq-videos
npm install
npm run lint          # eslint + tsc
npm run studio        # preview in Remotion Studio
```

### Individual Renders

```bash
npx remotion render WelcomeToCallIQ out/WelcomeToCallIQ.mp4
npx remotion render ClientOnboarding out/ClientOnboarding.mp4
npx remotion render AIAgentConfiguration out/AIAgentConfiguration.mp4
npx remotion render PhoneNumberSetup out/PhoneNumberSetup.mp4
npx remotion render CallFlowBuilder out/CallFlowBuilder.mp4
npx remotion render AnalyticsReporting out/AnalyticsReporting.mp4
npx remotion render CRMIntegrations out/CRMIntegrations.mp4
```

### Render All (PowerShell)

```powershell
$comps = @(
  "WelcomeToCallIQ","ClientOnboarding","AIAgentConfiguration",
  "PhoneNumberSetup","CallFlowBuilder","AnalyticsReporting","CRMIntegrations"
)
foreach ($c in $comps) {
  npx remotion render $c "out/$c.mp4"
}
```

### From Monorepo Root

```bash
npm run videos:studio
npm run videos:render -- WelcomeToCallIQ out/WelcomeToCallIQ.mp4
```

### Render Settings

| Setting | Value |
|---------|-------|
| Codec | H.264 |
| Resolution | 1920×1080 |
| FPS | 30 |
| Composition registry | `src/Root.tsx` |
| Output directory | `apps/call-iq-videos/out/` |

---

## Motion.so MCP Usage Notes

Motion (`user-motion` MCP) is for **marketing cut-downs, launch teasers, and social clips** — not the primary Remotion training renders. Use when you need a fast polished clip without engineering a new composition.

### When to Use Motion vs. Remotion

| Use Motion | Use Remotion |
|------------|--------------|
| 15–60s social/ad cut from brief | Full training walkthrough (4–15 min) |
| Explainer from blog post or landing page | Pixel-accurate dashboard UI reproduction |
| Style exploration (Apple/Linear/Stripe design systems) | Chapter sequencing with exact frame counts |
| Rapid iteration on hook/CTA | Demo data tied to `demo-assets/` JSON |

### MCP Workflow

1. **Brief, don't script** — pass goal, audience, tone, and key points; Motion researches and produces
2. **`create_video`** — primary tool; returns async session with live-updating widget (no polling needed)
3. **Design system** — use `design_system_id: "linear"` or `"stripe"` for enterprise SaaS dark aesthetic; override with custom `design_md` referencing Call IQ colors above
4. **Aspect ratio** — `16:9` for YouTube/training embeds; `9:16` for Reels; `1:1` for LinkedIn
5. **Duration** — `30s-1min` for teasers; `1-5min` for short explainers (training videos exceed Motion's sweet spot — keep Remotion as source of truth)
6. **Attachments** — attach rendered MP4 snippets, dashboard screenshots, or `logo.png` (max 10 URLs)
7. **Iterate** — `create_followup` for revision passes ("tighten CTA," "emphasize $3,051 savings")
8. **Credits** — if `recovery_tool` returned, call it immediately then retry generation

### Example Motion Brief (ROI Teaser)

```
Create a 30-second enterprise SaaS promo for Call IQ, an AI voice receptionist
for home service businesses. Dark mode, blue (#0EA5E9) accents. Audience:
HVAC/plumbing owners missing after-hours calls. Key stats: 1,284 calls handled,
49% conversion, $3,051/month saved vs hiring receptionist. CTA: calliqlabs.com.
Tone: professional, confident. Attach Northline Home Services as example customer.
design_system_id: linear, aspect_ratio: 16:9, duration: 30s-1min
```

---

## Production Timeline (Suggested)

| Phase | Duration | Output |
|-------|----------|--------|
| Pre-production | 2 days | Storyboards signed off (this doc set) |
| Demo data & dashboard seed | 1 day | Tenants live on staging |
| Remotion QA in Studio | 2 days | All compositions preview clean |
| Screen recordings | 1 day | B-roll per recording matrix |
| Voiceover record + mix | 2 days | WAV per video |
| Render + QC | 1 day | Seven final MP4s |
| Cut-downs (Motion + manual) | 1 day | Social clips |
| Publish | 0.5 day | Upload + embed on help center |

---

## File Index

| Document | Purpose |
|----------|---------|
| `video-production-plan.md` | This master plan |
| `storyboard-video-1.md` … `storyboard-video-7.md` | Scene-by-scene scripts |
| `remotion-scene-map.md` | Composition ↔ frame ↔ component mapping |
| `../src/Root.tsx` | Composition registry & frame totals |
| `../demo-data.json` | Tenant, agent, route index |
| `../src/data/demo.ts` | TypeScript demo imports |

---

## Sign-Off

| Role | Name | Date |
|------|------|------|
| Producer | | |
| Engineering | | |
| Brand/Marketing | | |
