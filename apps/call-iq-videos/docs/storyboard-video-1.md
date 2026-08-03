# Storyboard — Video 1: Welcome to Call IQ

**Composition ID:** `WelcomeToCallIQ`  
**Goal:** Introduce Call IQ to home service business owners — explain the product value proposition, core capabilities, and ROI in under three minutes.  
**Target audience:** HVAC, plumbing, and electrical operators (5–50 employees) evaluating AI phone coverage.  
**Demo tenant:** Northline Home Services (Denver)  
**Length:** 2:30 (4,500 frames @ 30 fps)  
**Scenes:** 9

---

## Scene-by-Scene Breakdown

| Scene # | Title | Duration | Dashboard Route | Screen Recording Plan | Camera Movement | Animation | Voiceover (full script) | Captions (burned-in) |
|---------|-------|----------|-----------------|----------------------|-----------------|-----------|-------------------------|----------------------|
| 1 | Welcome | 16s | `/` (marketing homepage) | **Remotion:** `WelcomeScreen` with Call IQ logo lockup. Optional B-roll: slow pan of calliqlabs.com hero. | Static center frame; subtle 2% scale-in over 4s | Logo fade-up (frames 0–30); tagline slide-in at frame 45 | Welcome to Call IQ — the AI voice receptionist built for home service businesses that never want to miss a lead. | **Welcome to Call IQ** |
| 2 | What Call IQ Solves | 16s | `/dashboard/calls` | **Remotion:** `FeatureScreen` — missed-call stat card. Optional live capture: scroll recent calls list showing answered vs. missed. | Slow push-in on stat card (62% missed after hours) | Bullet list stagger: 15-frame delay per item; stat counter pulse | Every missed call is lost revenue. When your crew is on a job site, Call IQ answers instantly, qualifies callers, and books appointments — around the clock. | **Never miss another opportunity** · Answers in under 2 seconds |
| 3 | AI Voice Agents | 16s | `/dashboard/agent` | **Remotion:** `FeatureScreen` with agent icon. **Live (optional):** open AI Agent page, highlight Sarah / shimmer voice selector. | Pan left across voice options; settle on Sarah card | Lower third slides in at frame 20; voice waveform idle animation | Configure intelligent voice agents that sound human, pull answers from your knowledge base, and hand off to your team when it matters. | **Natural AI voice agents** · Sarah — Warm & Professional |
| 4 | Lead Management | 16s | `/dashboard/leads` | **Remotion:** lead capture bullets. **Live (optional):** kanban view with Maria Gonzalez, David Chen, Jennifer Walsh cards visible. | Horizontal pan across lead pipeline columns | Lead avatars fade in sequentially; 94% stat highlight glow | Every caller is scored, tagged, and synced to your dashboard — Maria's kitchen leak, David's AC issue, Jennifer's panel upgrade — ready for follow-up. | **Instant lead capture** · 94% capture rate |
| 5 | Call Analytics | 16s | `/dashboard/analytics` | **Remotion:** analytics feature card. **Live (required for cut-down):** KPI row showing 1,284 total calls, 49% conversion. | Zoom from full dashboard to analytics KPI strip | Chart bars grow upward over 60 frames; period label fade-in | Track 1,284 calls this month with 96% answer rate. See conversion trends, agent performance, and cost savings in one executive dashboard. | **1,284 calls · 49% conversion · 96% answered** |
| 6 | Appointment Booking | 16s | `/dashboard/calendar` | **Remotion:** calendar booking bullets. **Live (optional):** calendar with Maria 2:30 PM plumbing, David 3:30 PM diagnostic. | Tilt-down from week view to today's appointments | Calendar cell highlight pulse on booked slots | Call IQ checks Google Calendar or Outlook availability and books on the spot — like Maria's 2:30 PM plumbing visit or David's AC diagnostic at 3:30. | **Automated appointment booking** · Syncs Google & Outlook |
| 7 | CRM Automation | 16s | `/dashboard/integrations` | **Remotion:** integration logos (HubSpot, Salesforce, Zoho). **Live (optional):** integrations page with HubSpot connected badge. | Static; logo badges orbit slowly (3°/frame) | CRM logos scale-in with bounce easing | Every call outcome triggers CRM updates — contacts created in HubSpot, deals moved in Salesforce, call notes logged automatically. | **CRM automation built in** · HubSpot · Salesforce · Zoho |
| 8 | Multi-tenant Management | 16s | `/call-iq/tenants` | **Remotion:** multi-location feature card. **Live (admin only):** tenant switcher if available. | Wide shot pulling back to reveal three org tiles | Org name chips slide in: Northline, Cascade Dental, Pacific Ridge | Agencies and multi-location operators manage isolated orgs — separate numbers, agents, and billing — from one admin console. | **Built for agencies & multi-location** |
| 9 | End Benefits | 16s | `/dashboard/analytics` (ROI tab) | **Remotion:** closing stat card — $3,051 monthly savings. **Live (optional):** cost comparison widget. | Push-in on savings figure; hold 2s before outro | Savings number count-up 0→3051 over 45 frames; CTA button glow | Northline Home Services saves over $3,000 monthly versus a full-time receptionist while capturing 49% more qualified leads. Start your free trial at calliqlabs.com. | **$3,051/mo saved** · **calliqlabs.com** |

---

## Production Notes

- **Intro bumper (4s)** and **outro bumper (4s)** bookend all scenes — see `remotion-scene-map.md` for exact frame offsets.
- Scene durations are ~16s each (487 frames for scenes 1–6; 486 frames for 7–9) including 2.5s chapter intro card.
- Voiceover pace target: 140 WPM. Scene 9 CTA must remain audible before outro fade.
- All captions use Inter Bold, white on semi-transparent `#0A0A0Acc`, bottom-third placement (avoid narration bar overlap at y=980).

## Key Demo Data References

| Data point | Source |
|------------|--------|
| 1,284 calls, 49% conversion | `demo-assets/sample-analytics.json` |
| Maria Gonzalez, David Chen, Jennifer Walsh | `demo-assets/sample-leads.json` |
| Sarah / +1 (720) 555-0188 | `demo-data.json` → `agents.northline` |
| $3,051 savings | `sample-analytics.json` → `costSavings.monthlySavings` |
