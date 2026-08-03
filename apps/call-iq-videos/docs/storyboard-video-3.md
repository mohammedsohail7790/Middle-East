# Storyboard — Video 3: AI Agent Configuration

**Composition ID:** `AIAgentConfiguration`  
**Goal:** Deep-dive training on configuring an AI receptionist — knowledge base, personality, business rules, and pre-launch testing. Most comprehensive video in the series.  
**Target audience:** Operations managers and dispatch leads configuring agents for field service teams.  
**Demo tenant:** Summit Comfort HVAC (Boulder) — Marcus Chen  
**Phone:** +1 (303) 555-0147  
**Length:** 15:00 (27,000 frames @ 30 fps)  
**Scenes:** 13

---

## Scene-by-Scene Breakdown

| Scene # | Title | Duration | Dashboard Route | Screen Recording Plan | Camera Movement | Animation | Voiceover (full script) | Captions (burned-in) |
|---------|-------|----------|-----------------|----------------------|-----------------|-----------|-------------------------|----------------------|
| 1 | Agent Creation | 69s | `/dashboard/agent` | **Live:** New agent form — name Morgan, type Inbound Receptionist, voice cedar, English US. **Remotion:** `AgentConfigScreen` General tab. | Static on form; cursor selects voice dropdown | Tab underline slide; field values type in; lower third at frame 20 | Marcus Chen at Summit Comfort HVAC creates an HVAC receptionist named Morgan — inbound type, cedar voice, calm and knowledgeable tone. | **New Agent — Morgan** · Inbound Receptionist · cedar voice |
| 2 | Knowledge Base — PDFs | 69s | `/dashboard/knowledge` | **Live:** Documents tab — upload/show 4 PDFs: services guide (28p), maintenance plans (6p), warranty (4p), financing (3p). | Vertical scroll through document list | Upload progress bars complete; page count badges fade in | Upload service guides, maintenance plan pricing, warranty policies, and financing sheets. Call IQ indexes every page for RAG during live calls. | **Knowledge Base — 4 documents indexed** |
| 3 | Knowledge Base — Website Crawl | 69s | `/dashboard/knowledge` (Website tab) | **Live:** Enter summitcomforthvac.com, show 52 pages indexed, weekly Monday sync schedule. | Push-in on URL field → crawl results table | Crawl progress ring 0→100%; page count tick-up to 52 | Point Call IQ at summitcomforthvac.com. It crawled 52 pages — services, service areas, and seasonal promotions — synced every Monday. | **52 pages crawled** · Weekly sync Mondays 6 AM |
| 4 | Knowledge Base — FAQs | 69s | `/dashboard/knowledge` (FAQs tab) | **Live:** Add/edit 3 FAQs — hours, brands serviced, tune-up pricing ($149 standard). | Scroll through FAQ accordion items | FAQ cards expand one-by-one with 20-frame stagger | Add approved FAQ answers for hours, brands serviced, tune-up pricing, service areas, and financing — Morgan uses these as source of truth. | **FAQs — source of truth for live calls** |
| 5 | Personality — Tone & Greeting | 69s | `/dashboard/agent` (Greeting tab) | **Live:** Tone = Calm & Knowledgeable. Greeting: "Thank you for calling Summit Comfort HVAC! I'm Morgan. Are you calling about heating, cooling, or a maintenance plan?" | Focus on greeting textarea; highlight tone selector | Greeting text highlight sweep; tone pill selection glow | Set Morgan's calm, knowledgeable tone and craft the opening greeting callers hear on every inbound call. | **Opening greeting configured** |
| 6 | Personality — Instructions | 69s | `/dashboard/agent` (Instructions tab) | **Live:** Core instructions textarea — collect address/callback, prioritize no-cool emergencies, no exact replacement quotes. Escalation keywords field. | Split view: instructions left, escalation keywords right | Textarea scroll reveal; keyword tags pop in | Core instructions tell Morgan to collect address and callback number, prioritize no-cool emergencies, and never quote exact replacement prices. | **Core instructions + escalation keywords** |
| 7 | Business Rules — Hours | 69s | `/dashboard/settings` (business hours) | **Live:** Mon–Fri 7am–6pm, Sat 8am–2pm, after-hours emergency $89 trip fee. | Calendar grid highlight business vs after-hours blocks | Hour blocks color-fill; emergency badge pulse | Configure Boulder business hours and after-hours emergency dispatch — $89 trip fee for no-heat and no-cool emergencies. | **Boulder hours · $89 emergency trip fee** |
| 8 | Business Rules — Escalation | 69s | `/dashboard/agent` (Escalation tab) | **Live:** Keywords: manager, warranty dispute, legal. Sentiment = negative. Notify SMS + email dispatch@summitcomforthvac.com. Max 2 attempts. | Pan across escalation rule toggles | Toggle switches animate on; notification icons bounce | Escalate on keywords like manager, warranty dispute, or legal inquiry. Notify dispatch via SMS and email when sentiment turns negative. | **Escalation — SMS + email to dispatch** |
| 9 | Business Rules — Transfer | 69s | `/dashboard/agent` (Transfer tab) | **Live:** Dispatch, sales, emergency transfer numbers. Transfer greeting text. | Static; highlight each transfer line sequentially | Phone icons connect with animated lines between agent → dispatch | Route dispatch, sales, and emergency lines. When a caller asks for a manager, Morgan transfers to dispatch within 3 seconds. | **Transfer routes — dispatch · sales · emergency** |
| 10 | Business Rules — Appointments | 69s | `/dashboard/agent` (Appointments tab) | **Live:** 90-min diagnostic default, 4-hour minimum notice, service types list, confirmation SMS enabled. | Scroll appointment rules panel | Duration slider snap to 90 min; SMS toggle on with checkmark | 90-minute diagnostic slots, 4-hour minimum notice for standard visits, immediate dispatch for emergencies, and SMS reminders with tech en-route alerts. | **90-min diagnostics · SMS confirmations on** |
| 11 | Testing — Simulate | 69s | `/dashboard/simulator` | **Live:** Run no-cool scenario — caller: 92°F, newborn at home. Show agent response, intent Emergency HVAC, score 97%. | Simulator chat scroll; highlight score badge | Chat bubbles alternate fade-in; score ring animate 0→97% | Run a no-cool emergency scenario: 92 degrees, newborn at home. Morgan flags same-day dispatch and collects address — score 97%. | **Simulator — 97% score** · No-cool emergency |
| 12 | Testing — Review | 69s | `/dashboard/simulator` (Review tab) | **Live:** Review 3 test call transcripts. Flag Call #2 — quoted exact AC replacement price. | Scroll transcript list; red flag on Call #2 | Pass/fail badges; flagged row red border pulse | Review simulation transcripts. Call #2 flagged for quoting exact replacement price — update instructions before going live. | **Review transcripts** · Call #2 flagged for pricing |
| 13 | Testing — Improve | 69s | `/dashboard/agent` | **Live:** Show 3 instruction updates + 2 new FAQs applied. Re-test 96%. Deploy live on +1 (303) 555-0147. | Deploy button click → live status badge | Score count-up 96%; green LIVE badge; confetti subtle (5 particles) | After 3 instruction updates and 2 new FAQs, re-test scores hit 96%. Morgan goes live on +1 (303) 555-0147 — monitor the first 50 calls. | **Agent live — +1 (303) 555-0147** · Re-test 96% |

---

## Production Notes

- **Longest video (15 min)** — consider chapter markers for YouTube at each scene boundary (frame offsets in `remotion-scene-map.md`).
- Switch dashboard tenant to Summit Comfort HVAC before any live recording.
- Scene duration ~69s (2,071–2,072 frames) accommodates detailed form interactions.
- Knowledge base PDFs should exist in staging uploads folder before recording Scene 2.

## Key Demo Data References

| Field | Value | Source |
|-------|-------|--------|
| Agent Morgan / cedar voice | HVAC Receptionist | `demo-data.json` → agents.summit |
| Phone | +1 (303) 555-0147 | `demo-data.json` → phoneNumbers[2] |
| 52 pages crawled | Website index | `sample-businesses.json` → summit.knowledgeBase |
| Simulator score 97% | No-cool scenario | `sample-businesses.json` → simulatorScenarios[0] |
| Re-test 96% | Post-improvement | Scene 13 script / composition |
