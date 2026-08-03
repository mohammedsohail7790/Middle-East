# Storyboard — Video 2: Client Onboarding

**Composition ID:** `ClientOnboarding`  
**Goal:** Walk a new customer through signup, organization setup, plan selection, and go-live — from account creation to first dashboard view in six minutes.  
**Target audience:** Business owners and office managers implementing Call IQ for the first time.  
**Demo tenant:** Northline Home Services — Rachel Torres, Denver  
**Length:** 6:00 (10,800 frames @ 30 fps)  
**Scenes:** 10

---

## Scene-by-Scene Breakdown

| Scene # | Title | Duration | Dashboard Route | Screen Recording Plan | Camera Movement | Animation | Voiceover (full script) | Captions (burned-in) |
|---------|-------|----------|-----------------|----------------------|-----------------|-----------|-------------------------|----------------------|
| 1 | Sign Up | 36s | `/signup` | **Live:** Record signup form fill — email `rachel@northlinehome.com`, business name Northline Home Services LLC, Create Account click. **Remotion:** `OnboardingScreen` Step 1 mirror. | Static browser chrome; cursor moves field-to-field | Fields populate with typewriter effect (8 chars/s); button pulse on complete | Rachel Torres signs up Northline Home Services in under two minutes. Enter your work email, a secure password, and your business name. | **Step 1 — Sign Up** · rachel@northlinehome.com |
| 2 | Email Verification | 36s | `/signup` (verify) | **Live:** Six-digit code entry `738294`, Verify Email click. Show success toast. | Center on verification input; slight zoom on submit | Checkmark draw animation (frames 400–450); green success flash | Verify your email to secure the account. Call IQ sends a six-digit code — enter it to continue to organization setup. | **Step 2 — Verify Email** · Code: 738294 |
| 3 | Organization Creation | 36s | `/onboarding` | **Live:** Organization name, industry Home Services, team size 12–25. **Remotion:** Step 3 fields. | Pan down form as each field completes | Progress stepper advances (step 3 of 5 highlights) | Create your organization workspace. This is where your team, AI agents, phone numbers, and integrations live. | **Step 3 — Organization** · Northline Home Services |
| 4 | Select Plan | 36s | `/onboarding` (plan step) | **Live:** Select Professional plan card ($149/mo). Highlight 2,000 minutes and 14-day trial badge. | Horizontal compare of Starter vs Professional; settle on Professional | Plan card border glow cyan; price tick-up animation | Choose the Professional plan at $149 per month with 2,000 included minutes. Start with a 14-day free trial — upgrade or cancel anytime. | **Professional — $149/mo** · 2,000 min · 14-day trial |
| 5 | Onboarding Wizard | 36s | `/onboarding` | **Live:** Setup wizard overview — Business Info ✓, Calendar in progress, CRM pending, Phone pending. | Wide shot of 4-step wizard sidebar | Step icons animate: checkmark, spinner, empty, empty | The setup wizard walks you through business info, calendar, CRM, and phone number — four steps to go live. | **Setup Wizard** · 4 steps to go live |
| 6 | Business Info | 36s | `/dashboard/settings` | **Live:** Settings → services, hours Mon–Fri 7am–7pm, service area Denver Metro. **Remotion:** Step 6 fields. | Scroll through services list; pause on hours | Service tags fade in; map radius circle expand (decorative) | Tell Call IQ about Northline Home Services — Emergency Plumbing, HVAC Repair, Electrical Diagnostics, Water Heater Install across the Denver Metro area. | **Business Info** · Denver Metro · 35 mi radius |
| 7 | Calendar Setup | 36s | `/dashboard/calendar` | **Live:** Connect Google Calendar OAuth flow (or connected state). Set 60-min booking, 15-min buffer. | Click Connect Calendar → authorized state | Google logo connect pulse; calendar grid populate | Connect Google Calendar so Call IQ checks real-time availability and creates events when appointments are booked on a call. | **Google Calendar connected** · 60 min slots · 15 min buffer |
| 8 | CRM Connection | 36s | `/dashboard/integrations` | **Live:** HubSpot tile → Connect → show Sync Contacts + Auto-log Calls enabled. | Pan across integration grid to HubSpot | HubSpot orange badge slides in; toggle switches flip on | Link HubSpot to automatically sync leads, log call activities, and trigger workflows after every conversation. | **HubSpot connected** · Auto-sync contacts & calls |
| 9 | Phone Number | 36s | `/dashboard/phone-numbers` | **Live:** Search area code 720 → select +1 (720) 555-0188 → assign Main Receptionist (Sarah). Purchase confirm. | Zoom on number search results → assignment dropdown | Phone number digit reveal; assignment checkmark | Search Denver area code 720, purchase +1 (720) 555-0188, and assign it to Main Receptionist. Your AI agent is live in minutes. | **+1 (720) 555-0188** · Assigned to Sarah |
| 10 | Dashboard Overview | 36s | `/dashboard` | **Live:** Full dashboard — today's stats: 47 calls, 23 leads, 8 appointments, 49% conversion. Recent calls list. **Remotion:** `DashboardOverviewScreen`. | Slow pull-back revealing full dashboard layout | KPI counters count up; recent call rows slide in | You're live. Today's dashboard shows 47 calls, 23 leads, 8 appointments booked, and a 49% conversion rate — all before lunch. | **You're live!** · 47 calls · 49% conversion today |

---

## Production Notes

- Each scene ~36s (1,069–1,070 frames) allows unhurried cursor movement in live recordings.
- Use `BrowserChrome` wrapper in Remotion for signup scenes; live recordings should match chrome styling.
- Pre-seed staging tenant before recording Scene 10 so KPIs match script (or use demo mode).
- Rachel Torres persona should feel operational, not technical — VO tone: relieved/optimistic on Scene 10.

## Key Demo Data References

| Field | Value | Source |
|-------|-------|--------|
| Signup email | rachel@northlinehome.com | `sample-businesses.json` → onboarding |
| Verification code | 738294 | `sample-businesses.json` |
| Plan | Professional $149/mo | `demo-data.json` → primaryTenant |
| Phone | +1 (720) 555-0188 | `demo-data.json` → phoneNumbers[0] |
| Today stats | 47 calls, 49% conversion | `sample-appointments.json` → todayStats |
