# Storyboard — Video 6: Analytics & Reporting

**Composition ID:** `AnalyticsReporting`  
**Goal:** Walk leadership through Call IQ analytics — call volume, missed calls, conversion, appointments, agent performance, and ROI cost savings.  
**Target audience:** Business owners, GMs, and marketing leads reviewing monthly performance.  
**Demo tenant:** Northline Home Services (Denver)  
**Reporting period:** May 15 – Jun 14, 2026  
**Length:** 5:00 (9,000 frames @ 30 fps)  
**Scenes:** 6

---

## Scene-by-Scene Breakdown

| Scene # | Title | Duration | Dashboard Route | Screen Recording Plan | Camera Movement | Animation | Voiceover (full script) | Captions (burned-in) |
|---------|-------|----------|-----------------|----------------------|-----------------|-----------|-------------------------|----------------------|
| 1 | Total Calls | 49s | `/dashboard/analytics` | **Live:** Analytics overview — KPI cards: Total Calls 1,284 (+18%), Answered 1,233 (96.0%), Avg Duration 3:48. Daily volume chart visible. **Remotion:** `AnalyticsScreen` totalCalls metrics. | Push-in from full page to KPI row | Counter count-up 0→1284; chart bars grow Mon–Sun | Northline Home Services handled 1,284 inbound calls this month — 96% answered with an average duration of 3 minutes 48 seconds. | **1,284 calls · 96% answered · 3:48 avg** |
| 2 | Missed Calls | 49s | `/dashboard/analytics` (missed tab) | **Live:** Missed Calls 51 (−32%), After Hours 32 (63%), Recovery Rate 78%. Trend chart declining. | Pan to missed-call breakdown donut chart | Red→green trend arrow; recovery rate ring fill 78% | Only 51 missed calls — down 32% from last month. 63% were after hours; 78% recovered via callback or SMS follow-up. | **51 missed (−32%)** · **78% recovered** |
| 3 | Conversion Rate | 49s | `/dashboard/analytics` (conversion) | **Live:** Conversion Rate 49% (+6%), Leads 634 (+22%), Appointments 296 (+15%). Funnel visualization. | Zoom into conversion funnel graphic | Funnel stages fill top→bottom; percentage labels tick up | 49% conversion rate generated 634 qualified leads and 296 booked appointments — up 22% and 15% respectively. | **49% conversion · 634 leads · 296 appointments** |
| 4 | Appointments | 49s | `/dashboard/analytics` (appointments) | **Live:** Booked 296, Completed 261 (88.2% show rate), Rescheduled 21 (7.1%). Day-of-week bar chart. | Scroll to appointment breakdown section | Show-rate arc animate to 88.2%; bar chart highlight Fri peak | 296 appointments booked with an 88.2% show rate. Only 7% rescheduled — most common services: HVAC diagnostic and emergency plumbing. | **88.2% show rate · 7% rescheduled** |
| 5 | Agent Performance | 49s | `/dashboard/analytics` (agents) | **Live:** Agent comparison — Sarah 96% satisfaction (892 calls), Alex 91% (341 calls), Escalation Rate 3.8% (−1.1%). | Horizontal pan across agent cards | Agent avatars rank by score; escalation badge shrink animation | Sarah scores 96% satisfaction on 892 calls. Alex handles sales qualification at 91%. Escalation rate dropped to 3.8%. | **Sarah 96% · Alex 91% · 3.8% escalation** |
| 6 | Cost Savings | 49s | `/dashboard/analytics` (ROI) | **Live:** Cost comparison widget — Call IQ $149/mo vs Receptionist $3,200/mo = **$3,051 saved** (95%). **Remotion:** costSavings metrics + lower third. | Dramatic push-in on $3,051 savings figure | Savings bar chart: red receptionist bar vs cyan Call IQ bar; delta highlight | At $149 per month versus $3,200 for a full-time receptionist, Northline saves $3,051 monthly — a 95% cost reduction with higher lead capture. | **$3,051/mo saved · 95% cost reduction** |

---

## Production Notes

- Each scene ~49s (1,474 frames) — tight pacing for executive summary format.
- Analytics page requires Professional plan in demo tenant (already set for Northline).
- All metrics must match `demo-assets/sample-analytics.json` exactly — verify before recording.
- Scene 6 is primary clip for marketing cut-downs and Motion.so ROI teasers.

## Key Demo Data References

| Metric | Value | Source |
|--------|-------|--------|
| Total calls | 1,284 | `sample-analytics.json` → summary.totalCalls |
| Conversion | 49% | `sample-analytics.json` → summary.conversionRate |
| Monthly savings | $3,051 | `sample-analytics.json` → costSavings.monthlySavings |
| Sarah satisfaction | 96% (892 calls) | `sample-analytics.json` → agentPerformance[0] |
| Reporting period | May 15 – Jun 14, 2026 | `sample-analytics.json` → reportingPeriod |
