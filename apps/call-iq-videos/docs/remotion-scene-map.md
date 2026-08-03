# Remotion Scene Map

**Version:** 2.0.0 · **FPS:** 30 · **Resolution:** 1920×1080  
**Registry:** `src/Root.tsx` · **Sequencer:** `src/training/TrainingVideo.tsx`

---

## Global Timing Constants

| Constant | Frames | Seconds | Source |
|----------|--------|---------|--------|
| Intro bumper | 120 | 4.0 | `duration.ts` → `INTRO_FRAMES` |
| Outro bumper | 120 | 4.0 | `duration.ts` → `OUTRO_FRAMES` |
| Scene transition (fade) | 12 | 0.4 | `lib/duration.ts` → `TRANSITION_FRAMES` |
| Chapter intro card | 75 | 2.5 | `TrainingVideo.tsx` → `CHAPTER_INTRO_FRAMES` |
| Lower third enter | 20–35 | 0.7–1.2 | `LowerThird.tsx` |

Chapter durations are computed by `distributeChapterDurations()` in `src/training/duration.ts`. Transitions overlap adjacent sequences (TransitionSeries).

---

## Demo Data Sources

| Import | File | Used by |
|--------|------|---------|
| `demo.index` | `demo-data.json` | Agents, phones, routes, routing rules |
| `northline` | `demo-assets/sample-businesses.json` | Videos 1, 2, 4, 5, 6, 7 |
| `summit` | `demo-assets/sample-businesses.json` | Video 3 |
| `demo.leads` | `demo-assets/sample-leads.json` | Videos 1, 5 |
| `demo.calls` | `demo-assets/sample-calls.json` | Video 5 |
| `demo.analytics` | `demo-assets/sample-analytics.json` | Video 6 |
| `demo.crm` | `demo-assets/sample-crm-records.json` | Video 7 |
| `demo.appointments` | `demo-assets/sample-appointments.json` | Videos 2, 5, 6 |

TypeScript barrel: `src/data/demo.ts`

---

## Video 1 — `WelcomeToCallIQ`

**Total frames:** 4,500 (2:30) · **Chapters:** 9 · **Tenant:** Northline Home Services

| Ch | Title | Start | Duration | Content | End | Screen Component | Dashboard Route | Demo Data | Lower Third |
|----|-------|-------|----------|---------|-----|------------------|-----------------|-----------|-------------|
| — | Intro | 0 | 120 | — | 120 | `IntroBumper` | — | `brand.ts` | — |
| 1 | Welcome | 108 | 487 | 412 | 595 | `WelcomeScreen` | `/` (marketing) | `brand.ts` | — |
| 2 | What Call IQ Solves | 583 | 487 | 412 | 1,070 | `FeatureScreen` | `/dashboard/calls` | Industry stat 62% | — |
| 3 | AI Voice Agents | 1,058 | 487 | 412 | 1,545 | `FeatureScreen` | `/dashboard/agent` | `agents.northline` | AI Voice Agent — Main Receptionist · Sarah — Warm & Professional |
| 4 | Lead Management | 1,533 | 487 | 412 | 2,020 | `FeatureScreen` | `/dashboard/leads` | `demo.leads` (Maria, David, Jennifer) | — |
| 5 | Call Analytics | 2,008 | 487 | 412 | 2,495 | `FeatureScreen` | `/dashboard/analytics` | `analytics.summary` (1,284 calls) | — |
| 6 | Appointment Booking | 2,483 | 487 | 412 | 2,970 | `FeatureScreen` | `/dashboard/calendar` | `demo.appointments` | — |
| 7 | CRM Automation | 2,958 | 486 | 411 | 3,444 | `FeatureScreen` | `/dashboard/integrations` | `demo.crm` | — |
| 8 | Multi-tenant Management | 3,432 | 486 | 411 | 3,918 | `FeatureScreen` | `/call-iq/tenants` | `multiTenantExamples` | Multi-Tenant · Northline · Cascade Dental · Pacific Ridge |
| 9 | End Benefits | 3,906 | 486 | 411 | 4,392 | `FeatureScreen` | `/dashboard/analytics` | `$3,051` savings | — |
| — | Outro | 4,380 | 120 | — | 4,500 | `OutroBumper` | — | CTA calliqlabs.com | — |

**Composition file:** `src/compositions/WelcomeToCallIQ.tsx`

---

## Video 2 — `ClientOnboarding`

**Total frames:** 10,800 (6:00) · **Chapters:** 10 · **Tenant:** Northline Home Services

| Ch | Title | Start | Duration | Content | End | Screen Component | Dashboard Route | Demo Data | Lower Third |
|----|-------|-------|----------|---------|-----|------------------|-----------------|-----------|-------------|
| — | Intro | 0 | 120 | — | 120 | `IntroBumper` | — | — | — |
| 1 | Sign Up | 108 | 1,070 | 995 | 1,178 | `OnboardingScreen` | `/signup` | `northline.onboarding.signupEmail` | — |
| 2 | Email Verification | 1,166 | 1,070 | 995 | 2,236 | `OnboardingScreen` | `/signup` (verify step) | Code `738294` | — |
| 3 | Organization Creation | 2,224 | 1,069 | 994 | 3,293 | `OnboardingScreen` | `/onboarding` | `northline.onboarding` | — |
| 4 | Select Plan | 3,281 | 1,069 | 994 | 4,350 | `OnboardingScreen` | `/onboarding` (billing) | Professional $149/mo | Professional Plan — $149/mo · 2,000 min · 14-day trial |
| 5 | Onboarding Wizard | 4,338 | 1,069 | 994 | 5,407 | `OnboardingScreen` | `/onboarding` | 4-step wizard | — |
| 6 | Business Info | 5,395 | 1,069 | 994 | 6,464 | `OnboardingScreen` | `/dashboard/settings` | `northline.services`, hours | — |
| 7 | Calendar Setup | 6,452 | 1,069 | 994 | 7,521 | `OnboardingScreen` | `/dashboard/calendar` | Google Calendar | — |
| 8 | CRM Connection | 7,509 | 1,069 | 994 | 8,578 | `OnboardingScreen` | `/dashboard/integrations` | HubSpot | — |
| 9 | Phone Number | 8,566 | 1,069 | 994 | 9,635 | `OnboardingScreen` | `/dashboard/phone-numbers` | +1 (720) 555-0188 | New Number — +1 (720) 555-0188 · Main Receptionist |
| 10 | Dashboard Overview | 9,623 | 1,069 | 994 | 10,692 | `DashboardOverviewScreen` | `/dashboard` | 47 calls, 49% conversion today | — |
| — | Outro | 10,680 | 120 | — | 10,800 | `OutroBumper` | — | — | — |

**Composition file:** `src/compositions/ClientOnboarding.tsx`

---

## Video 3 — `AIAgentConfiguration`

**Total frames:** 27,000 (15:00) · **Chapters:** 13 · **Tenant:** Summit Comfort HVAC

| Ch | Title | Start | Duration | Content | End | Screen Component | Dashboard Route | Demo Data | Lower Third |
|----|-------|-------|----------|---------|-----|------------------|-----------------|-----------|-------------|
| — | Intro | 0 | 120 | — | 120 | `IntroBumper` | — | — | — |
| 1 | Agent Creation | 108 | 2,072 | 1,997 | 2,180 | `AgentConfigScreen` | `/dashboard/agent` | `summit.agentConfig` | New Agent — Morgan · Inbound · cedar voice |
| 2 | KB — PDFs | 2,168 | 2,072 | 1,997 | 4,240 | `AgentConfigScreen` | `/dashboard/knowledge` | 4 PDF documents | — |
| 3 | KB — Website Crawl | 4,228 | 2,072 | 1,997 | 6,300 | `AgentConfigScreen` | `/dashboard/knowledge` (website tab) | 52 pages, weekly sync | — |
| 4 | KB — FAQs | 6,288 | 2,072 | 1,997 | 8,360 | `AgentConfigScreen` | `/dashboard/knowledge` (FAQs) | `summit.knowledgeBase.faqs` | — |
| 5 | Personality — Tone & Greeting | 8,348 | 2,072 | 1,997 | 10,420 | `AgentConfigScreen` | `/dashboard/agent` (greeting) | Morgan greeting script | — |
| 6 | Personality — Instructions | 10,408 | 2,071 | 1,996 | 12,479 | `AgentConfigScreen` | `/dashboard/agent` (instructions) | Core + escalation keywords | — |
| 7 | Business Rules — Hours | 12,467 | 2,071 | 1,996 | 14,538 | `AgentConfigScreen` | `/dashboard/settings` (hours) | Boulder hours, $89 emergency | — |
| 8 | Business Rules — Escalation | 14,526 | 2,071 | 1,996 | 16,597 | `AgentConfigScreen` | `/dashboard/agent` (escalation) | SMS + email dispatch | — |
| 9 | Business Rules — Transfer | 16,585 | 2,071 | 1,996 | 18,656 | `AgentConfigScreen` | `/dashboard/agent` (transfer) | Dispatch/sales/emergency lines | — |
| 10 | Business Rules — Appointments | 18,644 | 2,071 | 1,996 | 20,715 | `AgentConfigScreen` | `/dashboard/agent` (appointments) | 90-min diagnostic slots | — |
| 11 | Testing — Simulate | 20,703 | 2,071 | 1,996 | 22,774 | `AgentConfigScreen` | `/dashboard/simulator` | No-cool emergency, 97% | Simulator — No-Cool Emergency · Score 97% |
| 12 | Testing — Review | 22,762 | 2,071 | 1,996 | 24,833 | `AgentConfigScreen` | `/dashboard/simulator` (review) | 3 test calls | — |
| 13 | Testing — Improve | 24,821 | 2,071 | 1,996 | 26,892 | `AgentConfigScreen` | `/dashboard/agent` | Live on +1 (303) 555-0147 | Agent Live — +1 (303) 555-0147 · Re-test 96% |
| — | Outro | 26,880 | 120 | — | 27,000 | `OutroBumper` | — | — | — |

**Composition file:** `src/compositions/AIAgentConfiguration.tsx`

---

## Video 4 — `PhoneNumberSetup`

**Total frames:** 7,200 (4:00) · **Chapters:** 4 · **Tenant:** Northline Home Services

| Ch | Title | Start | Duration | Content | End | Screen Component | Dashboard Route | Demo Data | Lower Third |
|----|-------|-------|----------|---------|-----|------------------|-----------------|-----------|-------------|
| — | Intro | 0 | 120 | — | 120 | `IntroBumper` | — | — | — |
| 1 | Buy a Number | 108 | 1,755 | 1,680 | 1,863 | `PhoneSetupScreen` | `/dashboard/phone-numbers` | Denver 720, Boulder 303, 800 | Available Numbers · Denver · Boulder · Toll-Free |
| 2 | Assign to Agent | 1,851 | 1,755 | 1,680 | 3,606 | `PhoneSetupScreen` | `/dashboard/phone-numbers` | Sarah + Alex assignments | +1 (720) 555-0188 · Main Receptionist |
| 3 | Routing Rules | 3,594 | 1,755 | 1,680 | 5,349 | `PhoneSetupScreen` | `/dashboard/phone-numbers` (routing) | `routingRules` (4 rules) | — |
| 4 | Test Calls | 5,337 | 1,755 | 1,680 | 7,092 | `PhoneSetupScreen` | `/dashboard/simulator` | 3/3 passed | Test Results · 3 of 3 Passed |
| — | Outro | 7,080 | 120 | — | 7,200 | `OutroBumper` | — | — | — |

**Composition file:** `src/compositions/PhoneNumberSetup.tsx`

---

## Video 5 — `CallFlowBuilder`

**Total frames:** 21,600 (12:00) · **Chapters:** 6 · **Tenant:** Northline Home Services

| Ch | Title | Start | Duration | Content | End | Screen Component | Dashboard Route | Demo Data | Lower Third |
|----|-------|-------|----------|---------|-----|------------------|-----------------|-----------|-------------|
| — | Intro | 0 | 120 | — | 120 | `IntroBumper` | — | — | — |
| 1 | Lead Qualification | 108 | 3,574 | 3,499 | 3,682 | `WorkflowScreen` | `/dashboard/automation` | Maria Gonzalez / kitchen leak | Workflow Trigger · +1 (720) 555-0188 |
| 2 | Appointment Booking | 3,670 | 3,574 | 3,499 | 7,244 | `WorkflowScreen` | `/dashboard/calendar` | 2:30 PM booking | — |
| 3 | CRM Update | 7,232 | 3,574 | 3,499 | 10,806 | `WorkflowScreen` | `/dashboard/integrations` | HubSpot contact create | — |
| 4 | SMS Confirmation | 10,794 | 3,574 | 3,499 | 14,368 | `WorkflowScreen` | `/dashboard/sms` | Confirmation SMS text | — |
| 5 | Calendar Event | 14,356 | 3,574 | 3,499 | 17,930 | `WorkflowScreen` | `/dashboard/calendar` | Google Calendar event | — |
| 6 | Full Workflow | 17,918 | 3,574 | 3,499 | 21,492 | `WorkflowScreen` | `/dashboard/automation` | 5-node full flow | End-to-End Automation · 0 Manual Steps |
| — | Outro | 21,480 | 120 | — | 21,600 | `OutroBumper` | — | — | — |

**Composition file:** `src/compositions/CallFlowBuilder.tsx` · **Canvas:** `WorkflowCanvas.tsx`

---

## Video 6 — `AnalyticsReporting`

**Total frames:** 9,000 (5:00) · **Chapters:** 6 · **Tenant:** Northline Home Services

| Ch | Title | Start | Duration | Content | End | Screen Component | Dashboard Route | Demo Data | Lower Third |
|----|-------|-------|----------|---------|-----|------------------|-----------------|-----------|-------------|
| — | Intro | 0 | 120 | — | 120 | `IntroBumper` | — | — | — |
| 1 | Total Calls | 108 | 1,474 | 1,399 | 1,582 | `AnalyticsScreen` | `/dashboard/analytics` | 1,284 calls, 96% answered | Reporting Period · May 15 – Jun 14, 2026 |
| 2 | Missed Calls | 1,570 | 1,474 | 1,399 | 3,044 | `AnalyticsScreen` | `/dashboard/analytics` | 51 missed, −32% | — |
| 3 | Conversion Rate | 3,032 | 1,474 | 1,399 | 4,506 | `AnalyticsScreen` | `/dashboard/analytics` | 49%, 634 leads | — |
| 4 | Appointments | 4,494 | 1,474 | 1,399 | 5,968 | `AnalyticsScreen` | `/dashboard/analytics` | 296 booked, 88.2% show | — |
| 5 | Agent Performance | 5,956 | 1,474 | 1,399 | 7,430 | `AnalyticsScreen` | `/dashboard/analytics` | Sarah 96%, Alex 91% | — |
| 6 | Cost Savings | 7,418 | 1,474 | 1,399 | 8,892 | `AnalyticsScreen` | `/dashboard/analytics` | $3,051/mo saved | Your ROI · $3,051/mo · 95% reduction |
| — | Outro | 8,880 | 120 | — | 9,000 | `OutroBumper` | — | — | — |

**Composition file:** `src/compositions/AnalyticsReporting.tsx` · **Metrics:** `analyticsChapters` from `demo.ts`

---

## Video 7 — `CRMIntegrations`

**Total frames:** 10,800 (6:00) · **Chapters:** 6 · **Tenant:** Northline Home Services

| Ch | Title | Start | Duration | Content | End | Screen Component | Dashboard Route | Demo Data | Lower Third |
|----|-------|-------|----------|---------|-----|------------------|-----------------|-----------|-------------|
| — | Intro | 0 | 120 | — | 120 | `IntroBumper` | — | — | — |
| 1 | HubSpot | 108 | 1,774 | 1,699 | 1,882 | `IntegrationsScreen` | `/dashboard/integrations` | 412 contacts synced | CRM — HubSpot Connected · Auto-sync |
| 2 | Salesforce | 1,870 | 1,774 | 1,699 | 3,644 | `IntegrationsScreen` | `/dashboard/integrations` | Custom field mapping | — |
| 3 | Zoho | 3,632 | 1,774 | 1,699 | 5,406 | `IntegrationsScreen` | `/dashboard/integrations` | James Okonkwo lead | — |
| 4 | Google Calendar | 5,394 | 1,774 | 1,699 | 7,168 | `IntegrationsScreen` | `/dashboard/integrations` | Real-time event sync | — |
| 5 | Outlook | 7,156 | 1,774 | 1,699 | 8,930 | `IntegrationsScreen` | `/dashboard/integrations` | Commercial dispatch | — |
| 6 | Webhooks | 8,918 | 1,774 | 1,699 | 10,692 | `IntegrationsScreen` | `/dashboard/integrations` | ServiceTitan + Slack, 1,847 events | Webhooks · 2 Endpoints · 1,847 deliveries |
| — | Outro | 10,680 | 120 | — | 10,800 | `OutroBumper` | — | — | — |

**Composition file:** `src/compositions/CRMIntegrations.tsx` · **Grid:** `IntegrationGrid.tsx`

---

## Shared UI Components

| Component | Path | Role |
|-----------|------|------|
| `TrainingVideo` | `src/training/TrainingVideo.tsx` | TransitionSeries orchestrator |
| `ChapterIntro` | `src/training/ChapterIntro.tsx` | Numbered chapter card (75 frames) |
| `NarrationBar` | `src/training/NarrationBar.tsx` | On-screen VO script line |
| `Captions` | `src/training/Captions.tsx` | Burned-in caption overlay (optional) |
| `ProgressHeader` | `src/training/ProgressHeader.tsx` | Video title + chapter progress |
| `DashboardShell` | `src/training/DashboardShell.tsx` | Sidebar nav matching production |
| `IntroBumper` / `OutroBumper` | `src/training/` | Branded open/close |
| `buildChapters` | `src/training/buildChapters.ts` | Duration distribution helper |

---

## Render Quick Reference

```bash
cd apps/call-iq-videos
npx remotion render <CompositionId> out/<CompositionId>.mp4
```

| CompositionId | Frames | Runtime |
|---------------|--------|---------|
| `WelcomeToCallIQ` | 4,500 | 2:30 |
| `ClientOnboarding` | 10,800 | 6:00 |
| `AIAgentConfiguration` | 27,000 | 15:00 |
| `PhoneNumberSetup` | 7,200 | 4:00 |
| `CallFlowBuilder` | 21,600 | 12:00 |
| `AnalyticsReporting` | 9,000 | 5:00 |
| `CRMIntegrations` | 10,800 | 6:00 |

---

## Modifying Scene Timing

1. Change `TOTAL_FRAMES` in the composition file
2. Update matching `durationInFrames` in `src/Root.tsx`
3. Re-run distribute logic — chapter count is `defs.length` in `buildChapters()`
4. Update corresponding storyboard durations in `docs/storyboard-video-*.md`
5. Preview in `npm run studio` before batch render
